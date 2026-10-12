import {
  DEFAULT_REMIND_TIME,
  asRepeat,
  nextDueOn,
  positionAfterLast,
  type ChecklistRepeat,
} from "@nyanotion/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { checklist, checklistItem } from "../schema/checklist";
import { document } from "../schema/document";
import { purchaseItem, type PurchaseState } from "../schema/purchase";
import { createDocument } from "./documents";

export type ChecklistSummary = {
  id: string;
  documentId: string;
  title: string;
  icon: string | null;
  spaceId: string;
  open: number;
  done: number;
  /** 아직 안 한 것 중 가장 이른 날짜. 없으면 null. */
  nextDueOn: string | null;
};

export type ChecklistItemRow = {
  id: string;
  checklistId: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
  dueOn: string | null;
  dueTime: string | null;
  repeat: ChecklistRepeat;
  assigneeId: string | null;
  position: string;
  purchaseItemId: string | null;
  /** 구매로 넘겼다면 그 살 것의 지금 상태. 살 것을 뺐으면 null. */
  purchaseState: PurchaseState | null;
  createdBy: string;
};

/** 여러 체크리스트에 걸친 일정 한 줄 — "오늘 할 일" 화면용. */
export type AgendaRow = ChecklistItemRow & {
  checklistTitle: string;
  documentId: string;
  spaceId: string;
};

function toItem(
  row: typeof checklistItem.$inferSelect,
  purchaseState: string | null,
): ChecklistItemRow {
  return {
    id: row.id,
    checklistId: row.checklistId,
    title: row.title,
    done: row.done,
    doneAt: row.doneAt?.toISOString() ?? null,
    doneBy: row.doneBy,
    dueOn: row.dueOn,
    dueTime: row.dueTime,
    repeat: asRepeat(row.repeat),
    assigneeId: row.assigneeId,
    position: row.position,
    purchaseItemId: row.purchaseItemId,
    purchaseState: purchaseState as PurchaseState | null,
    createdBy: row.createdBy,
  };
}

/** `YYYY-MM-DD` 의 "일". 매달 반복이 돌아갈 원래 날로 쓴다. */
function dayOfMonth(day: string | null): number | null {
  return day === null ? null : Number(day.slice(8, 10));
}

/* ------------------------------------------------------------------ 읽기 */

/**
 * 체크리스트 목록. **space 로 좁힌다** — 문서와 같은 경계다 (`listItems` 와 같은 규칙).
 * 모래상자에 간 문서의 체크리스트는 안 보인다.
 */
export async function listChecklists(spaceIds: readonly string[]): Promise<ChecklistSummary[]> {
  if (spaceIds.length === 0) return [];
  const rows = await db
    .select({
      id: checklist.id,
      documentId: checklist.documentId,
      title: document.title,
      icon: document.icon,
      spaceId: document.spaceId,
      open: sql<number>`count(${checklistItem.id}) filter (where ${checklistItem.done} = false)`,
      done: sql<number>`count(${checklistItem.id}) filter (where ${checklistItem.done} = true)`,
      nextDueOn: sql<string | null>`min(${checklistItem.dueOn}) filter (where ${checklistItem.done} = false)`,
    })
    .from(checklist)
    .innerJoin(document, eq(checklist.documentId, document.id))
    .leftJoin(checklistItem, eq(checklistItem.checklistId, checklist.id))
    .where(and(inArray(document.spaceId, [...spaceIds]), isNull(document.archivedAt)))
    .groupBy(checklist.id, document.id)
    .orderBy(desc(document.updatedAt));

  // 원시 집계는 타입이 보장되지 않는다 — 숫자로 바꿔서 내보낸다.
  return rows.map((row) => ({
    ...row,
    open: Number(row.open),
    done: Number(row.done),
    nextDueOn: row.nextDueOn ?? null,
  }));
}

/** 이 문서가 체크리스트라면 그 id. 문서 화면이 "체크리스트로 보기"를 띄울지 정한다. */
export async function checklistOfDocument(documentId: string): Promise<string | null> {
  const rows = await db
    .select({ id: checklist.id })
    .from(checklist)
    .where(eq(checklist.documentId, documentId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** 체크리스트의 문서 id. **권한 판정은 그 문서로 한다.** */
export async function documentOfChecklist(checklistId: string): Promise<string | null> {
  const rows = await db
    .select({ documentId: checklist.documentId })
    .from(checklist)
    .where(eq(checklist.id, checklistId))
    .limit(1);
  return rows[0]?.documentId ?? null;
}

/** 항목 하나가 매인 체크리스트·문서. 항목을 고치는 모든 길이 여기서 문서를 얻어 권한을 본다. */
export async function ownerOfChecklistItem(
  itemId: string,
): Promise<{ checklistId: string; documentId: string; spaceId: string } | null> {
  const rows = await db
    .select({
      checklistId: checklistItem.checklistId,
      documentId: checklist.documentId,
      spaceId: document.spaceId,
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(document, eq(checklist.documentId, document.id))
    .where(eq(checklistItem.id, itemId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 한 체크리스트의 항목들. **권한은 부르는 쪽이 문서로 이미 봤어야 한다** (`requireDocument`).
 * 안 한 것 먼저, 그 안에서는 손으로 정한 순서.
 */
export async function listChecklistItems(checklistId: string): Promise<ChecklistItemRow[]> {
  const rows = await db
    .select({ item: checklistItem, purchaseState: purchaseItem.state })
    .from(checklistItem)
    .leftJoin(purchaseItem, eq(checklistItem.purchaseItemId, purchaseItem.id))
    .where(eq(checklistItem.checklistId, checklistId))
    .orderBy(asc(checklistItem.done), asc(checklistItem.position));
  return rows.map((row) => toItem(row.item, row.purchaseState));
}

/**
 * 날짜가 있고 아직 안 한 항목들 — **`until` 까지** (지난 것 포함). space 로 좁힌다.
 * 개인·가족 체크리스트를 한 화면에서 "오늘 할 일"로 모아 보는 데 쓴다.
 */
export async function agenda(
  spaceIds: readonly string[],
  until: string,
  limit = 200,
): Promise<AgendaRow[]> {
  if (spaceIds.length === 0) return [];
  const rows = await db
    .select({
      item: checklistItem,
      purchaseState: purchaseItem.state,
      checklistTitle: document.title,
      documentId: document.id,
      spaceId: document.spaceId,
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(document, eq(checklist.documentId, document.id))
    .leftJoin(purchaseItem, eq(checklistItem.purchaseItemId, purchaseItem.id))
    .where(
      and(
        inArray(document.spaceId, [...spaceIds]),
        isNull(document.archivedAt),
        eq(checklistItem.done, false),
        isNotNull(checklistItem.dueOn),
        lte(checklistItem.dueOn, until),
      ),
    )
    .orderBy(asc(checklistItem.dueOn), asc(checklistItem.dueTime), asc(checklistItem.position))
    .limit(limit);

  return rows.map((row) => ({
    ...toItem(row.item, row.purchaseState),
    checklistTitle: row.checklistTitle,
    documentId: row.documentId,
    spaceId: row.spaceId,
  }));
}

/** 오늘까지 할 일(지난 것 포함) 수. 사이드바 배지에 쓴다. */
export async function dueCount(spaceIds: readonly string[], today: string): Promise<number> {
  if (spaceIds.length === 0) return 0;
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(document, eq(checklist.documentId, document.id))
    .where(
      and(
        inArray(document.spaceId, [...spaceIds]),
        isNull(document.archivedAt),
        eq(checklistItem.done, false),
        isNotNull(checklistItem.dueOn),
        lte(checklistItem.dueOn, today),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

/* ------------------------------------------------------------------ 쓰기 */

/** 체크리스트를 만든다 — 문서가 같이 생긴다. 그 문서가 권한의 근거다. */
export async function createChecklist(input: {
  spaceId: string;
  userId: string;
  title: string;
}): Promise<{ id: string; documentId: string }> {
  const documentId = await createDocument({
    spaceId: input.spaceId,
    userId: input.userId,
    title: input.title,
  });
  const id = newId();
  await db.insert(checklist).values({ id, documentId, createdBy: input.userId });
  return { id, documentId };
}

export type ItemInput = {
  title: string;
  dueOn?: string | null;
  dueTime?: string | null;
  repeat?: ChecklistRepeat;
  assigneeId?: string | null;
};

export async function addChecklistItem(
  checklistId: string,
  userId: string,
  input: ItemInput,
): Promise<string> {
  const last = await db
    .select({ position: checklistItem.position })
    .from(checklistItem)
    .where(eq(checklistItem.checklistId, checklistId))
    .orderBy(desc(checklistItem.position))
    .limit(1);

  const id = newId();
  await db.insert(checklistItem).values({
    id,
    checklistId,
    title: input.title,
    dueOn: input.dueOn ?? null,
    // 날짜 없는 시간은 뜻이 없다.
    dueTime: input.dueOn ? (input.dueTime ?? null) : null,
    repeat: input.dueOn ? (input.repeat ?? "none") : "none",
    repeatDay: dayOfMonth(input.dueOn ?? null),
    assigneeId: input.assigneeId ?? null,
    position: positionAfterLast(last[0]?.position ?? null),
    createdBy: userId,
  });
  return id;
}

export async function updateChecklistItem(
  itemId: string,
  patch: Partial<ItemInput>,
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId;
  if (patch.repeat !== undefined) values.repeat = patch.repeat;
  if (patch.dueTime !== undefined) values.dueTime = patch.dueTime;
  if (patch.dueOn !== undefined) {
    values.dueOn = patch.dueOn;
    // 사람이 날짜를 새로 정하면 그날이 새 "원래 날"이다.
    values.repeatDay = dayOfMonth(patch.dueOn);
    if (patch.dueOn === null) {
      values.dueTime = null;
      values.repeat = "none";
    }
  }
  // 일정이 바뀌면 새 일정으로 다시 알려야 한다.
  if (patch.dueOn !== undefined || patch.dueTime !== undefined) values.remindedAt = null;
  await db.update(checklistItem).set(values).where(eq(checklistItem.id, itemId));
}

/**
 * 체크하거나 푼다.
 *
 * **반복 항목을 체크하면 다음 날짜로 새 줄을 만든다.** 한 줄을 날짜만 밀어 쓰면 "언제 했나"가
 * 사라진다 — 체크한 줄은 기록으로 남기고, 할 일은 새 줄이 이어받는다. 같은 줄을 두 번 체크해도
 * 다음 줄이 두 개 생기지 않게 **안 한 상태에서 한 상태로 바뀔 때만** 만든다.
 *
 * 돌려주는 값은 새로 생긴 다음 항목 id (없으면 null).
 */
export async function setChecklistItemDone(
  itemId: string,
  done: boolean,
  userId: string,
): Promise<string | null> {
  const changed = await db
    .update(checklistItem)
    .set(
      done
        ? { done: true, doneAt: new Date(), doneBy: userId, updatedAt: new Date() }
        : { done: false, doneAt: null, doneBy: null, updatedAt: new Date() },
    )
    .where(and(eq(checklistItem.id, itemId), eq(checklistItem.done, !done)))
    .returning();

  const row = changed[0];
  if (!done || row === undefined) return null;

  const repeat = asRepeat(row.repeat);
  if (row.dueOn === null || repeat === "none") return null;
  const next = nextDueOn(row.dueOn, repeat, row.repeatDay ?? dayOfMonth(row.dueOn) ?? undefined);
  if (next === null) return null;

  const id = newId();
  await db.insert(checklistItem).values({
    id,
    checklistId: row.checklistId,
    title: row.title,
    dueOn: next,
    dueTime: row.dueTime,
    repeat: row.repeat,
    repeatDay: row.repeatDay,
    assigneeId: row.assigneeId,
    // 같은 자리에 이어서 — 체크한 줄은 아래 "한 것"으로 내려가므로 순서가 자연스럽다.
    position: row.position,
    createdBy: row.createdBy,
  });
  return id;
}

/** 항목을 지운다. 구매로 넘긴 살 것은 남는다 — 살 것은 자기 문서가 있다. */
export async function removeChecklistItem(itemId: string): Promise<void> {
  await db.delete(checklistItem).where(eq(checklistItem.id, itemId));
}

/** 한 것들을 치운다. 반복 항목의 기록도 함께 사라진다. */
export async function clearDoneItems(checklistId: string): Promise<number> {
  const gone = await db
    .delete(checklistItem)
    .where(and(eq(checklistItem.checklistId, checklistId), eq(checklistItem.done, true)))
    .returning({ id: checklistItem.id });
  return gone.length;
}

export async function linkPurchase(itemId: string, purchaseItemId: string): Promise<void> {
  await db
    .update(checklistItem)
    .set({ purchaseItemId, updatedAt: new Date() })
    .where(eq(checklistItem.id, itemId));
}

/**
 * 살 것을 **받았으면** 그걸 가리키는 항목도 체크한다. 체크리스트에서 한 번, 구매에서 한 번
 * 두 번 누르게 하지 않기 위해서다. 반복 항목이면 다음 줄도 생긴다.
 */
export async function completeItemsForPurchase(
  purchaseItemId: string,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: checklistItem.id })
    .from(checklistItem)
    .where(and(eq(checklistItem.purchaseItemId, purchaseItemId), eq(checklistItem.done, false)));
  for (const row of rows) await setChecklistItemDone(row.id, true, userId);
  return rows.length;
}

/* ------------------------------------------------------------------ 알림 (시스템 전용) */

export type DueReminder = {
  id: string;
  title: string;
  dueOn: string;
  dueTime: string | null;
  assigneeId: string | null;
  checklistId: string;
  checklistTitle: string;
  documentId: string;
};

/**
 * **시스템 전용** — 워커가 부른다. space 로 좁히지 않는다 (사람이 아니라 이 집 프로세스다).
 * 화면에서 부르지 말 것. 받는 사람은 문서의 지켜보는 사람(`watchersOfDocument`)으로 정한다.
 *
 * 알릴 때가 된 것: 안 했고, 아직 안 알렸고, (날짜, 시간 또는 아침 9시) 가 지금 이전.
 * 시간을 비교하려면 날짜와 시간을 같이 봐야 해서 문자열 합치기로 비교한다 —
 * 둘 다 고정 폭이라 사전순이 곧 시간순이다.
 */
export async function dueReminders(
  now: { day: string; time: string },
  limit = 50,
): Promise<DueReminder[]> {
  const stamp = `${now.day} ${now.time}`;
  const rows = await db
    .select({
      id: checklistItem.id,
      title: checklistItem.title,
      dueOn: checklistItem.dueOn,
      dueTime: checklistItem.dueTime,
      assigneeId: checklistItem.assigneeId,
      checklistId: checklist.id,
      checklistTitle: document.title,
      documentId: document.id,
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(document, eq(checklist.documentId, document.id))
    .where(
      and(
        isNull(document.archivedAt),
        eq(checklistItem.done, false),
        isNull(checklistItem.remindedAt),
        isNotNull(checklistItem.dueOn),
        // 너무 오래 밀린 것은 알리지 않는다 — 처음 켰을 때 옛날 일이 한꺼번에 울리지 않게.
        sql`${checklistItem.dueOn} >= to_char((${now.day}::date - 1), 'YYYY-MM-DD')`,
        sql`(${checklistItem.dueOn} || ' ' || coalesce(${checklistItem.dueTime}, ${DEFAULT_REMIND_TIME})) <= ${stamp}`,
      ),
    )
    .orderBy(asc(checklistItem.dueOn), asc(checklistItem.dueTime))
    .limit(limit);

  return rows.map((row) => ({ ...row, dueOn: row.dueOn ?? now.day }));
}

export async function markReminded(itemIds: readonly string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .update(checklistItem)
    .set({ remindedAt: new Date() })
    .where(inArray(checklistItem.id, [...itemIds]));
}
