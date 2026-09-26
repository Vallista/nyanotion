import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { bytea, tsvector } from "./types";
import { space } from "./app";

/**
 * 페이지 하나. **`parent_id` 트리가 곧 그룹핑**이다 — 폴더 개념을 따로 두지 않는다.
 * 콘텐츠 원본은 M1 에서 `contentJson`, M2 부터 `ydocState`. 그 뒤로 contentJson·textPlain 은 파생값.
 */
export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    /** 하위 트리는 부모가 하드 삭제될 때 같이 사라진다 (모래상자 비우기). */
    parentId: text("parent_id").references((): AnyPgColumn => document.id, { onDelete: "cascade" }),
    /** 형제 사이 정렬. fractional index — 끼워 넣을 때 다른 행을 건드리지 않는다. */
    /**
     * **이 칼럼은 `COLLATE "C"` 다** (마이그레이션 0007). fractional index 는 바이트 순서를
     * 전제하는데 이 DB 의 기본 콜레이션(Korean_Korea.949)은 'a0' 를 'Zz' 보다 앞에 놓는다 —
     * 맨 앞에 끼울 때 나오는 키가 바로 'Zz' 꼴이라 순서가 뒤집힌다. Drizzle 로는 표현이 안 되니
     * 스키마를 새로 만들 때 0007 을 잊지 말 것.
     */
    position: text("position").notNull(),
    type: text("type").notNull().default("page"),
    title: text("title").notNull().default(""),
    icon: text("icon"),
    /** BlockNote 블록 트리. M1 원본, M2 부터 파생값. */
    contentJson: jsonb("content_json").notNull().default(sql`'[]'::jsonb`),
    /** Yjs 문서 상태. **M2 부터 이것이 원본이다** — content_json·text_plain 은 파생값. */
    ydocState: bytea("ydoc_state"),
    /** 블록을 펼친 평문 — FTS·청킹·LLM 입력용 파생값. 애플리케이션이 만든다. */
    textPlain: text("text_plain").notNull().default(""),
    /** 제목+본문의 전문검색 벡터. DB 가 만드는 생성 칼럼이라 직접 쓰지 않는다. */
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(text_plain, ''))`,
    ),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** 모래상자. 삭제는 이것으로만 한다. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    isTemplate: boolean("is_template").notNull().default(false),
  },
  (t) => [
    index("document_tree_idx").on(t.spaceId, t.parentId, t.position),
    index("document_live_idx").on(t.spaceId).where(sql`${t.archivedAt} is null`),
    index("document_parent_idx").on(t.parentId),
    index("document_search_idx").using("gin", t.searchTsv),
  ],
);

export const documentRelations = relations(document, ({ one, many }) => ({
  space: one(space, { fields: [document.spaceId], references: [space.id] }),
  parent: one(document, {
    fields: [document.parentId],
    references: [document.id],
    relationName: "documentTree",
  }),
  children: many(document, { relationName: "documentTree" }),
}));

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;
