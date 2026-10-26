import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { dayNote, memo, planEvent, review } from "../schema/life";

/**
 * 생활 기록 (0024) — `docs/15-today.md`.
 *
 * - 일정(`plan_event`)은 **space** 로 좁힌다. 고칠 수 있는지는 부르는 쪽이 그 space 의 역할로 본다
 *   (캘린더 구독과 같은 규칙 — `spaceOfPlanEvent` 로 space 를 얻어 확인).
 * - 메모·기분·회고는 **`user_id`** 로 좁힌다. 모든 질의가 userId 를 받는다 — 남의 것은 없는 것과 같다.
 */

/* ------------------------------------------------------------------ 일정 */

export type PlanEventRow = {
  id: string;
  spaceId: string;
  createdBy: string;
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  color: string | null;
  location: string | null;
  note: string | null;
};

export type PlanEventInput = {
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  color: string | null;
  location: string | null;
  note: string | null;
};

const planColumns = {
  id: planEvent.id,
  spaceId: planEvent.spaceId,
  createdBy: planEvent.createdBy,
  title: planEvent.title,
  startsOn: planEvent.startsOn,
  startTime: planEvent.startTime,
  endsOn: planEvent.endsOn,
  endTime: planEvent.endTime,
  color: planEvent.color,
  location: planEvent.location,
  note: planEvent.note,
};

/** `from..to` 와 겹치는 일정. 여러 날 일정은 걸친 날마다 화면이 자른다. */
export async function planEvents(spaceIds: readonly string[], from: string, to: string): Promise<PlanEventRow[]> {
  if (spaceIds.length === 0) return [];
  return db
    .select(planColumns)
    .from(planEvent)
    .where(and(inArray(planEvent.spaceId, [...spaceIds]), lte(planEvent.startsOn, to), gte(planEvent.endsOn, from)))
    .orderBy(asc(planEvent.startsOn), asc(planEvent.startTime));
}

/** 한 줄 — 권한은 부르는 쪽이 이미 확인했다(`spaceOfPlanEvent` 로). */
export async function getPlanEvent(id: string): Promise<PlanEventRow | null> {
  const [row] = await db.select(planColumns).from(planEvent).where(eq(planEvent.id, id)).limit(1);
  return row ?? null;
}

export async function spaceOfPlanEvent(id: string): Promise<string | null> {
  const [row] = await db.select({ spaceId: planEvent.spaceId }).from(planEvent).where(eq(planEvent.id, id)).limit(1);
  return row?.spaceId ?? null;
}

export async function addPlanEvent(spaceId: string, userId: string, input: PlanEventInput): Promise<string> {
  const id = newId();
  await db.insert(planEvent).values({ id, spaceId, createdBy: userId, ...input });
  return id;
}

/** 다른 space 로 옮기는 것도 여기서 — 옮길 곳의 권한은 부르는 쪽이 본다. */
export async function updatePlanEvent(id: string, input: PlanEventInput & { spaceId?: string }): Promise<void> {
  await db
    .update(planEvent)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(planEvent.id, id));
}

export async function removePlanEvent(id: string): Promise<void> {
  await db.delete(planEvent).where(eq(planEvent.id, id));
}

/* ------------------------------------------------------------------ 메모 */

export type MemoRow = {
  id: string;
  text: string;
  doneAt: string | null;
  movedTo: string | null;
  createdAt: string;
  updatedAt: string;
};

function toMemo(row: typeof memo.$inferSelect): MemoRow {
  return {
    id: row.id,
    text: row.text,
    doneAt: row.doneAt?.toISOString() ?? null,
    movedTo: row.movedTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 메모함 — 아직 안 끝낸 것은 전부(새것 먼저), 끝낸 것은 최근 `doneLimit` 개. */
export async function listMemos(userId: string, doneLimit = 30): Promise<{ open: MemoRow[]; done: MemoRow[] }> {
  const [open, done] = await Promise.all([
    db.select().from(memo).where(and(eq(memo.userId, userId), isNull(memo.doneAt))).orderBy(desc(memo.createdAt)),
    db
      .select()
      .from(memo)
      .where(and(eq(memo.userId, userId), isNotNull(memo.doneAt)))
      .orderBy(desc(memo.doneAt))
      .limit(doneLimit),
  ]);
  return { open: open.map(toMemo), done: done.map(toMemo) };
}

export async function countOpenMemos(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(memo)
    .where(and(eq(memo.userId, userId), isNull(memo.doneAt)));
  return Number(row?.n ?? 0);
}

export async function getMemo(userId: string, id: string): Promise<MemoRow | null> {
  const [row] = await db.select().from(memo).where(and(eq(memo.userId, userId), eq(memo.id, id))).limit(1);
  return row === undefined ? null : toMemo(row);
}

export async function addMemo(userId: string, text: string): Promise<string> {
  const id = newId();
  await db.insert(memo).values({ id, userId, text });
  return id;
}

/** 그 사람 것이 아니면 아무 일도 없다 — 고친 줄 수로 알린다. */
export async function updateMemo(
  userId: string,
  id: string,
  patch: { text?: string; done?: boolean; movedTo?: string | null },
): Promise<boolean> {
  const set: Partial<typeof memo.$inferInsert> = { updatedAt: new Date() };
  if (patch.text !== undefined) set.text = patch.text;
  if (patch.done !== undefined) set.doneAt = patch.done ? new Date() : null;
  if (patch.movedTo !== undefined) set.movedTo = patch.movedTo;
  const rows = await db
    .update(memo)
    .set(set)
    .where(and(eq(memo.userId, userId), eq(memo.id, id)))
    .returning({ id: memo.id });
  return rows.length > 0;
}

export async function removeMemo(userId: string, id: string): Promise<boolean> {
  const rows = await db.delete(memo).where(and(eq(memo.userId, userId), eq(memo.id, id))).returning({ id: memo.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ 기분 · 하루 회고 */

export type DayNoteRow = {
  date: string;
  mood: number | null;
  energy: number | null;
  note: string | null;
  retro: string | null;
  updatedAt: string;
};

export async function dayNotes(userId: string, from: string, to: string): Promise<DayNoteRow[]> {
  const rows = await db
    .select()
    .from(dayNote)
    .where(and(eq(dayNote.userId, userId), gte(dayNote.date, from), lte(dayNote.date, to)))
    .orderBy(asc(dayNote.date));
  return rows.map((r) => ({
    date: r.date,
    mood: r.mood,
    energy: r.energy,
    note: r.note,
    retro: r.retro,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 준 칸만 고친다 (`undefined` 는 그대로, `null` 은 지움). 다 비면 줄을 지운다. */
export async function saveDayNote(
  userId: string,
  date: string,
  patch: { mood?: number | null; energy?: number | null; note?: string | null; retro?: string | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(dayNote)
      .where(and(eq(dayNote.userId, userId), eq(dayNote.date, date)))
      .for("update");
    const next = {
      mood: patch.mood !== undefined ? patch.mood : (current?.mood ?? null),
      energy: patch.energy !== undefined ? patch.energy : (current?.energy ?? null),
      note: patch.note !== undefined ? patch.note : (current?.note ?? null),
      retro: patch.retro !== undefined ? patch.retro : (current?.retro ?? null),
    };
    const empty = next.mood === null && next.energy === null && next.note === null && next.retro === null;
    if (empty) {
      if (current !== undefined) await tx.delete(dayNote).where(and(eq(dayNote.userId, userId), eq(dayNote.date, date)));
      return;
    }
    await tx
      .insert(dayNote)
      .values({ userId, date, ...next })
      .onConflictDoUpdate({ target: [dayNote.userId, dayNote.date], set: { ...next, updatedAt: new Date() } });
  });
}

/* ------------------------------------------------------------------ 주간 · 월간 회고 */

export type ReviewKind = "week" | "month";

export type ReviewRow = {
  id: string;
  kind: ReviewKind;
  period: string;
  text: string;
  source: string;
  updatedAt: string;
};

export async function listReviews(userId: string, limit = 60): Promise<ReviewRow[]> {
  const rows = await db
    .select()
    .from(review)
    .where(eq(review.userId, userId))
    .orderBy(desc(review.period), asc(review.kind))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "month" ? "month" : "week",
    period: r.period,
    text: r.text,
    source: r.source,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 그 기간의 회고를 쓰거나 고친다. 빈 글이면 지운다. */
export async function saveReview(userId: string, kind: ReviewKind, period: string, text: string): Promise<void> {
  if (text.trim() === "") {
    await db.delete(review).where(and(eq(review.userId, userId), eq(review.kind, kind), eq(review.period, period)));
    return;
  }
  await db
    .insert(review)
    .values({ id: newId(), userId, kind, period, text, source: "manual" })
    .onConflictDoUpdate({
      target: [review.userId, review.kind, review.period],
      set: { text, source: "manual", updatedAt: new Date() },
    });
}

/* ------------------------------------------------------------------ Bento 에서 옮기기 */

export type LifeImport = {
  events: (PlanEventInput & { sourceId: string })[];
  memos: { sourceId: string; text: string; done: boolean; createdAt: string; updatedAt: string }[];
  days: { date: string; mood: number | null; energy: number | null; note: string | null; retro: string | null }[];
  reviews: { kind: ReviewKind; period: string; text: string; createdAt: string }[];
};

export type LifeImportResult = {
  events: { added: number; existing: number };
  memos: { added: number; existing: number };
  days: { added: number; filled: number };
  reviews: { added: number; existing: number };
};

/** 옮겨 온 것의 id — 사람마다 다르게(두 사람의 Bento id 가 같아도 부딪히지 않게), 다시 옮겨도 같게. */
export function importedId(prefix: string, userId: string, sourceId: string): string {
  return `${prefix}_${userId.slice(0, 10)}_${sourceId}`.slice(0, 160);
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * 한 번에 옮긴다 (한 트랜잭션). **새것만 더한다** — 이미 옮긴 일정·메모·회고는 건드리지 않아서, 도란에서 고친 것이
 * 다시 옮겨도 덮이지 않는다. 하루 기록은 **빈칸만 채운다** (도란에서 적은 기분·회고가 이긴다).
 * 일정은 `spaceId`(그 사람의 개인 space)에, 나머지는 그 사람 것으로.
 */
export async function importLife(userId: string, spaceId: string, data: LifeImport): Promise<LifeImportResult> {
  return db.transaction(async (tx) => {
    const result: LifeImportResult = {
      events: { added: 0, existing: 0 },
      memos: { added: 0, existing: 0 },
      days: { added: 0, filled: 0 },
      reviews: { added: 0, existing: 0 },
    };

    for (const part of chunks(data.events, 500)) {
      const rows = await tx
        .insert(planEvent)
        .values(
          part.map(({ sourceId, ...fields }) => ({
            id: importedId("bk", userId, sourceId),
            spaceId,
            createdBy: userId,
            ...fields,
          })),
        )
        .onConflictDoNothing({ target: planEvent.id })
        .returning({ id: planEvent.id });
      result.events.added += rows.length;
      result.events.existing += part.length - rows.length;
    }

    for (const part of chunks(data.memos, 500)) {
      const rows = await tx
        .insert(memo)
        .values(
          part.map((m) => ({
            id: importedId("bm", userId, m.sourceId),
            userId,
            text: m.text,
            doneAt: m.done ? new Date(m.updatedAt) : null,
            createdAt: new Date(m.createdAt),
            updatedAt: new Date(m.updatedAt),
          })),
        )
        .onConflictDoNothing({ target: memo.id })
        .returning({ id: memo.id });
      result.memos.added += rows.length;
      result.memos.existing += part.length - rows.length;
    }

    for (const day of data.days) {
      const [current] = await tx
        .select()
        .from(dayNote)
        .where(and(eq(dayNote.userId, userId), eq(dayNote.date, day.date)))
        .for("update");
      if (current === undefined) {
        await tx.insert(dayNote).values({ userId, ...day });
        result.days.added += 1;
        continue;
      }
      const patch = {
        mood: current.mood ?? day.mood,
        energy: current.energy ?? day.energy,
        note: current.note ?? day.note,
        retro: current.retro ?? day.retro,
      };
      const changed =
        patch.mood !== current.mood || patch.energy !== current.energy || patch.note !== current.note || patch.retro !== current.retro;
      if (changed) {
        await tx
          .update(dayNote)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(dayNote.userId, userId), eq(dayNote.date, day.date)));
        result.days.filled += 1;
      }
    }

    for (const part of chunks(data.reviews, 500)) {
      const rows = await tx
        .insert(review)
        .values(
          part.map((r) => ({
            id: newId(),
            userId,
            kind: r.kind,
            period: r.period,
            text: r.text,
            source: "import",
            createdAt: new Date(r.createdAt),
            updatedAt: new Date(r.createdAt),
          })),
        )
        .onConflictDoNothing({ target: [review.userId, review.kind, review.period] })
        .returning({ id: review.id });
      result.reviews.added += rows.length;
      result.reviews.existing += part.length - rows.length;
    }

    return result;
  });
}
