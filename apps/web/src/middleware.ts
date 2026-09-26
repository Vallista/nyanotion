import { NextResponse, type NextRequest } from "next/server";

/**
 * 터널을 지나온 평문 HTTP 요청만 HTTPS 로 돌린다.
 *
 * 왜 필요한가: Cloudflare 가 TLS 를 끝내고 우리 쪽으로는 평문으로 넘기므로, 80 번으로 들어온
 * 요청도 앱까지 그대로 닿는다. 그대로 두면 **세션 쿠키가 `Secure` 라 로그인만 되고 아무것도
 * 안 되는 상태**가 된다 — 고장처럼 보이는데 원인이 안 보인다.
 *
 * **`x-forwarded-proto` 만으로는 못 가린다.** Next 는 평문으로 들어온 모든 요청에 그 헤더를
 * 붙이므로, 집 안에서 `localhost`·랜 IP·Tailscale 로 여는 것까지 전부 걸린다.
 * 그래서 **공개 주소로 들어온 것만** 돌린다 — 그 주소는 `BETTER_AUTH_URL` 이 알고 있다.
 */
const publicHost = (() => {
  try {
    const url = process.env.BETTER_AUTH_URL;
    if (url === undefined || !url.startsWith("https://")) return null;
    return new URL(url).host;
  } catch {
    return null;
  }
})();

export function middleware(request: NextRequest): NextResponse {
  if (publicHost === null) return NextResponse.next();

  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto !== "http") return NextResponse.next();

  // 주소는 x-forwarded-host 에서. nextUrl 의 host 는 터널이 말을 건 localhost:3000 이다.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host !== publicHost) return NextResponse.next();

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${host}`);
  return NextResponse.redirect(target, 308);
}

export const config = {
  // 정적 파일과 이미지 최적화 경로는 건너뛴다 — 리다이렉트할 이유가 없다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
