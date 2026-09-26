import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { document } from "./document";

/**
 * 댓글 — 블록 하나에 실타래 하나.
 *
 * **본문(Yjs)에 넣지 않는다.** 본문은 오프라인에서도 고칠 수 있어야 하지만 댓글은 "다른 사람에게
 * 말 걸기"라 연결이 없으면 뜻이 없다. CRDT 에 넣으면 지운 댓글이 다른 기기에서 되살아나는
 * 종류의 문제를 떠안게 되고, "누가 언제" 를 서버가 보증할 수도 없다.
 *
 * `block_id` 는 BlockNote 블록의 id 다. 그 블록이 지워져도 실타래는 남는다 —
 * 대화를 문서 편집으로 지우는 것은 사고이기 쉽다. 화면은 가리킬 곳이 없으면 문서 댓글로 보여 준다.
 */
export const commentThread = pgTable(
  "comment_thread",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** null 이면 문서 전체에 단 것. */
    blockId: text("block_id"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comment_thread_document_idx").on(t.documentId, t.resolved),
    index("comment_thread_block_idx").on(t.documentId, t.blockId),
  ],
);

/**
 * 실타래 안의 말 한 마디. 글자만 담는다 —
 * 서식 있는 댓글은 "무엇을 저장할 것인가"를 또 정해야 하고, 가족 메모에는 필요 없다.
 */
export const comment = pgTable(
  "comment",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => commentThread.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 고친 적이 없으면 null — 화면이 "(고침)" 을 붙일지 정하는 데 쓴다. */
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [index("comment_thread_idx").on(t.threadId, t.createdAt)],
);

export const commentThreadRelations = relations(commentThread, ({ one, many }) => ({
  document: one(document, { fields: [commentThread.documentId], references: [document.id] }),
  comments: many(comment),
}));

export const commentRelations = relations(comment, ({ one }) => ({
  thread: one(commentThread, { fields: [comment.threadId], references: [commentThread.id] }),
}));

export type CommentThread = typeof commentThread.$inferSelect;
export type Comment = typeof comment.$inferSelect;
