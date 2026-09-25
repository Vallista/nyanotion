import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { document } from "./document";

/**
 * 문서 공유. 권한은 **문서에 붙고 트리를 따라 상속된다** — ARCHITECTURE.md §6.
 * 실효 권한 계산은 `packages/auth/access.ts` 한 곳에서만 한다.
 */
export const documentShare = pgTable(
  "document_share",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** 'user' = 사람 한 명, 'org' = 그 가족 전체 */
    subjectType: text("subject_type").notNull(),
    /** user.id 또는 organization.id */
    subjectId: text("subject_id").notNull(),
    /** viewer < commenter < editor < owner */
    role: text("role").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_share_unique").on(t.documentId, t.subjectType, t.subjectId),
    index("document_share_subject_idx").on(t.subjectType, t.subjectId),
    index("document_share_document_idx").on(t.documentId),
  ],
);

/**
 * 링크를 아는 사람이면 누구나 — 로그인 없이. 읽기·댓글까지만 준다.
 * 이 경로로 들어온 세션은 실효 권한 계산을 건너뛰고 **그 문서와 하위 트리로만** 제한된다.
 */
export const publicLink = pgTable(
  "public_link",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    role: text("role").notNull().default("viewer"),
    /** 비밀번호는 해시로만 둔다. null 이면 비밀번호 없음. */
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("public_link_document_idx").on(t.documentId)],
);

export const documentShareRelations = relations(documentShare, ({ one }) => ({
  document: one(document, { fields: [documentShare.documentId], references: [document.id] }),
}));

export const publicLinkRelations = relations(publicLink, ({ one }) => ({
  document: one(document, { fields: [publicLink.documentId], references: [document.id] }),
}));

export type DocumentShare = typeof documentShare.$inferSelect;
export type PublicLink = typeof publicLink.$inferSelect;
