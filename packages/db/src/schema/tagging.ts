import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { space } from "./app";
import { document } from "./document";

/**
 * 카테고리. 트리(문서 안의 문서)가 "어디에 있나"라면, 태그는 "무엇에 관한 것인가"다.
 * 한 문서는 트리에서 한 자리에만 있지만 태그는 여러 개 달 수 있다.
 */
export const tag = pgTable(
  "tag",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** 시안의 절제된 팔레트 안에서만 고른다. null 이면 기본 회색 칩. */
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tag_space_name_uidx").on(t.spaceId, t.name)],
);

export const documentTag = pgTable(
  "document_tag",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.tagId] }), index("document_tag_tag_idx").on(t.tagId)],
);

/** 츄르 — 즐겨찾기. 사람마다 다르므로 space 가 아니라 user 에 매인다. */
export const favorite = pgTable(
  "favorite",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.documentId] })],
);

/**
 * 저장된 필터·정렬·뷰. 노션 데이터베이스의 가벼운 버전.
 * **문서를 소유하지 않는다** — 조건에 맞는 문서를 보여 줄 뿐이고, 문서의 자리는 언제나 트리 하나다.
 */
export const collection = pgTable(
  "collection",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    /** { tagIds: string[], anyTag: boolean, query: string } */
    filterJson: jsonb("filter_json").notNull().default({}),
    /** { field: 'updatedAt'|'title', direction: 'asc'|'desc' } */
    sortJson: jsonb("sort_json").notNull().default({}),
    view: text("view").notNull().default("list"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("collection_space_idx").on(t.spaceId)],
);

export const tagRelations = relations(tag, ({ one, many }) => ({
  space: one(space, { fields: [tag.spaceId], references: [space.id] }),
  documents: many(documentTag),
}));

export const documentTagRelations = relations(documentTag, ({ one }) => ({
  document: one(document, { fields: [documentTag.documentId], references: [document.id] }),
  tag: one(tag, { fields: [documentTag.tagId], references: [tag.id] }),
}));

export type Tag = typeof tag.$inferSelect;
export type Collection = typeof collection.$inferSelect;
