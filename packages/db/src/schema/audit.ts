import { relations, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { space } from "./app";

/**
 * "누가 언제 무엇을 했나."
 *
 * **모든 행위를 적지 않는다.** 문서를 고친 기록은 Yjs 와 `updated_at` 에 있고, 그걸 여기 또
 * 적으면 로그가 편집 소음으로 가득 차 정작 볼 것이 안 보인다. 여기 적는 것은
 * **나중에 "어라, 왜 이렇게 됐지" 하고 물을 만한 일**뿐이다 —
 * 권한이 바뀐 일, 밖으로 열린 일, 돈이 나간 일, 되돌릴 수 없게 지운 일.
 *
 * 로그는 **고치지 않는다.** 지우는 것은 보관 기간이 지났을 때뿐이다.
 */

export const AUDIT_ACTIONS = [
  "share.grant", // 사람·가족에게 문서를 공유했다
  "share.revoke",
  "link.create", // 공개 링크를 만들었다 (로그인 없이 열린다)
  "link.revoke",
  "family.invite",
  "family.join",
  "family.role",
  "family.remove",
  "purchase.approve", // 돈이 나가는 쪽으로 한 걸음
  "purchase.reject",
  "purchase.cancel",
  "trash.empty", // 되돌릴 수 없다
  "gpu.mode", // 게임 모드 전환 — 왜 그때 AI 가 안 됐는지의 답
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEvent = pgTable(
  "audit_event",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * 한 일을 한 사람. **계정이 지워져도 기록은 남아야 하므로** 참조를 걸지 않는다 —
     * 내보낸 사람이 한 일이 로그에서 사라지면 그게 제일 보고 싶은 기록이다.
     */
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull().default(""),
    action: text("action").notNull(),
    /** 어느 공간의 일인가. 이걸로 "내가 볼 수 있는 로그"를 가른다. */
    spaceId: text("space_id"),
    /** 대상 — document · organization · purchase_item … */
    subjectType: text("subject_type").notNull().default(""),
    subjectId: text("subject_id").notNull().default(""),
    /** 사람이 읽을 한 줄. 대상이 지워져도 무슨 일이었는지 남는다. */
    summary: text("summary").notNull().default(""),
    detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("audit_recent_idx").on(t.at),
    index("audit_space_idx").on(t.spaceId, t.at),
  ],
);

export const auditEventRelations = relations(auditEvent, ({ one }) => ({
  space: one(space, { fields: [auditEvent.spaceId], references: [space.id] }),
  actor: one(user, { fields: [auditEvent.actorId], references: [user.id] }),
}));

export type AuditEventRow = typeof auditEvent.$inferSelect;
