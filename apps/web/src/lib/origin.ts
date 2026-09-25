import { headers } from "next/headers";

/**
 * 지금 이 요청이 들어온 주소. 공유 링크를 만들 때 쓴다.
 *
 * 집 서버는 주소가 여럿이라(localhost · 랜 IP · Tailscale · 터널) **못 박으면 안 된다** —
 * 링크를 만든 그 주소를 그대로 돌려줘야 받은 사람이 열 수 있다.
 * `Origin` 헤더는 일반 이동에서는 없을 때가 많아 `Host` 를 본다.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host === null || host === "") return process.env.BETTER_AUTH_URL ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "http");
  return `${proto}://${host}`;
}
