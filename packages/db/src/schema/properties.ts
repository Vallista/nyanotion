import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { collection } from "./tagging";
import { document } from "./document";

/**
 * 노션의 "데이터베이스" — 모음에 **속성**을 달고, 문서가 그 값을 갖는다.
 *
 * 지금까지 모음은 조건만 저장했다(`source: 'filter'`). 여기에 손으로 담는 모음
 * (`source: 'manual'`)이 더해지면서 진짜 표가 된다 — 구매 목록 같은 것.
 *
 * **문서의 자리는 여전히 트리 하나뿐이다.** 모음에 담긴다는 건 "이 표에도 줄로 나온다"는 뜻이지
 * 문서가 거기로 옮겨 가는 게 아니다. 그래서 한 문서가 여러 표에 나올 수 있다.
 */

/** v1 속성 종류. 구매 목록에 필요한 것부터 — 품목·가격·구매일·상태·링크. */
export const PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "date",
  "checkbox",
  "url",
  "person",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const property = pgTable(
  "property",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("text"),
    /** 종류별 설정. select 면 { options: [{id,name,color}] }, number 면 { format } 등. */
    config: jsonb("config").notNull().default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("property_collection_idx").on(t.collectionId, t.position)],
);

/**
 * 문서가 가진 속성 값. 문서와 속성의 짝이 한 줄.
 *
 * 값을 jsonb 로 두는 이유: 종류마다 모양이 다르고(숫자·날짜·선택지 id·사람 id),
 * 종류를 바꿀 때 칼럼을 옮기는 대신 읽는 쪽에서 해석하면 된다. 읽기는 항상 방어적으로.
 */
export const propertyValue = pgTable(
  "property_value",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => property.id, { onDelete: "cascade" }),
    value: jsonb("value"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.propertyId] }),
    index("property_value_property_idx").on(t.propertyId),
  ],
);

/** 손으로 담는 모음의 줄. `source: 'manual'` 인 모음만 쓴다. */
export const collectionItem = pgTable(
  "collection_item",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collection.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** 형제 정렬과 같은 fractional index. */
    /**
     * **이 칼럼은 `COLLATE "C"` 다** (마이그레이션 0007). fractional index 는 바이트 순서를
     * 전제하는데 이 DB 의 기본 콜레이션(Korean_Korea.949)은 'a0' 를 'Zz' 보다 앞에 놓는다 —
     * 맨 앞에 끼울 때 나오는 키가 바로 'Zz' 꼴이라 순서가 뒤집힌다. Drizzle 로는 표현이 안 되니
     * 스키마를 새로 만들 때 0007 을 잊지 말 것.
     */
    position: text("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.documentId] }),
    index("collection_item_order_idx").on(t.collectionId, t.position),
  ],
);

export const propertyRelations = relations(property, ({ one, many }) => ({
  collection: one(collection, { fields: [property.collectionId], references: [collection.id] }),
  values: many(propertyValue),
}));

export const propertyValueRelations = relations(propertyValue, ({ one }) => ({
  document: one(document, { fields: [propertyValue.documentId], references: [document.id] }),
  property: one(property, { fields: [propertyValue.propertyId], references: [property.id] }),
}));

export const collectionItemRelations = relations(collectionItem, ({ one }) => ({
  collection: one(collection, {
    fields: [collectionItem.collectionId],
    references: [collection.id],
  }),
  document: one(document, { fields: [collectionItem.documentId], references: [document.id] }),
}));

export type Property = typeof property.$inferSelect;
export type PropertyValue = typeof propertyValue.$inferSelect;
