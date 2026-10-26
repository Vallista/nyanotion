"use server";

import {
  applyRoutineChanges,
  routineState,
  type IncomingRoutine,
  type IncomingRoutineLog,
  type IncomingRoutineTimer,
  type SyncRoutine,
  type SyncRoutineLog,
} from "@nyanotion/db";
import {
  RoutineRuleError,
  applyRoutineArchive,
  applyRoutineCheck,
  applyRoutineMinutes,
  checkRoutineDate,
  commitRoutineTimer,
  homeNow,
  isRealDay,
  newRoutineId,
  normalizeRoutineInput,
  sortRoutines,
  type RoutineInputData,
  type RoutineItem,
  type RoutineLogItem,
  type RoutineTimerItem,
} from "@nyanotion/shared";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireViewer } from "@/lib/session";

/**
 * 루틴의 서버 동작 — **그 사람 것만** 고친다(`user_id`). 권한은 로그인 하나로 끝난다: 루틴은 문서가 아니라서
 * 가족에게 보이는 길이 없다 (`docs/13-sync.md` §루틴).
 *
 * 규칙은 `@nyanotion/shared` 의 루틴 규칙(맥·폰과 같은 것)으로 다음 상태를 만들고, 쓰기는 동기화와 같은
 * `applyRoutineChanges` 로 한다 — 그래서 웹에서 고친 것도 새 변경 번호를 받아 맥·폰으로 그대로 간다.
 * 고친 시각은 서버의 지금이다.
 *
 * 실패는 throw 하지 않고 `{ ok: false, message }` 로 돌려준다 — 운영 빌드는 서버 동작의 오류 문구를 가린다.
 */

export type RoutineActionResult = {
  ok: boolean;
  message?: string;
  /** 타이머를 멈추거나 넘길 때 기록된 것 */
  committed?: { title: string; secs: number; capped: boolean; reachedGoal: boolean };
  reachedGoal?: boolean;
  id?: string;
};

function refresh(): void {
  revalidatePath("/routines");
  revalidatePath("/", "layout");
}

function toItem(r: SyncRoutine): RoutineItem {
  return {
    id: r.id,
    title: r.title,
    color: r.color,
    slot: r.slot,
    schedule: r.schedule,
    goalMin: r.goalMin,
    startDate: r.startDate,
    archivedAt: r.archivedAt,
    pauses: r.pauses,
    order: r.order,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toLog(l: SyncRoutineLog): RoutineLogItem {
  return {
    routineId: l.routineId,
    date: l.date,
    done: l.done,
    doneAt: l.doneAt,
    secs: l.secs,
    sessions: l.sessions,
    updatedAt: l.updatedAt,
  };
}

function outRoutine(r: RoutineItem, at: string): IncomingRoutine {
  return {
    id: r.id,
    updatedAt: at,
    title: r.title,
    color: r.color,
    slot: r.slot,
    schedule: r.schedule,
    goalMin: r.goalMin,
    startDate: r.startDate,
    archivedAt: r.archivedAt,
    pauses: r.pauses,
    order: r.order,
    createdAt: r.createdAt,
  };
}

function outLog(routineId: string, date: string, log: RoutineLogItem | null, at: string): IncomingRoutineLog {
  if (log === null) return { routineId, date, updatedAt: at, deleted: true };
  return {
    routineId,
    date,
    updatedAt: at,
    done: log.done,
    doneAt: log.doneAt,
    secs: log.secs,
    sessions: log.sessions,
  };
}

function outTimer(timer: RoutineTimerItem | null, at: string): IncomingRoutineTimer {
  return timer === null
    ? { routineId: null, updatedAt: at }
    : { routineId: timer.routineId, date: timer.date, startedAt: timer.startedAt, updatedAt: at };
}

async function load(userId: string, from: string) {
  const state = await routineState(userId, from);
  return {
    routines: state.routines.map(toItem),
    logs: state.logs.map(toLog),
    timer:
      state.timer !== null && state.timer.routineId !== null && state.timer.date !== null && state.timer.startedAt !== null
        ? { routineId: state.timer.routineId, date: state.timer.date, startedAt: state.timer.startedAt }
        : null,
  };
}

/**
 * 타이머를 다룰 때 읽기 — 타이머는 시작한 날에 기록하므로, 그 날이 `from` 보다 앞이면(자정을 넘겼거나 며칠 켜 둔 채)
 * 그 날부터 다시 읽는다. 안 그러면 그날 기록을 못 보고 새 줄로 덮어 앞서 쌓은 시간·완료가 사라진다.
 */
async function loadWithTimer(userId: string, from: string) {
  const state = await load(userId, from);
  return state.timer !== null && state.timer.date < from ? load(userId, state.timer.date) : state;
}

async function write(
  userId: string,
  changes: { routines?: IncomingRoutine[]; logs?: IncomingRoutineLog[]; timer?: IncomingRoutineTimer },
): Promise<string | null> {
  const result = await applyRoutineChanges(userId, {
    routines: changes.routines ?? [],
    logs: changes.logs ?? [],
    ...(changes.timer !== undefined ? { timer: changes.timer } : {}),
  });
  if (result.rejected.length > 0) return `저장하지 못했어요 (${result.rejected[0]!.reason})`;
  return null;
}

function fail(error: unknown): RoutineActionResult {
  // 로그인 만료(`redirect`) 같은 Next 의 신호는 삼키지 않는다.
  unstable_rethrow(error);
  if (error instanceof RoutineRuleError) return { ok: false, message: error.message };
  console.error("routine action", error);
  return { ok: false, message: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
}

/** 돌던 타이머를 기록으로 옮기는 변경들. 없으면 빈 묶음. */
function stopChanges(
  state: Awaited<ReturnType<typeof load>>,
  now: Date,
): { logs: IncomingRoutineLog[]; committed?: RoutineActionResult["committed"] } {
  const timer = state.timer;
  if (timer === null) return { logs: [] };
  const routine = state.routines.find((r) => r.id === timer.routineId);
  if (routine === undefined) return { logs: [] };
  const log = state.logs.find((l) => l.routineId === timer.routineId && l.date === timer.date);
  const commit = commitRoutineTimer(routine, timer, log, now);
  if (commit === null) return { logs: [] };
  const at = now.toISOString();
  return {
    logs: [outLog(routine.id, timer.date, commit.log, at)],
    committed: { title: routine.title, secs: commit.addedSecs, capped: commit.capped, reachedGoal: commit.reachedGoal },
  };
}

/* ------------------------------------------------------------------ 기록 */

export async function routineCheckAction(routineId: string, date: string, done: boolean): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    if (!isRealDay(date)) return { ok: false, message: "날짜는 YYYY-MM-DD 형식이어야 합니다" };
    const state = await load(viewer.userId, date);
    const routine = state.routines.find((r) => r.id === routineId);
    if (routine === undefined) return { ok: false, message: "루틴을 찾을 수 없어요." };
    const at = new Date().toISOString();
    const log = state.logs.find((l) => l.routineId === routineId && l.date === date);
    const next = applyRoutineCheck(routine, log, date, done, today, at);
    const error = await write(viewer.userId, { logs: [outLog(routineId, date, next, at)] });
    refresh();
    return error === null ? { ok: true } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

export async function routineMinutesAction(routineId: string, date: string, minutes: number): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    if (!isRealDay(date)) return { ok: false, message: "날짜는 YYYY-MM-DD 형식이어야 합니다" };
    const state = await load(viewer.userId, date);
    const routine = state.routines.find((r) => r.id === routineId);
    if (routine === undefined) return { ok: false, message: "루틴을 찾을 수 없어요." };
    const at = new Date().toISOString();
    const log = state.logs.find((l) => l.routineId === routineId && l.date === date);
    const next = applyRoutineMinutes(routine, log, date, minutes, today, at);
    const error = await write(viewer.userId, { logs: [outLog(routineId, date, next.log, at)] });
    refresh();
    return error === null ? { ok: true, reachedGoal: next.reachedGoal } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ 타이머 */

/** 다른 루틴 타이머가 돌고 있으면 기록하고 넘어간다. 같은 루틴이면 그대로. */
export async function routineTimerStartAction(routineId: string): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const state = await loadWithTimer(viewer.userId, today);
    const routine = state.routines.find((r) => r.id === routineId);
    if (routine === undefined) return { ok: false, message: "루틴을 찾을 수 없어요." };
    if (routine.archivedAt !== null) return { ok: false, message: "보관한 루틴은 타이머를 켤 수 없어요." };
    checkRoutineDate(routine, today, today);
    if (state.timer?.routineId === routineId) return { ok: true };
    const now = new Date();
    const at = now.toISOString();
    const stop = stopChanges(state, now);
    const error = await write(viewer.userId, {
      logs: stop.logs,
      timer: outTimer({ routineId, date: today, startedAt: at }, at),
    });
    refresh();
    return error === null ? { ok: true, committed: stop.committed } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

export async function routineTimerStopAction(): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const state = await loadWithTimer(viewer.userId, today);
    if (state.timer === null) return { ok: true };
    const now = new Date();
    const stop = stopChanges(state, now);
    const error = await write(viewer.userId, { logs: stop.logs, timer: outTimer(null, now.toISOString()) });
    refresh();
    return error === null ? { ok: true, committed: stop.committed } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ 루틴 */

export async function routineSaveAction(id: string | null, input: RoutineInputData): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const clean = normalizeRoutineInput(input);
    const state = await load(viewer.userId, today);
    const at = new Date().toISOString();
    let item: RoutineItem;
    if (id === null) {
      const order = state.routines.reduce((m, r) => Math.max(m, r.order), -1) + 1;
      item = { id: newRoutineId(), ...clean, archivedAt: null, pauses: [], order, createdAt: at, updatedAt: at };
    } else {
      const current = state.routines.find((r) => r.id === id);
      if (current === undefined) return { ok: false, message: "루틴을 찾을 수 없어요." };
      item = { ...current, ...clean, updatedAt: at };
    }
    const error = await write(viewer.userId, { routines: [outRoutine(item, at)] });
    refresh();
    return error === null ? { ok: true, id: item.id } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

/** 보관하면 돌던 타이머는 기록하고 멈춘다. */
export async function routineArchiveAction(id: string, archived: boolean): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const state = await loadWithTimer(viewer.userId, today);
    const current = state.routines.find((r) => r.id === id);
    if (current === undefined) return { ok: false, message: "루틴을 찾을 수 없어요." };
    const now = new Date();
    const at = now.toISOString();
    const next = applyRoutineArchive(current, archived, today, at);
    const stopping = archived && state.timer?.routineId === id;
    const stop = stopping ? stopChanges(state, now) : { logs: [] };
    const error = await write(viewer.userId, {
      routines: [outRoutine(next, at)],
      logs: stop.logs,
      ...(stopping ? { timer: outTimer(null, at) } : {}),
    });
    refresh();
    return error === null ? { ok: true } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

/** 루틴을 지운다 — 서버가 그 루틴의 기록도 지운 표시를 하고, 그 루틴 타이머면 멈춘다. */
export async function routineDeleteAction(id: string): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const state = await load(viewer.userId, today);
    if (!state.routines.some((r) => r.id === id)) return { ok: false, message: "루틴을 찾을 수 없어요." };
    const at = new Date().toISOString();
    const error = await write(viewer.userId, { routines: [{ id, updatedAt: at, deleted: true }] });
    refresh();
    return error === null ? { ok: true } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}

/** `ids` 순서대로 0,1,2… — 바뀐 것만 보낸다. 목록에 없는 것은 뒤로. */
export async function routineReorderAction(ids: string[]): Promise<RoutineActionResult> {
  try {
    const viewer = await requireViewer();
    const { day: today } = homeNow();
    const state = await load(viewer.userId, today);
    const at = new Date().toISOString();
    const seen = new Set<string>();
    const wanted = new Map<string, number>();
    let next = 0;
    for (const id of ids) {
      if (seen.has(id) || !state.routines.some((r) => r.id === id)) continue;
      seen.add(id);
      wanted.set(id, next++);
    }
    for (const r of sortRoutines(state.routines)) {
      if (!seen.has(r.id)) wanted.set(r.id, next++);
    }
    const changed = state.routines
      .filter((r) => wanted.get(r.id) !== r.order)
      .map((r) => outRoutine({ ...r, order: wanted.get(r.id) ?? r.order, updatedAt: at }, at));
    if (changed.length === 0) return { ok: true };
    const error = await write(viewer.userId, { routines: changed });
    refresh();
    return error === null ? { ok: true } : { ok: false, message: error };
  } catch (error) {
    return fail(error);
  }
}
