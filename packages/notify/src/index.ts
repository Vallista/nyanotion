import {
  loadEnv,
  removeSubscriptions,
  subscriptionsOf,
  touchSubscriptions,
} from "@nyanotion/db";
import webpush from "web-push";

/**
 * 웹 푸시를 보내는 유일한 곳.
 *
 * **가족 누구든 한 명이 답하면 되는 알림**이 이 앱의 쓰임새다 (구매 승인). 그래서 기본 단위는
 * "사람 여럿의 모든 기기"이고, 한 기기가 답하면 나머지 기기의 알림은 `tag` 로 덮어 치운다.
 *
 * 실패를 조용히 삼키지 않는다 — 다만 **죽은 구독(404·410)은 지우고 계속 간다.** 기기 하나가
 * 없어졌다고 나머지에게 못 보내면 알림 자체가 무너진다.
 *
 * iOS 는 **홈 화면에 추가한 뒤에야** 푸시를 받는다 (16.4+). 그 안내는 화면 쪽 몫이다.
 */

export type NotificationKind = "purchase-approval" | "purchase-result" | "comment" | "test";

export type Notification = {
  title: string;
  body: string;
  /** 누르면 열 주소. 앱 안 경로 (`/buy/abc`). */
  url: string;
  /**
   * 같은 일에 대한 알림은 같은 `tag` 를 쓴다. 브라우저가 먼저 온 것을 **대체**하므로
   * 기기 한 대에서 답하고 나면 다른 기기에 남은 알림이 새 내용으로 바뀐다.
   */
  tag: string;
  kind: NotificationKind;
  /** 화면을 열지 않고 바로 누를 수 있는 단추. 최대 둘까지가 쓸 만하다. */
  actions?: { action: string; title: string }[];
};

export type SendResult = {
  sent: number;
  /** 지워진 죽은 구독 수. */
  pruned: number;
  /** 보낼 구독이 하나도 없었다 — 아무도 알림을 켜지 않은 상태. */
  noDevices: boolean;
};

let configured = false;

/**
 * VAPID 키를 확인하고 web-push 를 맞춘다.
 *
 * 키가 없으면 **던진다.** 알림이 조용히 안 가는 것은 "보냈는데 아무도 못 받았다"와 구분이
 * 안 돼서, 승인 알림처럼 사람이 기다리는 일에서는 가장 나쁜 실패다.
 */
function configure(): void {
  if (configured) return;
  loadEnv();

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  // mailto: 는 푸시 서비스가 문제를 알릴 때 쓴다. 없으면 표준이 요구하는 모양이 안 된다.
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@localhost";

  if (publicKey === undefined || publicKey === "" || privateKey === undefined || privateKey === "") {
    throw new Error(
      "VAPID 키가 없습니다. `pnpm --filter @nyanotion/notify keys` 로 만들어 환경 설정에 넣으세요.",
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/** 알림을 보낼 수 있는 상태인가. 화면에서 "알림 켜기" 를 보여 줄지 정할 때 쓴다. */
export function pushConfigured(): boolean {
  loadEnv();
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  return (
    publicKey !== undefined && publicKey !== "" && privateKey !== undefined && privateKey !== ""
  );
}

/** 브라우저가 구독할 때 필요한 공개키. 비밀이 아니다. */
export function publicKey(): string | null {
  loadEnv();
  const key = process.env.VAPID_PUBLIC_KEY;
  return key === undefined || key === "" ? null : key;
}

/**
 * 이 사람들의 **모든 기기**로 보낸다.
 *
 * 한 사람이 폰·데스크탑을 다 켜 놨으면 둘 다 울린다. 승인 알림은 그게 맞다 —
 * 어느 기기를 보고 있을지 모르기 때문이다.
 */
export async function sendToUsers(
  userIds: readonly string[],
  notification: Notification,
): Promise<SendResult> {
  configure();

  const subscriptions = await subscriptionsOf(userIds);
  if (subscriptions.length === 0) return { sent: 0, pruned: 0, noDevices: true };

  const payload = JSON.stringify(notification);
  const dead: string[] = [];
  const alive: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          // 사람이 기다리는 알림이다 — 기기가 잠깐 꺼져 있어도 하루는 들고 있게 한다.
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        alive.push(subscription.endpoint);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404·410 = 그 기기의 구독이 사라졌다. 나머지는 일시적 문제로 보고 남겨 둔다.
        if (status === 404 || status === 410) dead.push(subscription.endpoint);
      }
    }),
  );

  await Promise.all([removeSubscriptions(dead), touchSubscriptions(alive)]);
  return { sent: alive.length, pruned: dead.length, noDevices: false };
}

export async function sendToUser(
  userId: string,
  notification: Notification,
): Promise<SendResult> {
  return sendToUsers([userId], notification);
}
