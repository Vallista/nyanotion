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
  getDocument,
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
import { requireViewer } from "./session";

/**
 * 모든 동작은 requireViewer() 를 먼저 통과하고, 쿼리에는 항상 spaceId 를 함께 넘긴다.
 * M4 에서 문서별 권한이 들어오면 여기서 access.ts 를 호출하게 된다.
 */

export async function createDocumentAction(parentId: string | null): Promise<void> {
  const viewer = await requireViewer();
  const id = await createDocument({ spaceId: viewer.spaceId, userId: viewer.userId, parentId });
  revalidatePath("/", "layout");
  redirect(`/d/${id}`);
}

export async function renameDocumentAction(id: string, title: string): Promise<void> {
  const viewer = await requireViewer();
  await renameDocument(id, viewer.spaceId, title.slice(0, 300), viewer.userId);
  revalidatePath("/", "layout");
}

export async function moveDocumentAction(
  id: string,
  parentId: string | null,
  afterId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const viewer = await requireViewer();
  const result = await moveDocument({ id, spaceId: viewer.spaceId, parentId, afterId });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function archiveDocumentAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  await archiveDocument(id, viewer.spaceId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restoreDocumentAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  await restoreDocument(id, viewer.spaceId);
  revalidatePath("/", "layout");
}

export async function emptyTrashAction(): Promise<void> {
  const viewer = await requireViewer();
  await emptyTrash(viewer.spaceId);
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------- 태그 · 츄르 · 검색 */

export async function searchAction(
  query: string,
  tagIds: string[] = [],
): Promise<{ id: string; title: string; snippet: string; updatedAt: string }[]> {
  const viewer = await requireViewer();
  const hits = await searchDocuments(viewer.spaceId, query, { tagIds, limit: 20 });
  return hits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    snippet: hit.snippet,
    updatedAt: hit.updatedAt.toISOString(),
  }));
}

/** 켜고 끈다. 돌려주는 값은 바뀐 뒤 상태. */
export async function toggleFavoriteAction(documentId: string): Promise<boolean> {
  const viewer = await requireViewer();
  const doc = await getDocument(documentId, viewer.spaceId);
  if (doc === null) return false;
  const on = await toggleFavorite(viewer.userId, documentId);
  revalidatePath("/", "layout");
  return on;
}

/** 이름으로 붙인다 — 없으면 만들고, 있으면 그걸 쓴다. */
export async function addTagAction(documentId: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  const doc = await getDocument(documentId, viewer.spaceId);
  if (doc === null) return;
  const tagId = await ensureTag(viewer.spaceId, name);
  await attachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function removeTagAction(documentId: string, tagId: string): Promise<void> {
  const viewer = await requireViewer();
  const doc = await getDocument(documentId, viewer.spaceId);
  if (doc === null) return;
  await detachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function renameTagAction(tagId: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  await renameTagName(tagId, viewer.spaceId, name);
  revalidatePath("/", "layout");
}

/** 태그만 사라진다 — 달려 있던 문서는 그대로 남는다. */
export async function deleteTagAction(tagId: string): Promise<void> {
  const viewer = await requireViewer();
  await deleteTag(tagId, viewer.spaceId);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ 모음 */

export async function createCollectionAction(
  name: string,
  filter: CollectionFilter,
  view: CollectionView = "list",
): Promise<void> {
  const viewer = await requireViewer();
  const id = await createCollection({
    spaceId: viewer.spaceId,
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
  await updateCollection(id, viewer.spaceId, patch);
  revalidatePath("/", "layout");
}

/** 모음만 사라진다 — 문서는 그대로 남는다. */
export async function deleteCollectionAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  await deleteCollection(id, viewer.spaceId);
  revalidatePath("/", "layout");
  redirect("/");
}
