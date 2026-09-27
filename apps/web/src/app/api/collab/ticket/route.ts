import { COLLAB_TICKET_TTL_MS, signCollabTicket } from "@nyanotion/shared";
import { NextResponse } from "next/server";
import { canWrite } from "@nyanotion/auth";
import { requireViewer } from "@/lib/session";
import { take } from "@/lib/rate-limit";

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

  // 표는 수십 초짜리라 자주 다시 받는다. 그래도 상한은 둔다 —
  // 붙었다 끊기를 되풀이하는 기기 하나가 서명만 하루 종일 시키지 않도록.
  const verdict = take("ticket", viewer.userId);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "표를 너무 자주 받았습니다.", retryAfter: verdict.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  // 고칠 수 없는 문서면 표를 주지 않는다 — 동기화는 쓰기다. 서버도 같은 확인을 한 번 더 한다.
  if (!(await canWrite(viewer.userId, documentId))) {
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
