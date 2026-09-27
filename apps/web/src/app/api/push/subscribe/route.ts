import { removeSubscription, saveSubscription } from "@nyanotion/db";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/session";

/**
 * 이 기기의 알림 구독을 켜고 끈다.
 *
 * 구독은 **로그인한 사람의 것**이다. 한 기기를 가족 둘이 번갈아 쓰면 마지막으로 로그인한
 * 사람에게 알림이 간다 (`saveSubscription` 이 덮어쓴다).
 */

type Body = {
  subscription?: {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  label?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  const viewer = await requireViewer();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "본문을 읽지 못했습니다" }, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "구독 모양이 이상합니다" }, { status: 400 });
  }

  await saveSubscription({
    endpoint,
    userId: viewer.userId,
    p256dh,
    auth,
    label: typeof body.label === "string" ? body.label.slice(0, 60) : "",
  });

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  // 로그인 확인은 한다 — 남의 endpoint 를 지우려면 그 값을 알아야 하는데,
  // 그건 그 기기 브라우저만 갖고 있다.
  await requireViewer();

  const endpoint = new URL(request.url).searchParams.get("endpoint");
  if (endpoint === null || endpoint === "") {
    return NextResponse.json({ error: "endpoint 가 필요합니다" }, { status: 400 });
  }

  await removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
