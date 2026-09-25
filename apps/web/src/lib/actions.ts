"use server";

import {
  archiveDocument,
  attachTag,
  createCollection,
  createDocument,
  deleteCollection,
  deleteTag,
  detachTag,
  emptyTrash,
  ensureTag,
  getDocumentById,
  moveDocument,
  renameDocument,
  renameTagName,
  restoreDocument,
  searchDocuments,
  toggleFavorite,
  updateCollection,
  type CollectionFilter,
  type CollectionView,
} from "@nyanotion/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertCanWrite, requireViewer } from "./session";

/**
 * **모든 동작은 권한을 먼저 확인한다.**
 * 문서 하나를 건드리는 건 `assertCanWrite()`(= access.ts), 목록은 viewer.spaceIds 로 좁힌다.
 * 라우트에 조건을 손으로 짜 넣지 말 것.
 */

/* ---------------------------------------------------------------- 문서 */

export async function createDocumentAction(
  parentId: string | null,
  spaceId?: string,
): Promise<void> {
  const viewer = await requireViewer();

  // 하위 문서는 부모와 같은 space 에, 그리고 부모를 고칠 수 있어야 만든다.
  let targetSpace = spaceId ?? viewer.personalSpace.id;
  if (parentId !== null) {
    await assertCanWrite(parentId);
    const parent = await getDocumentById(parentId);
    if (parent === null) throw new Error("부모 문서를 찾을 수 없습니다.");
    targetSpace = parent.spaceId;
  } else if (!viewer.spaceIds.includes(targetSpace)) {
    throw new Error("이 공간에 문서를 만들 수 없습니다.");
  }

  const id = await createDocument({ spaceId: targetSpace, userId: viewer.userId, parentId });
  revalidatePath("/", "layout");
  redirect(`/d/${id}`);
}

export async function renameDocumentAction(id: string, title: string): Promise<void> {
  const viewer = await assertCanWrite(id);
  await renameDocument(id, title.slice(0, 300), viewer.userId);
  revalidatePath("/", "layout");
}

export async function moveDocumentAction(
  id: string,
  parentId: string | null,
  afterId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  await assertCanWrite(id);
  // 부모가 바뀌면 그 부모도 고칠 수 있어야 한다.
  if (parentId !== null) await assertCanWrite(parentId);
  const result = await moveDocument({ id, parentId, afterId });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function archiveDocumentAction(id: string): Promise<void> {
  await assertCanWrite(id);
  await archiveDocument(id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restoreDocumentAction(id: string): Promise<void> {
  await assertCanWrite(id);
  await restoreDocument(id);
  revalidatePath("/", "layout");
}

/** 모래상자 비우기 — 내가 들어갈 수 있는 space 들에서만. */
export async function emptyTrashAction(): Promise<void> {
  const viewer = await requireViewer();
  await emptyTrash(viewer.spaceIds);
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------- 태그 · 츄르 · 검색 */

export async function searchAction(
  query: string,
  tagIds: string[] = [],
): Promise<{ id: string; title: string; snippet: string; updatedAt: string }[]> {
  const viewer = await requireViewer();
  const hits = await searchDocuments(viewer.spaceIds, query, { tagIds, limit: 20 });
  return hits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    snippet: hit.snippet,
    updatedAt: hit.updatedAt.toISOString(),
  }));
}

/** 켜고 끈다. 돌려주는 값은 바뀐 뒤 상태. 읽을 수만 있어도 츄르는 꽂을 수 있다. */
export async function toggleFavoriteAction(documentId: string): Promise<boolean> {
  const viewer = await assertCanWrite(documentId, "viewer");
  const on = await toggleFavorite(viewer.userId, documentId);
  revalidatePath("/", "layout");
  return on;
}

/** 이름으로 붙인다 — 없으면 만들고, 있으면 그걸 쓴다. 태그는 문서가 사는 space 에 만든다. */
export async function addTagAction(documentId: string, name: string): Promise<void> {
  await assertCanWrite(documentId);
  const doc = await getDocumentById(documentId);
  if (doc === null) return;
  const tagId = await ensureTag(doc.spaceId, name);
  await attachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function removeTagAction(documentId: string, tagId: string): Promise<void> {
  await assertCanWrite(documentId);
  await detachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function renameTagAction(tagId: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  for (const spaceId of viewer.spaceIds) await renameTagName(tagId, spaceId, name);
  revalidatePath("/", "layout");
}

/** 태그만 사라진다 — 달려 있던 문서는 그대로 남는다. */
export async function deleteTagAction(tagId: string): Promise<void> {
  const viewer = await requireViewer();
  for (const spaceId of viewer.spaceIds) await deleteTag(tagId, spaceId);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ 모음 */

export async function createCollectionAction(
  name: string,
  filter: CollectionFilter,
  view: CollectionView = "list",
  spaceId?: string,
): Promise<void> {
  const viewer = await requireViewer();
  const target = spaceId ?? viewer.personalSpace.id;
  if (!viewer.spaceIds.includes(target)) throw new Error("이 공간에 모음을 만들 수 없습니다.");
  const id = await createCollection({
    spaceId: target,
    userId: viewer.userId,
    name,
    filter,
    view,
  });
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

export async function updateCollectionAction(
  id: string,
  patch: { name?: string; filter?: CollectionFilter; view?: CollectionView },
): Promise<void> {
  const viewer = await requireViewer();
  await updateCollection(id, viewer.spaceIds, patch);
  revalidatePath("/", "layout");
}

/** 모음만 사라진다 — 문서는 그대로 남는다. */
export async function deleteCollectionAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  await deleteCollection(id, viewer.spaceIds);
  revalidatePath("/", "layout");
  redirect("/");
}
