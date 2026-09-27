import { sendToUser } from "@nyanotion/notify";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/session";

/**
 * 나에게 시험 알림을 보낸다.
 *
 * 켜 두기만 하고 실제로 오는지 모르면 승인 알림을 믿을 수 없다 — 그래서 확인할 길을 둔다.
 * **내 기기들에만** 보낸다. 남에게 보내는 길은 여기 없다.
 */
export async function POST(): Promise<NextResponse> {
  const viewer = await requireViewer();

  try {
    const result = await sendToUser(viewer.userId, {
      title: "Nyanotion",
      body: "알림이 잘 옵니다. 구매 승인이 필요해지면 이렇게 알려 드릴게요.",
      url: "/install",
      tag: "test",
      kind: "test",
    });

    if (result.noDevices) {
      return NextResponse.json(
        { error: "알림을 켠 기기가 없습니다. 먼저 알림을 켜 주세요." },
        { status: 409 },
      );
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // VAPID 키가 없는 경우가 대부분이다. 조용히 넘어가면 원인을 알 수 없다.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "보내지 못했습니다" },
      { status: 500 },
    );
  }
}
