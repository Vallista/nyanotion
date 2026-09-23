import { relations, sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/**
 * 문서가 사는 최상위 컨테이너.
 * "내 문서"(personal)와 "가족 문서"(org)를 하나의 개념으로 묶는다 — ARCHITECTURE.md §5.
 * 가입하면 personal space 1개가, 가족을 만들면 org space 1개가 자동 생성된다.
 */
export const space = pgTable(
  "space",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(), // 'personal' | 'org'
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("space_personal_owner", sql`(${t.kind} = 'personal') = (${t.ownerUserId} is not null)`),
    check("space_org_organization", sql`(${t.kind} = 'org') = (${t.organizationId} is not null)`),
    uniqueIndex("space_personal_unique").on(t.ownerUserId).where(sql`${t.kind} = 'personal'`),
    index("space_organization_idx").on(t.organizationId),
  ],
);

export const spaceRelations = relations(space, ({ one }) => ({
  owner: one(user, { fields: [space.ownerUserId], references: [user.id] }),
  organization: one(organization, { fields: [space.organizationId], references: [organization.id] }),
}));

export type Space = typeof space.$inferSelect;
export type NewSpace = typeof space.$inferInsert;
