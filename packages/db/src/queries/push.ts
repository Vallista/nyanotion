import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { pushSubscription } from "../schema/push";

export type Subscription = {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
  label: string;
};

/**
 * 구독을 저장한다. 같은 기기가 다시 구독하면 덮어쓴다 —
 * 브라우저는 같은 기기에 같은 endpoint 를 주므로 중복이 쌓이지 않는다.
 *
 * `userId` 도 덮어쓴다: 한 기기를 가족 둘이 번갈아 쓸 수 있고, 그때 알림은
 * **마지막으로 로그인한 사람** 것이어야 한다.
 */
export async function saveSubscription(input: Subscription): Promise<void> {
  await db
    .insert(pushSubscription)
    .values({ ...input, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        label: input.label,
        lastSeenAt: new Date(),
      },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscription).where(eq(pushSubscription.endpoint, endpoint));
}

/** 죽은 구독 여럿을 한 번에. 보내다가 404/410 을 받은 것들이다. */
export async function removeSubscriptions(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db.delete(pushSubscription).where(inArray(pushSubscription.endpoint, [...endpoints]));
}

export async function subscriptionsOf(userIds: readonly string[]): Promise<Subscription[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      endpoint: pushSubscription.endpoint,
      userId: pushSubscription.userId,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
      label: pushSubscription.label,
    })
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, [...userIds]));
}

/** 보낸 뒤 살아 있는 것들의 시각을 갱신한다. 오래된 구독을 정리할 때 본다. */
export async function touchSubscriptions(endpoints: readonly string[]): Promise<void> {
  if (endpoints.length === 0) return;
  await db
    .update(pushSubscription)
    .set({ lastSeenAt: new Date() })
    .where(inArray(pushSubscription.endpoint, [...endpoints]));
}

/** 이 사람이 알림을 받을 기기가 몇 대인가. 화면에 "이 기기 포함 2대" 처럼 보여 준다. */
export async function subscriptionCount(userId: string): Promise<number> {
  const rows = await db
    .select({ endpoint: pushSubscription.endpoint })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
  return rows.length;
}
