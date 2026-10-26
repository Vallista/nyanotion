"use server";

import {
  addChecklistItem,
  addFolder,
  deleteFolder,
  ownerOfFolder,
  renameFolder,
  archiveDocument,
  getDocumentById,
  renameDocument,
  clearDoneItems,
  createChecklist,
  createDocument,
  createItem,
  documentOfChecklist,
  linkPurchase,
  listChecklistItems,
  ownerOfChecklistItem,
  primaryChecklist,
  removeChecklistItem,
  setChecklistItemDone,
  updateChecklistItem,
  updateItem,
  watchersOfDocument,
} from "@nyanotion/db";
import {
  CHECKLIST_REPEATS,
  cleanDay,
  cleanTime,
  type ChecklistRepeat,
} from "@nyanotion/shared";
import { revalidatePath } from "next/cache";
import { assertCanWrite, requireViewer } from "@/lib/session";

/**
 * 체크리스트의 서버 동작.
 *
 * **체크리스트용 권한을 따로 만들지 않는다.** 체크리스트는 문서 하나에 매여 있고, 그 문서를
 * 고칠 수 있는 사람이 항목을 다룬다 (`assertCanWrite`). 개인/가족의 구분도 그 문서가 어느
 * space 에 있느냐가 전부다.
 */

function refresh(): void {
  revalidatePath("/lists", "layout");
  revalidatePath("/", "layout");
}

async function checklistGate(checklistId: string) {
  const documentId = await documentOfChecklist(checklistId);
  if (documentId === null) throw new Error("체크리스트를 찾을 수 없습니다.");
  const viewer = await assertCanWrite(documentId);
  return { viewer, documentId };
}

async function itemGate(itemId: string) {
  const owner = await ownerOfChecklistItem(itemId);
  if (owner === null) throw new Error("항목을 찾을 수 없습니다.");
  const viewer = await assertCanWrite(owner.documentId);
  return { viewer, ...owner };
}

function cleanTitle(value: string): string {
  const title = value.trim().slice(0, 200);
  if (title === "") throw new Error("무엇을 할지 적어 주세요.");
  return title;
}

/** 소요 분 — 캘린더 칸의 길이. 5분 ~ 하루. 이상한 값은 "안 정함"(null). */
function cleanEstMin(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  return minutes >= 5 && minutes <= 24 * 60 ? minutes : null;
}

function cleanRepeat(value: string | undefined): ChecklistRepeat | undefined {
  if (value === undefined) return undefined;
  return (CHECKLIST_REPEATS as readonly string[]).includes(value)
    ? (value as ChecklistRepeat)
    : "none";
}

/**
 * 담당자는 **그 체크리스트를 지켜보는 사람이어야 한다** — 가족 space 면 그 가족, 개인 space 면 나.
 * 아무 id 나 받으면 남의 집 사람에게 일을 맡기고 알림까지 보내게 된다.
 */
async function cleanAssignee(
  documentId: string,
  assigneeId: string | null | undefined,
): Promise<string | null | undefined> {
  if (assigneeId === undefined || assigneeId === null || assigneeId === "") {
    return assigneeId === undefined ? undefined : null;
  }
  const watchers = await watchersOfDocument(documentId);
  if (!watchers.includes(assigneeId)) throw new Error("이 체크리스트의 사람이 아닙니다.");
  return assigneeId;
}

/** 체크리스트를 만든다. 문서가 같이 생긴다 — 열면 메모를 쓸 수 있다. */
export async function createChecklistAction(input: {
  title: string;
  spaceId?: string;
}): Promise<string> {
  const viewer = await requireViewer();
  const title = input.title.trim().slice(0, 120);
  if (title === "") throw new Error("체크리스트 이름을 적어 주세요.");

  const spaceId = input.spaceId ?? viewer.personalSpace.id;
  const target = viewer.spaces.find((space) => space.id === spaceId);
  // 손님(guest)처럼 그 space 에 쓸 수 없는 사람은 만들지도 못한다.
  if (target === undefined || (target.baseRole !== "editor" && target.baseRole !== "owner")) {
    throw new Error("이 공간에 만들 수 없습니다.");
  }

  const { id } = await createChecklist({ spaceId, userId: viewer.userId, title });
  refresh();
  return id;
}

/**
 * **첫 화면(캘린더)에서 바로 적기.** 그 공간(내 문서 / 가족)의 기본 체크리스트(가장 먼저 만든 것)에 넣는다.
 * 날짜 없이 적으면 백로그로, 캘린더의 빈 칸을 눌러 적으면 그 날·시각·길이로 들어간다.
 * 아직 하나도 없으면 "할 일" 을 만들어 거기 넣는다 — 체크리스트를 먼저 만들라고 시키지 않는다.
 * 권한은 다른 길과 같다: 그 문서를 고칠 수 있어야 한다.
 */
export async function quickAddAction(
  spaceId: string,
  input: {
    title: string;
    dueOn?: string | null;
    dueTime?: string | null;
    estMin?: number | null;
    repeat?: string;
    checklistId?: string | null;
  },
): Promise<string> {
  const viewer = await requireViewer();
  const target = viewer.spaces.find((space) => space.id === spaceId);
  if (target === undefined) throw new Error("이 공간에 적을 수 없습니다.");

  // 고른 체크리스트가 있으면 거기. **그 공간의 것인지** 확인한다 — 카드가 가리키는 공간과 다른
  // 체크리스트에 적히면 "내 할 일"이 가족에게 보이는 일이 생긴다.
  let found: { id: string; documentId: string } | null = null;
  if (input.checklistId) {
    const documentId = await documentOfChecklist(input.checklistId);
    const owner = documentId === null ? null : await getDocumentById(documentId);
    if (documentId === null || owner === null || owner.spaceId !== spaceId) {
      throw new Error("그 체크리스트를 찾을 수 없습니다.");
    }
    found = { id: input.checklistId, documentId };
  } else {
    found = await primaryChecklist(spaceId);
  }
  if (found === null) {
    if (target.baseRole !== "editor" && target.baseRole !== "owner") {
      throw new Error("이 공간에 적을 수 없습니다.");
    }
    found = await createChecklist({ spaceId, userId: viewer.userId, title: "할 일" });
  }
  await assertCanWrite(found.documentId);
  const id = await addChecklistItem(found.id, viewer.userId, {
    title: cleanTitle(input.title),
    dueOn: cleanDay(input.dueOn),
    dueTime: cleanTime(input.dueTime),
    estMin: cleanEstMin(input.estMin) ?? null,
    repeat: cleanRepeat(input.repeat),
  });
  refresh();
  return id;
}

export async function addChecklistItemAction(
  checklistId: string,
  input: {
    title: string;
    dueOn?: string | null;
    dueTime?: string | null;
    repeat?: string;
    assigneeId?: string | null;
    folderId?: string | null;
  },
): Promise<string> {
  const { viewer, documentId } = await checklistGate(checklistId);
  if (input.folderId) {
    const owner = await ownerOfFolder(input.folderId);
    if (owner === null || owner.checklistId !== checklistId) throw new Error("그 폴더를 찾을 수 없습니다.");
  }
  const id = await addChecklistItem(checklistId, viewer.userId, {
    title: cleanTitle(input.title),
    dueOn: cleanDay(input.dueOn),
    dueTime: cleanTime(input.dueTime),
    repeat: cleanRepeat(input.repeat),
    assigneeId: (await cleanAssignee(documentId, input.assigneeId)) ?? null,
    folderId: input.folderId ?? null,
  });
  refresh();
  return id;
}

export async function updateChecklistItemAction(
  itemId: string,
  patch: {
    title?: string;
    dueOn?: string | null;
    dueTime?: string | null;
    repeat?: string;
    assigneeId?: string | null;
    /** 그 체크리스트 안의 폴더로. null 이면 맨 위로. */
    folderId?: string | null;
    /** 캘린더 칸의 길이(분). null 이면 안 정함. */
    estMin?: number | null;
  },
): Promise<void> {
  const { documentId, checklistId } = await itemGate(itemId);
  // 폴더는 **같은 체크리스트의 것**이어야 한다 — 남의 체크리스트 폴더 id 를 넣어 항목을 숨길 수 없게.
  if (patch.folderId) {
    const owner = await ownerOfFolder(patch.folderId);
    if (owner === null || owner.checklistId !== checklistId) throw new Error("그 폴더를 찾을 수 없습니다.");
  }
  await updateChecklistItem(itemId, {
    folderId: patch.folderId,
    title: patch.title === undefined ? undefined : cleanTitle(patch.title),
    dueOn: patch.dueOn === undefined ? undefined : cleanDay(patch.dueOn),
    dueTime: patch.dueTime === undefined ? undefined : cleanTime(patch.dueTime),
    estMin: cleanEstMin(patch.estMin),
    repeat: cleanRepeat(patch.repeat),
    assigneeId: await cleanAssignee(documentId, patch.assigneeId),
  });
  refresh();
}

export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<void> {
  const { viewer } = await itemGate(itemId);
  await setChecklistItemDone(itemId, done, viewer.userId);
  refresh();
}

export async function removeChecklistItemAction(itemId: string): Promise<void> {
  await itemGate(itemId);
  await removeChecklistItem(itemId);
  refresh();
}

export async function clearDoneAction(checklistId: string): Promise<void> {
  await checklistGate(checklistId);
  await clearDoneItems(checklistId);
  refresh();
}

/**
 * **사야 하는 항목을 구매로 넘긴다.**
 *
 * 살 것 문서를 체크리스트 문서 **아래에** 만든다 — 같은 space 에 들어가므로 개인 체크리스트면
 * 내 구매, 가족 체크리스트면 가족 구매가 되고, 승인 규칙(가족 누구든 한 명)도 그대로 따라온다.
 *
 * 곧바로 `searching` 으로 둔다. 그러면 구매 에이전트가 네이버(공식 API)·쿠팡에서 값을 찾아 오고,
 * 그다음은 기존 구매 흐름 그대로다 — **한도 → 승인 → 5분 유예 → 결제는 사람이.** 여기서 그
 * 멈출 자리를 하나도 건너뛰지 않는다.
 */
export async function sendToPurchaseAction(
  itemId: string,
  input: { quantity?: number; maxPriceKrw?: number | null } = {},
): Promise<string> {
  const { viewer, documentId, spaceId, checklistId } = await itemGate(itemId);

  const items = await listChecklistItems(checklistId);
  const item = items.find((row) => row.id === itemId);
  if (item === undefined) throw new Error("항목을 찾을 수 없습니다.");
  if (item.purchaseItemId !== null) throw new Error("이미 구매로 넘긴 항목입니다.");

  const maxPriceKrw =
    input.maxPriceKrw === null || input.maxPriceKrw === undefined
      ? null
      : Math.max(0, Math.floor(input.maxPriceKrw));

  const purchaseDocumentId = await createDocument({
    spaceId,
    userId: viewer.userId,
    parentId: documentId,
    title: item.title,
  });
  const purchaseItemId = await createItem({
    documentId: purchaseDocumentId,
    createdBy: viewer.userId,
    quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
    maxPriceKrw: maxPriceKrw === 0 ? null : maxPriceKrw,
    // 체크리스트의 날짜가 곧 "언제까지 필요한가"다.
    neededBy: item.dueOn,
  });
  await updateItem(purchaseItemId, { state: "searching", note: "" });
  await linkPurchase(itemId, purchaseItemId);

  refresh();
  revalidatePath("/buy", "layout");
  return purchaseItemId;
}

/** 체크리스트 이름 바꾸기 — 곧 그 문서의 제목이다. */
export async function renameChecklistAction(checklistId: string, title: string): Promise<void> {
  const { viewer, documentId } = await checklistGate(checklistId);
  const clean = title.trim().slice(0, 120);
  if (clean === "") throw new Error("이름을 적어 주세요.");
  await renameDocument(documentId, clean, viewer.userId);
  refresh();
}

/**
 * 체크리스트를 **휴지통으로.** 문서 삭제와 같은 규칙이다 — 하위 문서(구매로 넘긴 살 것)도 같이 가고,
 * 휴지통에서 되돌릴 수 있다. 목록·첫 화면·알림에서 함께 빠진다.
 */
export async function archiveChecklistAction(checklistId: string): Promise<void> {
  const { documentId } = await checklistGate(checklistId);
  await archiveDocument(documentId);
  refresh();
}

/* ── 폴더 ─────────────────────────────────────────────────────────────── */

/** 체크리스트 안에 폴더. 위 폴더를 고르면 그 안에 — Bento 의 할 일 폴더와 같은 모양이다. */
export async function addFolderAction(
  checklistId: string,
  name: string,
  parentId?: string | null,
): Promise<string> {
  await checklistGate(checklistId);
  const id = await addFolder(checklistId, { name, parentId: parentId ?? null });
  refresh();
  return id;
}

async function folderGate(folderId: string) {
  const owner = await ownerOfFolder(folderId);
  if (owner === null) throw new Error("폴더를 찾을 수 없습니다.");
  await assertCanWrite(owner.documentId);
  return owner;
}

export async function renameFolderAction(folderId: string, name: string): Promise<void> {
  await folderGate(folderId);
  await renameFolder(folderId, name);
  refresh();
}

/** 폴더를 지운다. 안의 할 일과 하위 폴더는 **위로 올라간다** — 지워지지 않는다. */
export async function deleteFolderAction(folderId: string): Promise<void> {
  await folderGate(folderId);
  await deleteFolder(folderId);
  refresh();
}
