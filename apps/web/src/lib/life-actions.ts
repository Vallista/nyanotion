"use server";

import {
  addMemo,
  addPlanEvent,
  createDocument,
  getMemo,
  getPlanEvent,
  removeMemo,
  removePlanEvent,
  saveDayNote,
  saveReview,
  setContent,
  spaceOfPlanEvent,
  updateMemo,
  updatePlanEvent,
  type ReviewKind,
} from "@nyanotion/db";
import {
  LifeRuleError,
  cleanDay,
  cleanLevel,
  homeNow,
  memoTitle,
  movePlanEvent,
  normalizeMemo,
  normalizePlanEvent,
  periodRange,
  roleAllows,
} from "@nyanotion/shared";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { quickAddAction } from "@/lib/checklist-actions";
import { requireViewer, type Viewer } from "@/lib/session";

/**
 * 생활 기록의 서버 동작 — 일정 · 메모 · 기분 · 회고 (`docs/15-today.md`).
 *
 * - 일정은 **space** 가 경계다 (캘린더 구독·체크리스트와 같다). 보려면 그 space 에 들어갈 수 있어야 하고,
 *   적고 고치려면 그 space 에 쓸 수 있어야 한다(손님은 못 한다). 없는 일정과 남의 일정은 같은 말로 거절한다.
 * - 메모·기분·회고는 **로그인한 사람 것만** 다룬다 — 질의가 전부 userId 로 좁힌다.
 *
 * 실패는 throw 하지 않고 `{ ok: false, message }` 로 돌려준다 — 운영 빌드는 서버 동작의 오류 문구를 가린다.
 */

export type LifeResult = { ok: boolean; message?: string; id?: string };

function refresh(): void {
  revalidatePath("/", "layout");
}

function fail(error: unknown): LifeResult {
  // 로그인 만료(`redirect`) 같은 Next 의 신호는 삼키지 않는다.
  unstable_rethrow(error);
  if (error instanceof LifeRuleError) return { ok: false, message: error.message };
  console.error("life action", error);
  return { ok: false, message: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
}

function writableSpace(viewer: Viewer, spaceId: string): boolean {
  const target = viewer.spaces.find((space) => space.id === spaceId);
  return target !== undefined && roleAllows(target.baseRole, "editor");
}

/** 그 일정을 고칠 수 있는 사람인지. 없는 일정·남의 일정·읽기만 되는 일정은 모두 같은 거절. */
async function eventGate(id: string): Promise<{ viewer: Viewer; spaceId: string } | null> {
  const viewer = await requireViewer();
  const spaceId = await spaceOfPlanEvent(id);
  if (spaceId === null || !viewer.spaceIds.includes(spaceId) || !writableSpace(viewer, spaceId)) return null;
  return { viewer, spaceId };
}

const NOT_FOUND: LifeResult = { ok: false, message: "일정을 찾을 수 없어요." };

/* ------------------------------------------------------------------ 일정 */

export type PlanEventDraft = {
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string | null;
  endTime: string | null;
  color: string | null;
  location: string | null;
  note: string | null;
};

export async function addPlanEventAction(spaceId: string, draft: PlanEventDraft): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    if (!writableSpace(viewer, spaceId)) return { ok: false, message: "이 공간에는 일정을 적을 수 없어요." };
    const fields = normalizePlanEvent(draft);
    const id = await addPlanEvent(spaceId, viewer.userId, fields);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

/** 고친다. `spaceId` 를 주면 그 공간으로 옮긴다 (옮길 곳에도 쓸 수 있어야 한다). */
export async function updatePlanEventAction(id: string, draft: PlanEventDraft, spaceId?: string): Promise<LifeResult> {
  try {
    const gate = await eventGate(id);
    if (gate === null) return NOT_FOUND;
    if (spaceId !== undefined && spaceId !== gate.spaceId && !writableSpace(gate.viewer, spaceId)) {
      return { ok: false, message: "그 공간으로는 옮길 수 없어요." };
    }
    const fields = normalizePlanEvent(draft);
    await updatePlanEvent(id, { ...fields, ...(spaceId !== undefined ? { spaceId } : {}) });
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

/** 캘린더에서 끌어 옮긴다 — 길이는 그대로. 지금 값은 DB 에서 읽는다(화면이 들고 있던 것은 낡았을 수 있다). */
export async function movePlanEventAction(id: string, day: string, time: string | null): Promise<LifeResult> {
  try {
    const gate = await eventGate(id);
    if (gate === null) return NOT_FOUND;
    const current = await getPlanEvent(id);
    if (current === null) return NOT_FOUND;
    const target = cleanDay(day);
    if (target === null) return { ok: false, message: "날짜가 올바르지 않아요." };
    const fields = normalizePlanEvent(movePlanEvent(normalizePlanEvent(current), target, time));
    await updatePlanEvent(id, fields);
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function removePlanEventAction(id: string): Promise<LifeResult> {
  try {
    const gate = await eventGate(id);
    if (gate === null) return NOT_FOUND;
    await removePlanEvent(id);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

/* ------------------------------------------------------------------ 메모 */

const NO_MEMO: LifeResult = { ok: false, message: "메모를 찾을 수 없어요." };

export async function addMemoAction(text: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const id = await addMemo(viewer.userId, normalizeMemo(text));
    refresh();
    return { ok: true, id };
  } catch (error) {
    return fail(error);
  }
}

export async function editMemoAction(id: string, text: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const ok = await updateMemo(viewer.userId, id, { text: normalizeMemo(text) });
    refresh();
    return ok ? { ok: true } : NO_MEMO;
  } catch (error) {
    return fail(error);
  }
}

export async function setMemoDoneAction(id: string, done: boolean): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const ok = await updateMemo(viewer.userId, id, done ? { done: true } : { done: false, movedTo: null });
    refresh();
    return ok ? { ok: true } : NO_MEMO;
  } catch (error) {
    return fail(error);
  }
}

export async function removeMemoAction(id: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const ok = await removeMemo(viewer.userId, id);
    refresh();
    return ok ? { ok: true } : NO_MEMO;
  } catch (error) {
    return fail(error);
  }
}

/** 메모 → 할 일 (첫 줄이 제목). 그 공간의 기본 체크리스트로 간다 — 체크리스트와 같은 길(`quickAddAction`). */
export async function memoToTodoAction(id: string, spaceId: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const found = await getMemo(viewer.userId, id);
    if (found === null) return NO_MEMO;
    const itemId = await quickAddAction(spaceId, { title: memoTitle(found.text) });
    await updateMemo(viewer.userId, id, { done: true, movedTo: `todo:${itemId}` });
    refresh();
    return { ok: true, id: itemId };
  } catch (error) {
    unstable_rethrow(error);
    // quickAddAction 은 권한 거절을 Error 로 던진다 — 그 문구는 사람에게 보여도 된다.
    if (error instanceof Error && !(error instanceof LifeRuleError)) return { ok: false, message: error.message };
    return fail(error);
  }
}

/** 메모 → 내 문서. 첫 줄이 제목, 나머지가 문단이 된다. 새 문서라 아무도 편집 중이 아니다(`setContent` 를 써도 되는 자리). */
export async function memoToDocumentAction(id: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const found = await getMemo(viewer.userId, id);
    if (found === null) return NO_MEMO;
    const title = memoTitle(found.text) || "메모";
    const docId = await createDocument({ spaceId: viewer.personalSpace.id, userId: viewer.userId, title });
    const lines = found.text.split("\n");
    const firstIndex = lines.findIndex((line) => line.trim() !== "");
    const body = lines.slice(firstIndex + 1);
    await setContent(docId, toParagraphs(body), viewer.userId);
    await updateMemo(viewer.userId, id, { done: true, movedTo: `doc:${docId}` });
    refresh();
    return { ok: true, id: docId };
  } catch (error) {
    return fail(error);
  }
}

function toParagraphs(lines: string[]) {
  const blocks = lines.map((line) => ({
    id: Math.random().toString(36).slice(2, 14),
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: line.trim() === "" ? [] : [{ type: "text", text: line, styles: {} }],
    children: [],
  }));
  return blocks.length === 0 ? [{ ...emptyParagraph() }] : blocks;
}

function emptyParagraph() {
  return {
    id: Math.random().toString(36).slice(2, 14),
    type: "paragraph",
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    content: [],
    children: [],
  };
}

/* ------------------------------------------------------------------ 기분 · 하루 회고 */

export async function saveDayNoteAction(
  date: string,
  patch: { mood?: number | null; energy?: number | null; note?: string | null; retro?: string | null },
): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    const day = cleanDay(date);
    if (day === null) return { ok: false, message: "날짜가 올바르지 않아요." };
    if (day > homeNow().day) return { ok: false, message: "앞날의 기록은 남길 수 없어요." };
    const clean: Parameters<typeof saveDayNote>[2] = {};
    if (patch.mood !== undefined) clean.mood = cleanLevel(patch.mood);
    if (patch.energy !== undefined) clean.energy = cleanLevel(patch.energy);
    if (patch.note !== undefined) clean.note = textOrNull(patch.note, 1000);
    if (patch.retro !== undefined) clean.retro = textOrNull(patch.retro, 8000);
    await saveDayNote(viewer.userId, day, clean);
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

function textOrNull(value: string | null, max: number): string | null {
  if (value === null) return null;
  const v = value.replace(/\r\n/g, "\n").trim();
  return v === "" ? null : v.slice(0, max);
}

/* ------------------------------------------------------------------ 주간 · 월간 회고 */

export async function saveReviewAction(kind: ReviewKind, period: string, text: string): Promise<LifeResult> {
  try {
    const viewer = await requireViewer();
    if (kind !== "week" && kind !== "month") return { ok: false, message: "회고 종류가 올바르지 않아요." };
    const range = periodRange(kind, period);
    if (range === null) return { ok: false, message: "기간이 올바르지 않아요." };
    if (range.from > homeNow().day) return { ok: false, message: "아직 오지 않은 기간이에요." };
    await saveReview(viewer.userId, kind, period, (text ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000));
    refresh();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
