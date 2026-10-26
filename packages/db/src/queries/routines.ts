import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { routine, routineLog, routineTimer } from "../schema/routine";

/**
 * 루틴 동기화 (`docs/13-sync.md` §루틴) — Bento(맥)와 iPhone 앱이 같은 루틴을 쓴다.
 *
 * 체크리스트 동기화와 규칙이 같다:
 *   - 고칠 때마다 새 변경 번호(`routine_rev_seq`). 받는 쪽은 "그 번호 다음에 바뀐 것"을 묻는다.
 *   - 지우기는 `deleted_at` 표시. 받는 쪽이 "지워졌다"를 받아 가야 하므로.
 *   - 나중에 고친 쪽이 이긴다. 버린 것은 `stale` 와 함께 **지금 서버 값(`current`)** 을 돌려준다.
 *   - 미래 시각은 지금으로 깎는다 — 시계가 앞선 기기가 영원히 이기지 않게.
 *
 * 다른 점은 주인이다. 루틴은 문서가 아니라 **사람 한 명의 것**이라 `user_id` 로만 좁힌다.
 * 남의 id 로 덮으려 하면 `other-user` 로 받지 않는다.
 */

/** 고칠 때마다 새 변경 번호. 빠뜨리면 그 수정은 다른 기기로 안 간다. */
function bump() {
  return { rev: sql<number>`nextval('routine_rev_seq')` };
}

export const ROUTINE_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "violet"] as const;
export const ROUTINE_SLOTS = ["morning", "afternoon", "evening", "anytime"] as const;

export type RoutineFreq = "daily" | "weekly";

export type SyncRoutine = {
  id: string;
  title: string;
  color: string;
  slot: string;
  schedule: { freq: RoutineFreq; weekdays: number[] };
  goalMin: number | null;
  startDate: string;
  archivedAt: string | null;
  pauses: { from: string; to: string }[];
  order: number;
  createdAt: string;
  deleted: boolean;
  updatedAt: string;
  rev: number;
};

export type SyncRoutineSession = { start: string; end: string; secs: number };

export type SyncRoutineLog = {
  /** `<routineId>:<YYYY-MM-DD>` */
  id: string;
  routineId: string;
  date: string;
  done: boolean;
  doneAt: string | null;
  secs: number;
  sessions: SyncRoutineSession[];
  deleted: boolean;
  updatedAt: string;
  rev: number;
};

export type SyncRoutineTimer = {
  /** 비었으면 멈춘 상태. */
  routineId: string | null;
  date: string | null;
  startedAt: string | null;
  updatedAt: string;
  rev: number;
};

export type RoutineChanges = {
  routines: SyncRoutine[];
  logs: SyncRoutineLog[];
  /** `since` 다음에 바뀌었을 때만. */
  timer: SyncRoutineTimer | null;
  cursor: number;
  more: boolean;
};

/** 기록 한 줄의 id. 두 기기가 따로 만들어도 같은 줄이 된다. */
export function routineLogId(routineId: string, date: string): string {
  return `${routineId}:${date}`;
}

/* ------------------------------------------------------------------ 받기 */

/**
 * `since` 다음에 바뀐 것 — **지운 것까지.** 돌려준 `cursor` 를 다음 `since` 로 보내면 된다.
 * 한쪽이 한도에 걸리면 둘 다 그 번호까지만 돌려준다 — 다음 번에 빠지는 것이 없게.
 */
export async function routineChanges(userId: string, since: number, limit = 1000): Promise<RoutineChanges> {
  const [routines, logs, timers] = await Promise.all([
    db
      .select()
      .from(routine)
      .where(and(eq(routine.userId, userId), sql`${routine.rev} > ${since}`))
      .orderBy(asc(routine.rev))
      .limit(limit),
    db
      .select()
      .from(routineLog)
      .where(and(eq(routineLog.userId, userId), sql`${routineLog.rev} > ${since}`))
      .orderBy(asc(routineLog.rev))
      .limit(limit),
    db
      .select()
      .from(routineTimer)
      .where(and(eq(routineTimer.userId, userId), sql`${routineTimer.rev} > ${since}`))
      .limit(1),
  ]);

  const more = routines.length === limit || logs.length === limit;
  const cap = Math.min(
    routines.length === limit ? Number(routines.at(-1)!.rev) : Infinity,
    logs.length === limit ? Number(logs.at(-1)!.rev) : Infinity,
  );
  const keepR = routines.filter((r) => Number(r.rev) <= cap);
  const keepL = logs.filter((l) => Number(l.rev) <= cap);
  const timer = timers[0] !== undefined && Number(timers[0].rev) <= cap ? timers[0] : undefined;
  const cursor = Math.max(
    since,
    ...keepR.map((r) => Number(r.rev)),
    ...keepL.map((l) => Number(l.rev)),
    ...(timer ? [Number(timer.rev)] : []),
  );
  return {
    routines: keepR.map(toSyncRoutine),
    logs: keepL.map(toSyncLog),
    timer: timer ? toSyncTimer(timer) : null,
    cursor,
    more,
  };
}

/* ------------------------------------------------------------------ 화면 */

export type RoutineState = {
  /** 지우지 않은 루틴 전부 (보관한 것 포함). */
  routines: SyncRoutine[];
  /** 지우지 않은 기록 — `from` 이후만. */
  logs: SyncRoutineLog[];
  /** 돌고 있는 타이머. 없으면 null. */
  timer: SyncRoutineTimer | null;
};

/**
 * 웹 화면이 보는 지금 상태 — **그 사람 것만**(`user_id`). 동기화의 변경 번호와 무관하게 지운 것은 뺀다.
 * 기록은 히트맵 한 해치를 넉넉히 덮도록 부르는 쪽이 `from` 을 정한다.
 */
export async function routineState(userId: string, from: string): Promise<RoutineState> {
  const [routines, logs, timers] = await Promise.all([
    db
      .select()
      .from(routine)
      .where(and(eq(routine.userId, userId), isNull(routine.deletedAt)))
      .orderBy(asc(routine.sortOrder), asc(routine.createdAt)),
    db
      .select()
      .from(routineLog)
      .where(and(eq(routineLog.userId, userId), isNull(routineLog.deletedAt), sql`${routineLog.date} >= ${from}`)),
    db.select().from(routineTimer).where(eq(routineTimer.userId, userId)).limit(1),
  ]);
  const t = timers[0];
  return {
    routines: routines.map(toSyncRoutine),
    logs: logs.map(toSyncLog),
    timer: t !== undefined && t.routineId !== null ? toSyncTimer(t) : null,
  };
}

function toSyncRoutine(r: typeof routine.$inferSelect): SyncRoutine {
  const weekdays = Array.isArray(r.weekdays)
    ? r.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  return {
    id: r.id,
    title: r.title,
    color: r.color,
    slot: r.slot,
    schedule: { freq: r.freq === "weekly" ? "weekly" : "daily", weekdays },
    goalMin: r.goalMin,
    startDate: r.startDate,
    archivedAt: r.archivedAt,
    // jsonb 는 모양이 보장되지 않는다 — 읽을 때 확인한다.
    pauses: Array.isArray(r.pauses)
      ? r.pauses.filter(
          (p): p is { from: string; to: string } =>
            typeof p === "object" && p !== null && typeof p.from === "string" && typeof p.to === "string",
        )
      : [],
    order: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    deleted: r.deletedAt !== null,
    updatedAt: r.updatedAt.toISOString(),
    rev: Number(r.rev),
  };
}

function toSyncLog(l: typeof routineLog.$inferSelect): SyncRoutineLog {
  return {
    id: l.id,
    routineId: l.routineId,
    date: l.date,
    done: l.done,
    doneAt: l.doneAt?.toISOString() ?? null,
    secs: l.secs,
    sessions: Array.isArray(l.sessions)
      ? l.sessions.filter(
          (s): s is SyncRoutineSession =>
            typeof s === "object" &&
            s !== null &&
            typeof s.start === "string" &&
            typeof s.end === "string" &&
            typeof s.secs === "number",
        )
      : [],
    deleted: l.deletedAt !== null,
    updatedAt: l.updatedAt.toISOString(),
    rev: Number(l.rev),
  };
}

function toSyncTimer(t: typeof routineTimer.$inferSelect): SyncRoutineTimer {
  return {
    routineId: t.routineId,
    date: t.date,
    startedAt: t.startedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    rev: Number(t.rev),
  };
}

/* ------------------------------------------------------------------ 올리기 */

/** 받아 주는 id — Bento 의 `rt_…`, UUID 를 다 받되 이상한 글자는 막는다. 기록 id 의 `:` 도 여기서 통과한다. */
const SYNC_ID = /^[A-Za-z0-9_.:-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type IncomingRoutine = {
  id: string;
  updatedAt: string;
  deleted?: boolean;
  title?: string;
  color?: string;
  slot?: string;
  schedule?: { freq?: unknown; weekdays?: unknown };
  goalMin?: number | null;
  startDate?: string;
  archivedAt?: string | null;
  pauses?: unknown;
  order?: number;
  createdAt?: string;
};

export type IncomingRoutineLog = {
  id?: string;
  routineId: string;
  date: string;
  updatedAt: string;
  deleted?: boolean;
  done?: boolean;
  doneAt?: string | null;
  secs?: number;
  sessions?: unknown;
};

export type IncomingRoutineTimer = {
  routineId: string | null;
  date?: string | null;
  startedAt?: string | null;
  updatedAt: string;
};

export type RoutineApplyResult = {
  applied: number;
  /** 서버 것이 더 새로워 버린 id. 타이머는 `"timer"`. */
  stale: string[];
  rejected: { id: string; reason: string }[];
  /** 버린 것들의 지금 서버 값 — 받는 쪽이 곧바로 덮어쓴다. */
  current: { routines: SyncRoutine[]; logs: SyncRoutineLog[]; timer: SyncRoutineTimer | null };
};

function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}

type CleanRoutine = {
  title?: string;
  color?: string;
  slot?: string;
  freq?: RoutineFreq;
  weekdays?: number[];
  goalMin?: number | null;
  startDate?: string;
  archivedAt?: string | null;
  pauses?: { from: string; to: string }[];
  sortOrder?: number;
};

/** 들어온 루틴의 모양을 믿지 않는다 — 틀리면 null. 빠진 칸은 그대로 둔다(undefined). */
function cleanRoutine(r: IncomingRoutine): CleanRoutine | null {
  const out: CleanRoutine = {};
  if (r.title !== undefined) {
    const title = typeof r.title === "string" ? r.title.trim().slice(0, 120) : "";
    if (title === "") return null;
    out.title = title;
  }
  if (r.color !== undefined) {
    if (!(ROUTINE_COLORS as readonly string[]).includes(r.color)) return null;
    out.color = r.color;
  }
  if (r.slot !== undefined) {
    if (!(ROUTINE_SLOTS as readonly string[]).includes(r.slot)) return null;
    out.slot = r.slot;
  }
  if (r.schedule !== undefined) {
    if (typeof r.schedule !== "object" || r.schedule === null) return null;
    const freq = r.schedule.freq;
    if (freq !== "daily" && freq !== "weekly") return null;
    const raw = r.schedule.weekdays ?? [];
    if (!Array.isArray(raw)) return null;
    const days = [...new Set(raw.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
      (a, b) => a - b,
    );
    if (freq === "weekly" && days.length === 0) return null;
    out.freq = freq;
    out.weekdays = freq === "weekly" ? days : [];
  }
  if (r.goalMin !== undefined) {
    if (r.goalMin !== null && (!Number.isInteger(r.goalMin) || r.goalMin < 1 || r.goalMin > 600)) return null;
    out.goalMin = r.goalMin;
  }
  if (r.startDate !== undefined) {
    if (!isDay(r.startDate)) return null;
    out.startDate = r.startDate;
  }
  if (r.archivedAt !== undefined) {
    if (r.archivedAt !== null && !isDay(r.archivedAt)) return null;
    out.archivedAt = r.archivedAt;
  }
  if (r.pauses !== undefined) {
    if (!Array.isArray(r.pauses)) return null;
    out.pauses = r.pauses
      .filter(
        (p): p is { from: string; to: string } =>
          typeof p === "object" && p !== null && isDay((p as { from?: unknown }).from) && isDay((p as { to?: unknown }).to),
      )
      .slice(0, 200)
      .map((p) => ({ from: p.from, to: p.to }));
  }
  if (r.order !== undefined) {
    if (!Number.isInteger(r.order) || r.order < 0 || r.order > 100_000) return null;
    out.sortOrder = r.order;
  }
  return out;
}

type CleanLog = {
  done?: boolean;
  doneAt?: Date | null;
  secs?: number;
  sessions?: SyncRoutineSession[];
};

function cleanLog(l: IncomingRoutineLog, when: (iso: unknown) => Date | null): CleanLog | null {
  const out: CleanLog = {};
  if (l.done !== undefined) {
    if (typeof l.done !== "boolean") return null;
    out.done = l.done;
  }
  if (l.doneAt !== undefined) {
    if (l.doneAt === null) out.doneAt = null;
    else {
      const at = when(l.doneAt);
      if (at === null) return null;
      out.doneAt = at;
    }
  }
  if (l.secs !== undefined) {
    if (!Number.isInteger(l.secs) || l.secs < 0 || l.secs > 86_400) return null;
    out.secs = l.secs;
  }
  if (l.sessions !== undefined) {
    if (!Array.isArray(l.sessions)) return null;
    out.sessions = l.sessions
      .filter(
        (s): s is SyncRoutineSession =>
          typeof s === "object" &&
          s !== null &&
          typeof (s as SyncRoutineSession).start === "string" &&
          typeof (s as SyncRoutineSession).end === "string" &&
          Number.isInteger((s as SyncRoutineSession).secs) &&
          (s as SyncRoutineSession).secs >= 0 &&
          (s as SyncRoutineSession).secs <= 43_200,
      )
      .slice(-100)
      .map((s) => ({ start: s.start.slice(0, 40), end: s.end.slice(0, 40), secs: s.secs }));
  }
  return out;
}

/**
 * 바뀐 것을 받는다 — 루틴을 먼저, 기록을 다음에, 타이머를 마지막에.
 * 루틴을 지우면 그 루틴의 기록도 지운 표시를 하고, 그 루틴의 타이머가 돌고 있었으면 멈춘다.
 */
export async function applyRoutineChanges(
  userId: string,
  incoming: { routines?: IncomingRoutine[]; logs?: IncomingRoutineLog[]; timer?: IncomingRoutineTimer | null },
): Promise<RoutineApplyResult> {
  const result: RoutineApplyResult = {
    applied: 0,
    stale: [],
    rejected: [],
    current: { routines: [], logs: [], timer: null },
  };
  const staleRoutines: string[] = [];
  const staleLogs: string[] = [];
  const now = Date.now();
  const when = (iso: unknown): Date | null => {
    if (typeof iso !== "string") return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return new Date(Math.min(t, now));
  };

  for (const r of incoming.routines ?? []) {
    const id = typeof r?.id === "string" ? r.id : "";
    if (!SYNC_ID.test(id) || id.includes(":")) {
      result.rejected.push({ id: id.slice(0, 100), reason: "id" });
      continue;
    }
    const at = when(r.updatedAt);
    if (at === null) {
      result.rejected.push({ id, reason: "updatedAt" });
      continue;
    }
    const existing = (await db.select().from(routine).where(eq(routine.id, id)).limit(1))[0];
    if (existing !== undefined && existing.userId !== userId) {
      result.rejected.push({ id, reason: "other-user" });
      continue;
    }
    if (existing !== undefined && existing.updatedAt.getTime() > at.getTime()) {
      result.stale.push(id);
      staleRoutines.push(id);
      continue;
    }

    if (r.deleted === true) {
      // 모르는 것·이미 지운 것을 지우라는 것 — 할 일이 없다.
      if (existing === undefined || existing.deletedAt !== null) continue;
      await db.update(routine).set({ deletedAt: at, updatedAt: at, ...bump() }).where(eq(routine.id, id));
      // 그 루틴의 기록은 따라 지운다 — 남겨 두면 다른 기기에 주인 없는 기록이 쌓인다.
      await db
        .update(routineLog)
        .set({ deletedAt: at, updatedAt: at, ...bump() })
        .where(and(eq(routineLog.userId, userId), eq(routineLog.routineId, id), isNull(routineLog.deletedAt)));
      await db
        .update(routineTimer)
        .set({ routineId: null, date: null, startedAt: null, updatedAt: at, ...bump() })
        .where(and(eq(routineTimer.userId, userId), eq(routineTimer.routineId, id)));
      result.applied += 1;
      continue;
    }

    const fields = cleanRoutine(r);
    if (fields === null) {
      result.rejected.push({ id, reason: "shape" });
      continue;
    }
    if (existing === undefined) {
      if (fields.title === undefined || fields.freq === undefined || fields.startDate === undefined) {
        result.rejected.push({ id, reason: "missing" });
        continue;
      }
      await db.insert(routine).values({
        id,
        userId,
        title: fields.title,
        color: fields.color ?? "blue",
        slot: fields.slot ?? "anytime",
        freq: fields.freq,
        weekdays: fields.weekdays ?? [],
        goalMin: fields.goalMin ?? null,
        startDate: fields.startDate,
        archivedAt: fields.archivedAt ?? null,
        pauses: fields.pauses ?? [],
        sortOrder: fields.sortOrder ?? 0,
        createdAt: when(r.createdAt) ?? at,
        updatedAt: at,
      });
    } else {
      await db
        .update(routine)
        .set({ ...fields, deletedAt: null, updatedAt: at, ...bump() })
        .where(eq(routine.id, id));
    }
    result.applied += 1;
  }

  for (const l of incoming.logs ?? []) {
    const routineId = typeof l?.routineId === "string" ? l.routineId : "";
    const date = typeof l?.date === "string" ? l.date : "";
    const id = routineLogId(routineId, date);
    if (!SYNC_ID.test(routineId) || routineId.includes(":") || !isDay(date) || (l.id !== undefined && l.id !== id)) {
      result.rejected.push({ id: (l?.id ?? id).toString().slice(0, 100), reason: "id" });
      continue;
    }
    const at = when(l.updatedAt);
    if (at === null) {
      result.rejected.push({ id, reason: "updatedAt" });
      continue;
    }
    const existing = (await db.select().from(routineLog).where(eq(routineLog.id, id)).limit(1))[0];
    if (existing !== undefined && existing.userId !== userId) {
      result.rejected.push({ id, reason: "other-user" });
      continue;
    }
    if (existing !== undefined && existing.updatedAt.getTime() > at.getTime()) {
      result.stale.push(id);
      staleLogs.push(id);
      continue;
    }
    if (l.deleted === true) {
      if (existing === undefined || existing.deletedAt !== null) continue;
      await db.update(routineLog).set({ deletedAt: at, updatedAt: at, ...bump() }).where(eq(routineLog.id, id));
      result.applied += 1;
      continue;
    }
    const fields = cleanLog(l, when);
    if (fields === null) {
      result.rejected.push({ id, reason: "shape" });
      continue;
    }
    const done = fields.done ?? existing?.done ?? false;
    const doneAt =
      fields.doneAt !== undefined ? fields.doneAt : done ? (existing?.doneAt ?? at) : null;
    if (existing === undefined) {
      await db.insert(routineLog).values({
        id,
        userId,
        routineId,
        date,
        done,
        doneAt: done ? doneAt : null,
        secs: fields.secs ?? 0,
        sessions: fields.sessions ?? [],
        updatedAt: at,
      });
    } else {
      await db
        .update(routineLog)
        .set({
          done,
          doneAt: done ? doneAt : null,
          ...(fields.secs !== undefined ? { secs: fields.secs } : {}),
          ...(fields.sessions !== undefined ? { sessions: fields.sessions } : {}),
          deletedAt: null,
          updatedAt: at,
          ...bump(),
        })
        .where(eq(routineLog.id, id));
    }
    result.applied += 1;
  }

  let timerStale = false;
  if (incoming.timer !== undefined && incoming.timer !== null) {
    const t = incoming.timer;
    const at = when(t.updatedAt);
    const running = t.routineId !== null && t.routineId !== undefined;
    const startedAt = running ? when(t.startedAt) : null;
    if (
      at === null ||
      (running && (typeof t.routineId !== "string" || !SYNC_ID.test(t.routineId) || !isDay(t.date) || startedAt === null))
    ) {
      result.rejected.push({ id: "timer", reason: "shape" });
    } else {
      const existing = (await db.select().from(routineTimer).where(eq(routineTimer.userId, userId)).limit(1))[0];
      if (existing !== undefined && existing.updatedAt.getTime() > at.getTime()) {
        result.stale.push("timer");
        timerStale = true;
      } else {
        const values = {
          routineId: running ? (t.routineId as string) : null,
          date: running ? (t.date as string) : null,
          startedAt,
          updatedAt: at,
        };
        if (existing === undefined) await db.insert(routineTimer).values({ userId, ...values });
        else await db.update(routineTimer).set({ ...values, ...bump() }).where(eq(routineTimer.userId, userId));
        result.applied += 1;
      }
    }
  }

  if (staleRoutines.length > 0 || staleLogs.length > 0 || timerStale) {
    const [routines, logs, timers] = await Promise.all([
      staleRoutines.length === 0 ? [] : db.select().from(routine).where(inArray(routine.id, staleRoutines)),
      staleLogs.length === 0 ? [] : db.select().from(routineLog).where(inArray(routineLog.id, staleLogs)),
      timerStale ? db.select().from(routineTimer).where(eq(routineTimer.userId, userId)).limit(1) : [],
    ]);
    result.current = {
      routines: routines.map(toSyncRoutine),
      logs: logs.map(toSyncLog),
      timer: timers[0] ? toSyncTimer(timers[0]) : null,
    };
  }
  return result;
}
