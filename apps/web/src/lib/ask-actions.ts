"use server";

import { revalidatePath } from "next/cache";
import {
  acceptSuggestion,
  dismissSuggestion,
  enqueueJob,
  getDocumentById,
  queueDepth,
} from "@nyanotion/db";
import { assertCanWrite, requireViewer } from "@/lib/session";

/**
 * 제안 수락·무시와 색인 다시 걸기.
 *
 * **제목·태그를 바꾸는 일이므로 쓰기 권한이 필요하다** (`assertCanWrite`). 읽기로 받은 문서에
 * 남의 제목을 바꿔 넣을 수는 없다.
 */

export async function acceptSuggestionAction(
  documentId: string,
  take: { title: boolean; tags: boolean },
): Promise<void> {
  const viewer = await assertCanWrite(documentId);
  const doc = await getDocumentById(documentId);
  if (doc === null) return;

  await acceptSuggestion(documentId, doc.spaceId, viewer.userId, take);
  // 제목이 바뀌면 사이드바·근거 표시가 같이 바뀐다.
  revalidatePath("/", "layout");
}

export async function dismissSuggestionAction(documentId: string): Promise<void> {
  await assertCanWrite(documentId);
  await dismissSuggestion(documentId);
  revalidatePath(`/d/${documentId}`);
}

/** "지금 색인해" — 답이 옛 내용을 물고 올 때 사람이 직접 밀 수 있게. */
export async function reindexAction(documentId: string): Promise<void> {
  await assertCanWrite(documentId, "viewer");
  await enqueueJob("index", documentId, 0);
}

/** 색인이 얼마나 밀렸는지. 물어보기 화면이 "아직 색인 중" 을 말할 수 있게. */
export async function indexQueueAction(): Promise<{
  queued: number;
  running: number;
  failed: number;
}> {
  await requireViewer();
  return queueDepth();
}
