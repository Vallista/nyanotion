import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 웹 푸시 구독 — **기기 하나에 한 줄**이다.
 *
 * 한 사람이 폰·데스크탑·태블릿에서 각각 구독하므로 사용자당 여러 줄이 정상이다.
 * 구매 승인처럼 "가족 누구든 한 명이 답하면 되는" 알림은 모든 기기로 보낸다.
 *
 * `endpoint` 가 기기를 가리키는 유일한 값이라 여기가 기본키다. 같은 기기가 다시 구독하면
 * 브라우저가 같은 endpoint 를 주므로 덮어쓰면 된다 (upsert).
 *
 * **죽은 구독은 보낼 때 알게 된다.** 브라우저가 404/410 을 주면 그 줄을 지운다 —
 * 미리 알 방법이 없고, 쌓아 두면 보낼 때마다 헛일을 한다.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    /** 브라우저가 준 푸시 서비스 주소. 이게 기기다. */
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 암호화 키 두 개. 이게 없으면 보낼 수 없다. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** 어느 기기인지 사람이 알아보게 — "아이폰 Safari" 처럼 화면에 보여 준다. */
    label: text("label").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 마지막으로 성공한 때. 오래된 것을 정리할 때 본다. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId)],
);

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, { fields: [pushSubscription.userId], references: [user.id] }),
}));

export type PushSubscription = typeof pushSubscription.$inferSelect;
