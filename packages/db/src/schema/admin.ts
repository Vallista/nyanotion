import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * 가족 없이 **계정만** 만드는 초대 (0018). 어드민 화면에서 만든다.
 *
 * 가족 초대(`invitation`)는 Better Auth 의 organization 에 묶여 있어 가족이 없으면 못 쓴다.
 * 그래서 따로 둔다 — 그래도 **공개 가입은 아니다.** 살아 있는 초대가 있는 주소만 가입 훅을
 * 통과한다 (`hasOpenAccountInvite`). `id` 가 곧 링크의 토큰이다.
 */
export const accountInvite = pgTable(
  "account_invite",
  {
    id: text("id").primaryKey(),
    /** 소문자로 둔다. 가입한 주소와 같아야 쓸 수 있다. */
    email: text("email").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** 이 초대로 가입했으면 그때. 한 번만 쓴다. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("account_invite_email_idx").on(t.email)],
);

export type AccountInvite = typeof accountInvite.$inferSelect;
