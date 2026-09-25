import { getDocument } from "@nyanotion/db";
import { COLLAB_TICKET_TTL_MS, signCollabTicket } from "@nyanotion/shared";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/session";

/**
 * 동기화 서버에 붙을 표를 발급한다. 쿠키로 인증하고, 문서 하나·수십 초로 범위를 좁힌다.
 * 세션 토큰을 클라이언트 JS 로 내보내지 않기 위한 우회로 — packages/shared/src/ticket.ts 참고.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const documentId = new URL(request.url).searchParams.get("doc");
  if (documentId === null || documentId === "") {
    return NextResponse.json({ error: "doc 이 필요합니다" }, { status: 400 });
  }

  const viewer = await requireViewer();

  // 열 수 없는 문서면 표를 주지 않는다. 동기화 서버도 같은 확인을 한 번 더 한다.
  const doc = await getDocument(documentId, viewer.spaceId);
  if (doc === null || doc.archivedAt !== null) {
    return NextResponse.json({ error: "문서를 열 수 없습니다" }, { status: 404 });
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret === "") {
    return NextResponse.json({ error: "서버 설정이 빠졌습니다" }, { status: 500 });
  }

  const ticket = await signCollabTicket(secret, { userId: viewer.userId, documentId });
  return NextResponse.json(
    { ticket, expiresInMs: COLLAB_TICKET_TTL_MS },
    { headers: { "cache-control": "no-store" } },
  );
}
