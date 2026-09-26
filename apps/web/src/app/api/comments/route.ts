import { effectiveRole } from "@nyanotion/auth";
import {
  addComment,
  createThread,
  deleteComment,
  documentOfThread,
  editComment,
  listThreads,
  ownerOfComment,
  setThreadResolved,
  usersByIds,
  familyMembers,
} from "@nyanotion/db";
import { roleAllows } from "@nyanotion/shared";
import { NextResponse } from "next/server";
import { userColor } from "@/lib/user-color";
import { requireViewer } from "@/lib/session";

/**
 * 댓글. 읽기는 GET, 나머지는 POST 하나로 받는다 — 권한 판정을 한 자리에 모으기 위해서.
 *
 * **댓글을 달려면 `commenter` 이상이어야 한다.** 읽기만 되는 사람은 목록만 본다.
 * 권한이 없으면 404 다 — 403 은 "그 문서가 있긴 하다"를 알려 준다.
 */

async function roleFor(userId: string, documentId: string) {
  return effectiveRole(userId, documentId);
}

const notFound = () => NextResponse.json({ error: "찾을 수 없습니다" }, { status: 404 });

export async function GET(request: Request): Promise<NextResponse> {
  const documentId = new URL(request.url).searchParams.get("doc");
  if (documentId === null || documentId === "") {
    return NextResponse.json({ error: "doc 이 필요합니다" }, { status: 400 });
  }
  const viewer = await requireViewer();
  const role = await roleFor(viewer.userId, documentId);
  if (role === null) return notFound();

  const threads = await listThreads(documentId);

  // 이름·색은 가족 구성원 + 실제로 쓴 사람들에서 모은다.
  const authorIds = new Set(threads.flatMap((t) => t.comments.map((c) => c.authorId)));
  authorIds.add(viewer.userId);
  const found = await usersByIds([...authorIds]);
  const fromFamilies = (
    await Promise.all(
      viewer.spaces
        .map((s) => s.organizationId)
        .filter((id): id is string => id !== null && id !== undefined)
        .map((id) => familyMembers(id)),
    )
  ).flat();

  const people = new Map<string, { id: string; name: string; color: string }>();
  for (const member of fromFamilies) {
    people.set(member.userId, {
      id: member.userId,
      name: member.name,
      color: userColor(member.userId),
    });
  }
  for (const [id, info] of found) {
    people.set(id, { id, name: info.name, color: userColor(id) });
  }

  return NextResponse.json(
    { threads, people: [...people.values()], canComment: roleAllows(role, "commenter") },
    { headers: { "cache-control": "no-store" } },
  );
}

type Op =
  | { op: "start"; documentId: string; blockId: string | null; body: string }
  | { op: "reply"; threadId: string; body: string }
  | { op: "edit"; commentId: string; body: string }
  | { op: "remove"; commentId: string }
  | { op: "resolve"; threadId: string; resolved: boolean };

export async function POST(request: Request): Promise<NextResponse> {
  let payload: Op;
  try {
    payload = (await request.json()) as Op;
  } catch {
    return NextResponse.json({ error: "본문을 읽지 못했습니다" }, { status: 400 });
  }

  const viewer = await requireViewer();

  /** 이 문서에 말을 걸 수 있는가. 없으면 404. */
  async function mayComment(documentId: string): Promise<boolean> {
    const role = await roleFor(viewer.userId, documentId);
    return role !== null && roleAllows(role, "commenter");
  }

  const body = "body" in payload ? payload.body?.trim() ?? "" : "";
  if (("body" in payload) && (body === "" || body.length > 4000)) {
    return NextResponse.json({ error: "댓글이 비었거나 너무 깁니다" }, { status: 400 });
  }

  if (payload.op === "start") {
    if (!(await mayComment(payload.documentId))) return notFound();
    const thread = await createThread({
      documentId: payload.documentId,
      blockId: payload.blockId,
      authorId: viewer.userId,
      body,
    });
    return NextResponse.json({ thread });
  }

  if (payload.op === "reply") {
    const documentId = await documentOfThread(payload.threadId);
    if (documentId === null || !(await mayComment(documentId))) return notFound();
    const made = await addComment({ threadId: payload.threadId, authorId: viewer.userId, body });
    return NextResponse.json({ comment: made });
  }

  if (payload.op === "resolve") {
    const documentId = await documentOfThread(payload.threadId);
    if (documentId === null || !(await mayComment(documentId))) return notFound();
    await setThreadResolved(payload.threadId, payload.resolved, viewer.userId);
    return NextResponse.json({ ok: true });
  }

  // 고치기·지우기는 **쓴 사람만**. 문서를 고칠 수 있다고 남의 말을 고치지는 못한다.
  const owner = await ownerOfComment(payload.commentId);
  if (owner === null || !(await mayComment(owner.documentId))) return notFound();
  if (owner.authorId !== viewer.userId) return notFound();

  if (payload.op === "edit") {
    await editComment(payload.commentId, body);
  } else {
    await deleteComment(payload.commentId, owner.threadId);
  }
  return NextResponse.json({ ok: true });
}
