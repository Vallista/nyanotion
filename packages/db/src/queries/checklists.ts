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
import { checklist, checklistFolder, checklistItem } from "../schema/checklist";
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
  /** 만든 때. 가장 먼저 만든 것이 그 공간의 기본 체크리스트다 (`primaryChecklist`). */
  createdAt: string;
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
  /** 그 체크리스트 안의 폴더 (0019). 없으면 맨 위. */
  folderId: string | null;
  notes: string;
  subtasks: { id: string; title: string; done: boolean }[];
};

/** 여러 체크리스트에 걸친 일정 한 줄 — "오늘 할 일" 화면용. */
export type AgendaRow = ChecklistItemRow & {
  checklistTitle: string;
  documentId: string;
  spaceId: string;
};

/** 고칠 때마다 새 변경 번호 — 동기화가 "그다음 바뀐 것"을 찾는 근거다. */
function bump() {
  return { rev: sql<number>`nextval('checklist_rev_seq')` };
}

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
    folderId: row.folderId,
    notes: row.notes,
    // jsonb 는 모양이 보장되지 않는다 — 읽을 때 확인한다 (CLAUDE.md 의 속성 값 규칙과 같다).
    subtasks: Array.isArray(row.subtasks)
      ? row.subtasks.filter(
          (x): x is { id: string; title: string; done: boolean } =>
            typeof x === "object" && x !== null && typeof x.id === "string" && typeof x.title === "string",
        ).map((x) => ({ id: x.id, title: x.title, done: x.done === true }))
      : [],
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
      createdAt: checklist.createdAt,
    })
    .from(checklist)
    .innerJoin(document, eq(checklist.documentId, document.id))
    .leftJoin(
      checklistItem,
      and(eq(checklistItem.checklistId, checklist.id), isNull(checklistItem.deletedAt)),
    )
    .where(and(inArray(document.spaceId, [...spaceIds]), isNull(document.archivedAt)))
    .groupBy(checklist.id, document.id)
    .orderBy(desc(document.updatedAt));

  // 원시 집계는 타입이 보장되지 않는다 — 숫자로 바꿔서 내보낸다.
  return rows.map((row) => ({
    ...row,
    open: Number(row.open),
    done: Number(row.done),
    nextDueOn: row.nextDueOn ?? null,
    createdAt: row.createdAt.toISOString(),
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
    .where(and(eq(checklistItem.id, itemId), isNull(checklistItem.deletedAt)))
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
    .where(and(eq(checklistItem.checklistId, checklistId), isNull(checklistItem.deletedAt)))
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
        isNull(checklistItem.deletedAt),
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

/**
 * 아직 안 한 항목 전부 — 날짜가 없는 것까지. **첫 화면(캣타워)** 이 공간마다 묶어 보여 준다.
 * 날짜가 있는 것 먼저(이른 순), 그다음 날짜 없는 것을 적은 순서로.
 */
export async function openItems(spaceIds: readonly string[], limit = 300): Promise<AgendaRow[]> {
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
        isNull(checklistItem.deletedAt),
      ),
    )
    .orderBy(
      sql`${checklistItem.dueOn} is null`,
      asc(checklistItem.dueOn),
      asc(checklistItem.dueTime),
      asc(checklistItem.createdAt),
    )
    .limit(limit);

  return rows.map((row) => ({
    ...toItem(row.item, row.purchaseState),
    checklistTitle: row.checklistTitle,
    documentId: row.documentId,
    spaceId: row.spaceId,
  }));
}

/**
 * 그 공간의 **기본 체크리스트** — 첫 화면에서 바로 적은 항목이 들어갈 곳. 가장 먼저 만든 것.
 * 없으면 null (부르는 쪽이 "할 일" 을 만든다).
 */
export async function primaryChecklist(
  spaceId: string,
): Promise<{ id: string; documentId: string } | null> {
  const rows = await db
    .select({ id: checklist.id, documentId: checklist.documentId })
    .from(checklist)
    .innerJoin(document, eq(checklist.documentId, document.id))
    .where(and(eq(document.spaceId, spaceId), isNull(document.archivedAt)))
    .orderBy(asc(checklist.createdAt))
    .limit(1);
  return rows[0] ?? null;
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
        isNull(checklistItem.deletedAt),
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
  /** 체크리스트 안의 폴더. null 이면 맨 위로. */
  folderId?: string | null;
  notes?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
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
    folderId: input.folderId ?? null,
    position: positionAfterLast(last[0]?.position ?? null),
    createdBy: userId,
  });
  return id;
}

export async function updateChecklistItem(
  itemId: string,
  patch: Partial<ItemInput>,
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date(), ...bump() };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.assigneeId !== undefined) values.assigneeId = patch.assigneeId;
  if (patch.repeat !== undefined) values.repeat = patch.repeat;
  if (patch.folderId !== undefined) values.folderId = patch.folderId;
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.subtasks !== undefined) values.subtasks = patch.subtasks;
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
        ? { done: true, doneAt: new Date(), doneBy: userId, updatedAt: new Date(), ...bump() }
        : { done: false, doneAt: null, doneBy: null, updatedAt: new Date(), ...bump() },
    )
    .where(
      and(eq(checklistItem.id, itemId), eq(checklistItem.done, !done), isNull(checklistItem.deletedAt)),
    )
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

/**
 * 항목을 지운다. 구매로 넘긴 살 것은 남는다 — 살 것은 자기 문서가 있다.
 * **줄은 지운 표시만 한다** — 동기화하는 Bento 가 "지워졌다"를 받아 가야 하므로.
 */
export async function removeChecklistItem(itemId: string): Promise<void> {
  await db
    .update(checklistItem)
    .set({ deletedAt: new Date(), updatedAt: new Date(), ...bump() })
    .where(eq(checklistItem.id, itemId));
}

/** 한 것들을 치운다. 반복 항목의 기록도 함께 사라진다. */
export async function clearDoneItems(checklistId: string): Promise<number> {
  const gone = await db
    .update(checklistItem)
    .set({ deletedAt: new Date(), updatedAt: new Date(), ...bump() })
    .where(
      and(
        eq(checklistItem.checklistId, checklistId),
        eq(checklistItem.done, true),
        isNull(checklistItem.deletedAt),
      ),
    )
    .returning({ id: checklistItem.id });
  return gone.length;
}

export async function linkPurchase(itemId: string, purchaseItemId: string): Promise<void> {
  await db
    .update(checklistItem)
    .set({ purchaseItemId, updatedAt: new Date(), ...bump() })
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
        isNull(checklistItem.deletedAt),
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

/* ------------------------------------------------------------------ 폴더 (0019) */

export type FolderRow = {
  id: string;
  checklistId: string;
  parentId: string | null;
  name: string;
  position: string;
};

/** 체크리스트 안의 폴더들 (지운 것 빼고). 형제 순서대로 — 트리는 화면이 짠다. */
export async function listFolders(checklistId: string): Promise<FolderRow[]> {
  return db
    .select({
      id: checklistFolder.id,
      checklistId: checklistFolder.checklistId,
      parentId: checklistFolder.parentId,
      name: checklistFolder.name,
      position: checklistFolder.position,
    })
    .from(checklistFolder)
    .where(and(eq(checklistFolder.checklistId, checklistId), isNull(checklistFolder.deletedAt)))
    .orderBy(asc(checklistFolder.position));
}

/** 폴더가 매인 체크리스트·문서. 폴더를 고치는 길은 전부 여기서 문서를 얻어 권한을 본다. */
export async function ownerOfFolder(
  folderId: string,
): Promise<{ checklistId: string; documentId: string } | null> {
  const rows = await db
    .select({ checklistId: checklistFolder.checklistId, documentId: checklist.documentId })
    .from(checklistFolder)
    .innerJoin(checklist, eq(checklistFolder.checklistId, checklist.id))
    .where(and(eq(checklistFolder.id, folderId), isNull(checklistFolder.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

async function lastFolderPosition(checklistId: string): Promise<string | null> {
  const rows = await db
    .select({ position: checklistFolder.position })
    .from(checklistFolder)
    .where(eq(checklistFolder.checklistId, checklistId))
    .orderBy(desc(checklistFolder.position))
    .limit(1);
  return rows[0]?.position ?? null;
}

/** 같은 부모 아래 같은 이름은 안 된다 — Bento 와 같은 규칙이라 동기화가 어긋나지 않는다. */
async function siblingNameTaken(
  checklistId: string,
  parentId: string | null,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: checklistFolder.id, name: checklistFolder.name })
    .from(checklistFolder)
    .where(
      and(
        eq(checklistFolder.checklistId, checklistId),
        isNull(checklistFolder.deletedAt),
        parentId === null ? isNull(checklistFolder.parentId) : eq(checklistFolder.parentId, parentId),
      ),
    );
  return rows.some((row) => row.id !== exceptId && row.name.trim() === name.trim());
}

export async function addFolder(
  checklistId: string,
  input: { name: string; parentId?: string | null; id?: string },
): Promise<string> {
  const name = input.name.trim().slice(0, 120);
  if (name === "") throw new Error("폴더 이름을 적어 주세요.");
  const parentId = input.parentId ?? null;
  if (parentId !== null) {
    const parent = await ownerOfFolder(parentId);
    if (parent === null || parent.checklistId !== checklistId) throw new Error("위 폴더를 찾을 수 없습니다.");
  }
  if (await siblingNameTaken(checklistId, parentId, name)) {
    throw new Error("같은 자리에 같은 이름의 폴더가 있습니다.");
  }
  const id = input.id ?? newId();
  await db.insert(checklistFolder).values({
    id,
    checklistId,
    parentId,
    name,
    position: positionAfterLast(await lastFolderPosition(checklistId)),
  });
  return id;
}

export async function renameFolder(folderId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 120);
  if (clean === "") throw new Error("폴더 이름을 적어 주세요.");
  const rows = await db
    .select({ checklistId: checklistFolder.checklistId, parentId: checklistFolder.parentId })
    .from(checklistFolder)
    .where(eq(checklistFolder.id, folderId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error("폴더를 찾을 수 없습니다.");
  if (await siblingNameTaken(row.checklistId, row.parentId, clean, folderId)) {
    throw new Error("같은 자리에 같은 이름의 폴더가 있습니다.");
  }
  await db
    .update(checklistFolder)
    .set({ name: clean, updatedAt: new Date(), ...bump() })
    .where(eq(checklistFolder.id, folderId));
}

/**
 * 폴더를 지운다. **안의 것은 지우지 않는다** — 하위 폴더와 항목은 지운 폴더의 위(없으면 맨 위)로 올라간다.
 * Bento 의 폴더 지우기와 같은 규칙이다 (`task_folders.rs` delete_task_folder).
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const rows = await db
    .select({ parentId: checklistFolder.parentId })
    .from(checklistFolder)
    .where(and(eq(checklistFolder.id, folderId), isNull(checklistFolder.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return;
  const now = new Date();
  await db
    .update(checklistFolder)
    .set({ parentId: row.parentId, updatedAt: now, ...bump() })
    .where(and(eq(checklistFolder.parentId, folderId), isNull(checklistFolder.deletedAt)));
  await db
    .update(checklistItem)
    .set({ folderId: row.parentId, updatedAt: now, ...bump() })
    .where(and(eq(checklistItem.folderId, folderId), isNull(checklistItem.deletedAt)));
  await db
    .update(checklistFolder)
    .set({ deletedAt: now, updatedAt: now, ...bump() })
    .where(eq(checklistFolder.id, folderId));
}

/* ------------------------------------------------------------------ 동기화 (0019) */

/**
 * 동기화로 오가는 모양. **Bento 가 아는 것만** 싣는다 — 반복·담당·구매는 냥노션에만 있는 값이라
 * Bento 가 보내지 않고, 받아 가서도 덮어쓰지 않는다(그 칸이 없으므로).
 */
export type SyncFolder = {
  id: string;
  parentId: string | null;
  name: string;
  deleted: boolean;
  updatedAt: string;
  rev: number;
};

export type SyncSubtask = { id: string; title: string; done: boolean };

export type SyncItem = {
  id: string;
  title: string;
  done: boolean;
  dueOn: string | null;
  dueTime: string | null;
  startAt: string | null;
  estMin: number | null;
  tags: string[];
  color: string | null;
  kind: string | null;
  groupName: string | null;
  notes: string;
  subtasks: SyncSubtask[];
  folderId: string | null;
  createdAt: string;
  deleted: boolean;
  updatedAt: string;
  rev: number;
};

/**
 * `since` 다음에 바뀐 것 — **지운 것까지.** 돌려주는 `cursor` 를 다음에 `since` 로 다시 보내면 된다.
 * 권한은 부르는 쪽이 그 체크리스트의 문서로 이미 봤어야 한다.
 */
export async function syncChanges(
  checklistId: string,
  since: number,
  limit = 1000,
): Promise<{ folders: SyncFolder[]; items: SyncItem[]; cursor: number; more: boolean }> {
  const [folders, items] = await Promise.all([
    db
      .select()
      .from(checklistFolder)
      .where(and(eq(checklistFolder.checklistId, checklistId), sql`${checklistFolder.rev} > ${since}`))
      .orderBy(asc(checklistFolder.rev))
      .limit(limit),
    db
      .select()
      .from(checklistItem)
      .where(and(eq(checklistItem.checklistId, checklistId), sql`${checklistItem.rev} > ${since}`))
      .orderBy(asc(checklistItem.rev))
      .limit(limit),
  ]);

  // 둘 중 하나가 한도에 걸렸으면 둘 다 **그 번호까지만** 돌려준다 — 그래야 다음 번에 빠지는 것이 없다.
  const more = folders.length === limit || items.length === limit;
  const cap = Math.min(
    folders.length === limit ? Number(folders.at(-1)!.rev) : Infinity,
    items.length === limit ? Number(items.at(-1)!.rev) : Infinity,
  );
  const keepF = folders.filter((f) => Number(f.rev) <= cap);
  const keepI = items.filter((i) => Number(i.rev) <= cap);
  const cursor = Math.max(since, ...keepF.map((f) => Number(f.rev)), ...keepI.map((i) => Number(i.rev)));

  return {
    folders: keepF.map(toSyncFolder),
    items: keepI.map(toSyncItem),
    cursor,
    more,
  };
}

function toSyncFolder(f: typeof checklistFolder.$inferSelect): SyncFolder {
  return {
    id: f.id,
    parentId: f.parentId,
    name: f.name,
    deleted: f.deletedAt !== null,
    updatedAt: f.updatedAt.toISOString(),
    rev: Number(f.rev),
  };
}

function toSyncItem(row: typeof checklistItem.$inferSelect): SyncItem {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    dueOn: row.dueOn,
    dueTime: row.dueTime,
    startAt: row.startAt,
    estMin: row.estMin,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
    color: row.color,
    kind: row.kind,
    groupName: row.groupName,
    notes: row.notes,
    subtasks: toItem(row, null).subtasks,
    folderId: row.folderId,
    createdAt: row.createdAt.toISOString(),
    deleted: row.deletedAt !== null,
    updatedAt: row.updatedAt.toISOString(),
    rev: Number(row.rev),
  };
}

/** 받아 주는 id — Bento 의 `t_…`, UUID, cuid 를 다 받되 이상한 글자는 막는다. */
const SYNC_ID = /^[A-Za-z0-9_.:-]{1,100}$/;

export type IncomingFolder = {
  id: string;
  parentId?: string | null;
  name?: string;
  deleted?: boolean;
  updatedAt: string;
};

export type IncomingItem = Partial<Omit<SyncItem, "id" | "rev" | "updatedAt">> & {
  id: string;
  updatedAt: string;
};

export type ApplyResult = {
  applied: number;
  /** 서버 것이 더 새로워서 버린 것 — 받아 가면 서버 것으로 맞춰진다. */
  stale: string[];
  /** 모양이 잘못됐거나 다른 체크리스트의 id 라 받지 않은 것. */
  rejected: { id: string; reason: string }[];
  /**
   * 버려진 것들의 **지금 서버 값.** 받는 쪽이 곧바로 덮어쓰게 — 안 주면 그 항목이 서버에서 다시 바뀔 때까지
   * 그 기기에는 버려진 옛 값이 남는다(커서는 이미 지나갔으므로).
   */
  current: { folders: SyncFolder[]; items: SyncItem[] };
};

type CleanFields = Partial<Omit<SyncItem, "id" | "deleted" | "updatedAt" | "rev" | "createdAt">>;

/**
 * 바뀐 것을 받는다. **나중에 고친 쪽이 이긴다** — 들어온 `updatedAt` 이 서버 것보다 이르면 버린다.
 * 기기 시계가 앞서 있으면 영원히 이기므로, 미래 시각은 지금으로 깎는다.
 *
 * 폴더를 먼저, 항목을 다음에 — 항목이 가리키는 폴더가 같은 묶음에 들어 있을 수 있다.
 */
export async function applyChanges(
  checklistId: string,
  userId: string,
  incoming: { folders?: IncomingFolder[]; items?: IncomingItem[] },
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, stale: [], rejected: [], current: { folders: [], items: [] } };
  const staleFolders: string[] = [];
  const now = Date.now();
  const when = (iso: unknown): Date | null => {
    if (typeof iso !== "string") return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return new Date(Math.min(t, now));
  };

  for (const f of incoming.folders ?? []) {
    const id = typeof f?.id === "string" ? f.id : "";
    if (!SYNC_ID.test(id)) {
      result.rejected.push({ id: id.slice(0, 100), reason: "id" });
      continue;
    }
    const at = when(f.updatedAt);
    if (at === null) {
      result.rejected.push({ id, reason: "updatedAt" });
      continue;
    }
    if (f.parentId != null && (typeof f.parentId !== "string" || !SYNC_ID.test(f.parentId))) {
      result.rejected.push({ id, reason: "parentId" });
      continue;
    }
    const existing = (await db.select().from(checklistFolder).where(eq(checklistFolder.id, id)).limit(1))[0];
    if (existing !== undefined && existing.checklistId !== checklistId) {
      result.rejected.push({ id, reason: "other-checklist" });
      continue;
    }
    if (existing !== undefined && existing.updatedAt.getTime() > at.getTime()) {
      result.stale.push(id);
      staleFolders.push(id);
      continue;
    }
    const name = (typeof f.name === "string" ? f.name : (existing?.name ?? "")).trim().slice(0, 120);
    if (existing === undefined) {
      if (f.deleted === true) continue; // 모르는 것을 지우라는 것 — 할 일이 없다.
      if (name === "") {
        result.rejected.push({ id, reason: "name" });
        continue;
      }
      await db.insert(checklistFolder).values({
        id,
        checklistId,
        parentId: f.parentId ?? null,
        name,
        position: positionAfterLast(await lastFolderPosition(checklistId)),
        updatedAt: at,
      });
    } else if (f.deleted === true) {
      if (existing.deletedAt === null) await deleteFolder(id);
    } else {
      await db
        .update(checklistFolder)
        .set({
          name: name === "" ? existing.name : name,
          parentId: f.parentId === undefined ? existing.parentId : f.parentId,
          deletedAt: null,
          updatedAt: at,
          ...bump(),
        })
        .where(eq(checklistFolder.id, id));
    }
    result.applied += 1;
  }

  for (const it of incoming.items ?? []) {
    const id = typeof it?.id === "string" ? it.id : "";
    if (!SYNC_ID.test(id)) {
      result.rejected.push({ id: id.slice(0, 100), reason: "id" });
      continue;
    }
    const at = when(it.updatedAt);
    if (at === null) {
      result.rejected.push({ id, reason: "updatedAt" });
      continue;
    }
    const existing = (await db.select().from(checklistItem).where(eq(checklistItem.id, id)).limit(1))[0];
    if (existing !== undefined && existing.checklistId !== checklistId) {
      result.rejected.push({ id, reason: "other-checklist" });
      continue;
    }
    if (existing !== undefined && existing.updatedAt.getTime() > at.getTime()) {
      result.stale.push(id);
      continue;
    }

    const fields = cleanIncoming(it);
    if (fields === null) {
      result.rejected.push({ id, reason: "shape" });
      continue;
    }

    if (existing === undefined) {
      if (it.deleted === true) continue;
      if (fields.title === undefined) {
        result.rejected.push({ id, reason: "title" });
        continue;
      }
      const last = await db
        .select({ position: checklistItem.position })
        .from(checklistItem)
        .where(eq(checklistItem.checklistId, checklistId))
        .orderBy(desc(checklistItem.position))
        .limit(1);
      await db.insert(checklistItem).values({
        id,
        checklistId,
        title: fields.title,
        done: fields.done ?? false,
        doneAt: fields.done === true ? at : null,
        doneBy: fields.done === true ? userId : null,
        dueOn: fields.dueOn ?? null,
        dueTime: fields.dueOn ? (fields.dueTime ?? null) : null,
        repeatDay: dayOfMonth(fields.dueOn ?? null),
        startAt: fields.startAt ?? null,
        estMin: fields.estMin ?? null,
        tags: fields.tags ?? [],
        color: fields.color ?? null,
        kind: fields.kind ?? null,
        groupName: fields.groupName ?? null,
        notes: fields.notes ?? "",
        subtasks: fields.subtasks ?? [],
        folderId: fields.folderId ?? null,
        position: positionAfterLast(last[0]?.position ?? null),
        createdBy: userId,
        createdAt: when(it.createdAt) ?? at,
        updatedAt: at,
      });
    } else if (it.deleted === true) {
      await db
        .update(checklistItem)
        .set({ deletedAt: at, updatedAt: at, ...bump() })
        .where(eq(checklistItem.id, id));
    } else {
      const { done, ...rest } = fields;
      const values: Record<string, unknown> = { ...rest, deletedAt: null, updatedAt: at, ...bump() };
      if (rest.dueOn !== undefined) {
        values.repeatDay = dayOfMonth(rest.dueOn);
        if (rest.dueOn === null) values.dueTime = null;
        values.remindedAt = null;
      }
      await db.update(checklistItem).set(values).where(eq(checklistItem.id, id));
      // 체크는 웹과 같은 길로 — 반복 항목이면 다음 줄이 생긴다. 시각은 들어온 것으로 되돌려 둔다.
      if (done !== undefined && done !== existing.done) {
        await setChecklistItemDone(id, done, userId);
        await db.update(checklistItem).set({ updatedAt: at }).where(eq(checklistItem.id, id));
      }
    }
    result.applied += 1;
  }

  if (result.stale.length > 0) {
    const staleItems = result.stale.filter((id) => !staleFolders.includes(id));
    const [folders, items] = await Promise.all([
      staleFolders.length === 0
        ? []
        : db.select().from(checklistFolder).where(inArray(checklistFolder.id, staleFolders)),
      staleItems.length === 0
        ? []
        : db.select().from(checklistItem).where(inArray(checklistItem.id, staleItems)),
    ]);
    result.current = { folders: folders.map(toSyncFolder), items: items.map(toSyncItem) };
  }
  return result;
}

/** 들어온 항목의 모양을 믿지 않는다 — 길이·종류를 맞추고, 아니면 null. */
function cleanIncoming(it: IncomingItem): CleanFields | null {
  const out: CleanFields = {};
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const text = (v: unknown, max: number): string | null | undefined =>
    v === undefined ? undefined : v === null ? null : typeof v === "string" ? v.slice(0, max) : undefined;

  if (it.title !== undefined) {
    const title = typeof it.title === "string" ? it.title.trim().slice(0, 500) : "";
    if (title === "") return null;
    out.title = title;
  }
  if (it.done !== undefined) {
    if (typeof it.done !== "boolean") return null;
    out.done = it.done;
  }
  if (it.dueOn !== undefined) {
    if (it.dueOn !== null && (typeof it.dueOn !== "string" || !day.test(it.dueOn))) return null;
    out.dueOn = it.dueOn;
  }
  if (it.dueTime !== undefined) {
    if (it.dueTime !== null && (typeof it.dueTime !== "string" || !time.test(it.dueTime))) return null;
    out.dueTime = it.dueTime;
  }
  if (it.startAt !== undefined) out.startAt = text(it.startAt, 40) ?? null;
  if (it.estMin !== undefined) {
    if (it.estMin !== null && (!Number.isInteger(it.estMin) || it.estMin < 0 || it.estMin > 100_000)) {
      return null;
    }
    out.estMin = it.estMin;
  }
  if (it.tags !== undefined) {
    if (!Array.isArray(it.tags)) return null;
    out.tags = it.tags
      .filter((t): t is string => typeof t === "string")
      .slice(0, 50)
      .map((t) => t.slice(0, 80));
  }
  if (it.color !== undefined) out.color = text(it.color, 40) ?? null;
  if (it.kind !== undefined) out.kind = text(it.kind, 80) ?? null;
  if (it.groupName !== undefined) out.groupName = text(it.groupName, 200) ?? null;
  if (it.notes !== undefined) {
    if (typeof it.notes !== "string") return null;
    out.notes = it.notes.slice(0, 100_000);
  }
  if (it.subtasks !== undefined) {
    if (!Array.isArray(it.subtasks)) return null;
    out.subtasks = it.subtasks
      .filter(
        (s): s is SyncSubtask =>
          typeof s === "object" && s !== null && typeof s.id === "string" && typeof s.title === "string",
      )
      .slice(0, 200)
      .map((s) => ({ id: s.id.slice(0, 100), title: s.title.slice(0, 500), done: s.done === true }));
  }
  if (it.folderId !== undefined) {
    if (it.folderId !== null && (typeof it.folderId !== "string" || !SYNC_ID.test(it.folderId))) return null;
    out.folderId = it.folderId;
  }
  return out;
}
