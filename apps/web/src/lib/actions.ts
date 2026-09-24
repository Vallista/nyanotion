"use server";

import {
  archiveDocument,
  createDocument,
  emptyTrash,
  moveDocument,
  renameDocument,
  restoreDocument,
  setContent,
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

export async function saveContentAction(id: string, contentJson: unknown): Promise<{ title: string }> {
  const viewer = await requireViewer();
  const result = await setContent(id, viewer.spaceId, contentJson, viewer.userId);
  // 사이드바 제목이 바뀔 수 있으므로 레이아웃을 다시 그린다.
  revalidatePath("/", "layout");
  return result;
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
