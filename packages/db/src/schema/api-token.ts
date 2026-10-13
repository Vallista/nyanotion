import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 개인 토큰 (0019) — 브라우저가 아닌 앱(Bento)이 그 사람으로 동기화 API 를 부를 때.
 *
 * **해시만 저장한다.** 토큰은 만들 때 한 번만 보여 주고, 잃어버리면 새로 만든다. 세션 쿠키와 달리
 * 오래 살기 때문에 이름을 붙여 두고("맥북 Bento") 언제든 끊을 수 있게 한다(`revoked_at`).
 * 토큰이 할 수 있는 일은 동기화 API 뿐이다 — 웹 화면은 여전히 세션 쿠키로만 열린다.
 */
export const apiToken = pgTable(
  "api_token",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** sha256(토큰) hex. */
    tokenHash: text("token_hash").notNull(),
    /** 화면에서 어느 토큰인지 알아보도록 앞 몇 글자만 (`nyt_ab12…`). */
    prefix: text("prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_token_hash_unique").on(t.tokenHash), index("api_token_user_idx").on(t.userId)],
);

export type ApiToken = typeof apiToken.$inferSelect;
