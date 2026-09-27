import { relations, sql } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { document } from "./document";

/**
 * 냥이가 낸 제목·태그 제안. **문서 하나에 하나만** 둔다 (새 제안이 옛 제안을 덮는다).
 *
 * 왜 따로 표를 두는가 — **수락해야 반영된다**는 것이 이 기능의 규칙이다
 * (`docs/02-roadmap.md` M6). 문서의 제목을 모델이 조용히 바꾸면 사람은 자기가 쓴 제목이
 * 왜 사라졌는지 알 수 없다. 그래서 제안은 문서 밖에서 기다리고, 사람이 누르면 옮겨 간다.
 */
export const documentSuggestion = pgTable("document_suggestion", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => document.id, { onDelete: "cascade" }),
  /** 빈 문자열이면 제목은 그대로 두라는 뜻. */
  title: text("title").notNull().default(""),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  /** 어느 모델이 냈는지 — 모델을 바꿨을 때 옛 제안을 구별하려고. */
  model: text("model").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentSuggestionRelations = relations(documentSuggestion, ({ one }) => ({
  document: one(document, {
    fields: [documentSuggestion.documentId],
    references: [document.id],
  }),
}));

export type DocumentSuggestionRow = typeof documentSuggestion.$inferSelect;
