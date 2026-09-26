import { relations } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { document } from "./document";

/**
 * 문서에 올린 파일 — 그림, 동영상, 첨부.
 *
 * **바이트는 DB 에 넣지 않는다.** 디스크(`UPLOAD_DIR`)에 id 이름으로 두고, 여기에는 누가·어느
 * 문서에·무엇을 올렸는지만 남긴다. 파일을 내줄 때 권한을 물어보려면 "어느 문서"가 꼭 필요하다 —
 * 링크만 알면 누구나 받아 가는 구멍을 만들지 않기 위해서다.
 *
 * 문서가 지워지면 줄도 함께 사라진다(cascade). 디스크의 파일은 남으므로 나중에 청소가 필요하면
 * 이 표에 없는 파일을 지우면 된다.
 */
export const attachment = pgTable(
  "attachment",
  {
    /** 파일 이름이자 URL 의 마지막 조각. 24자 cuid2 라 추측할 수 없다. */
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => user.id),
    /** 원래 이름. 내려받을 때 쓴다. */
    filename: text("filename").notNull(),
    /** 올릴 때 확인한 종류. 내줄 때도 **이 값만** 쓴다 — 요청이 시키는 대로 하지 않는다. */
    contentType: text("content_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachment_document_idx").on(t.documentId)],
);

export const attachmentRelations = relations(attachment, ({ one }) => ({
  document: one(document, { fields: [attachment.documentId], references: [document.id] }),
}));

export type Attachment = typeof attachment.$inferSelect;
