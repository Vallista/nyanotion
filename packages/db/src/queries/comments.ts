import { and, asc, eq } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { comment, commentThread } from "../schema/comment";

export type ThreadRow = {
  id: string;
  documentId: string;
  blockId: string | null;
  resolved: boolean;
  comments: {
    id: string;
    body: string;
    authorId: string;
    createdAt: string;
    updatedAt: string | null;
  }[];
};

/**
 * 문서의 실타래 전부 (오래된 것부터). 한 번에 두 질의로 가져와 N+1 을 만들지 않는다.
 * 읽어도 되는 문서인지는 **부르는 쪽이 이미 판정한 뒤**여야 한다.
 */
export async function listThreads(documentId: string): Promise<ThreadRow[]> {
  const threads = await db
    .select()
    .from(commentThread)
    .where(eq(commentThread.documentId, documentId))
    .orderBy(asc(commentThread.createdAt));
  if (threads.length === 0) return [];

  // 말은 조인 한 번으로 전부 가져온다 — 실타래마다 질의하면 N+1 이 된다.
  const rows = await db
    .select({ c: comment })
    .from(comment)
    .innerJoin(commentThread, eq(comment.threadId, commentThread.id))
    .where(eq(commentThread.documentId, documentId))
    .orderBy(asc(comment.createdAt));

  const byThread = new Map<string, ThreadRow["comments"]>();
  for (const { c } of rows) {
    const list = byThread.get(c.threadId) ?? [];
    list.push({
      id: c.id,
      body: c.body,
      authorId: c.authorId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt?.toISOString() ?? null,
    });
    byThread.set(c.threadId, list);
  }

  return threads.map((thread) => ({
    id: thread.id,
    documentId: thread.documentId,
    blockId: thread.blockId,
    resolved: thread.resolved,
    comments: byThread.get(thread.id) ?? [],
  }));
}

export async function createThread(input: {
  documentId: string;
  blockId: string | null;
  authorId: string;
  body: string;
}): Promise<ThreadRow> {
  const threadId = newId();
  await db.insert(commentThread).values({
    id: threadId,
    documentId: input.documentId,
    blockId: input.blockId,
    createdBy: input.authorId,
  });
  await db.insert(comment).values({
    id: newId(),
    threadId,
    authorId: input.authorId,
    body: input.body,
  });
  const made = await getThread(threadId);
  if (made === null) throw new Error("실타래를 만들지 못했습니다.");
  return made;
}

export async function getThread(threadId: string): Promise<ThreadRow | null> {
  const found = await db
    .select()
    .from(commentThread)
    .where(eq(commentThread.id, threadId))
    .limit(1);
  const thread = found[0];
  if (thread === undefined) return null;

  const rows = await db
    .select()
    .from(comment)
    .where(eq(comment.threadId, threadId))
    .orderBy(asc(comment.createdAt));

  return {
    id: thread.id,
    documentId: thread.documentId,
    blockId: thread.blockId,
    resolved: thread.resolved,
    comments: rows.map((row) => ({
      id: row.id,
      body: row.body,
      authorId: row.authorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt?.toISOString() ?? null,
    })),
  };
}

/** 실타래가 어느 문서 것인지. 권한 판정은 이 값으로 한다. */
export async function documentOfThread(threadId: string): Promise<string | null> {
  const rows = await db
    .select({ documentId: commentThread.documentId })
    .from(commentThread)
    .where(eq(commentThread.id, threadId))
    .limit(1);
  return rows[0]?.documentId ?? null;
}

/** 댓글이 어느 문서·누구 것인지. 고치기·지우기 판정에 쓴다. */
export async function ownerOfComment(
  commentId: string,
): Promise<{ documentId: string; authorId: string; threadId: string } | null> {
  const rows = await db
    .select({
      documentId: commentThread.documentId,
      authorId: comment.authorId,
      threadId: comment.threadId,
    })
    .from(comment)
    .innerJoin(commentThread, eq(comment.threadId, commentThread.id))
    .where(eq(comment.id, commentId))
    .limit(1);
  return rows[0] ?? null;
}

export async function addComment(input: {
  threadId: string;
  authorId: string;
  body: string;
}): Promise<{ id: string; createdAt: string }> {
  const id = newId();
  const now = new Date();
  await db.insert(comment).values({
    id,
    threadId: input.threadId,
    authorId: input.authorId,
    body: input.body,
  });
  await db
    .update(commentThread)
    .set({ updatedAt: now })
    .where(eq(commentThread.id, input.threadId));
  return { id, createdAt: now.toISOString() };
}

export async function editComment(commentId: string, body: string): Promise<void> {
  await db.update(comment).set({ body, updatedAt: new Date() }).where(eq(comment.id, commentId));
}

/**
 * 댓글을 지운다. 실타래에 남은 말이 없으면 실타래도 없앤다 —
 * 빈 실타래가 목록에 남으면 "정리해야 할 것"처럼 보인다.
 */
export async function deleteComment(commentId: string, threadId: string): Promise<void> {
  await db.delete(comment).where(eq(comment.id, commentId));
  const left = await db.select({ id: comment.id }).from(comment).where(eq(comment.threadId, threadId)).limit(1);
  if (left.length === 0) await db.delete(commentThread).where(eq(commentThread.id, threadId));
}

export async function setThreadResolved(
  threadId: string,
  resolved: boolean,
  userId: string,
): Promise<void> {
  await db
    .update(commentThread)
    .set({
      resolved,
      resolvedBy: resolved ? userId : null,
      resolvedAt: resolved ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(commentThread.id, threadId));
}

/** 아직 정리되지 않은 실타래 수. 문서 목록에 배지를 달 때 쓴다. */
export async function openThreadCount(documentId: string): Promise<number> {
  const rows = await db
    .select({ id: commentThread.id })
    .from(commentThread)
    .where(and(eq(commentThread.documentId, documentId), eq(commentThread.resolved, false)));
  return rows.length;
}
