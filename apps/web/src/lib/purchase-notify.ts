import { watchersOfDocument } from "@nyanotion/db";
import { sendToUsers, type Notification } from "@nyanotion/notify";

/**
 * 구매 알림을 누구에게 보낼지 정하고 보낸다.
 *
 * **"가족 누구든 한 명이 답하면 되는" 것이 이 기능의 규칙**이므로 대상은 space 단위다 —
 * 가족 space 면 구성원 모두, 개인 space 면 주인 한 명 (`watchersOfDocument`).
 *
 * 알림이 실패해도 **부른 쪽을 실패시키지 않는다.** 승인 요청을 만드는 일과 알리는 일은 다르다 —
 * 알림이 안 갔다고 요청 자체가 사라지면 화면에서도 없어져 버린다. 대신 서버 로그에 남긴다.
 */
export async function notifyWatchers(
  documentId: string,
  notification: Notification,
  options: { except?: string } = {},
): Promise<void> {
  try {
    const watchers = await watchersOfDocument(documentId);
    const targets =
      options.except === undefined
        ? watchers
        : watchers.filter((id) => id !== options.except);
    if (targets.length === 0) return;
    await sendToUsers(targets, notification);
  } catch (error) {
    // VAPID 키가 없거나 푸시 서비스가 막힌 경우. 승인 요청 자체는 이미 만들어졌다.
    console.warn(
      "[구매] 알림을 보내지 못했습니다:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** 원 단위 금액을 사람이 읽는 모양으로. 알림 본문에 쓴다. */
export function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
