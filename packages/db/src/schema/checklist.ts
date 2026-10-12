import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { document } from "./document";
import { purchaseItem } from "./purchase";

/**
 * 체크리스트 — 개인·가족이 같이 보는 할 일 목록.
 *
 * **체크리스트 하나가 문서 하나다.** 그래서 따로 권한을 만들지 않는다 — 개인 space 에 두면 나만,
 * 가족 space 에 두면 가족이 같이 본다. 문서를 고칠 수 있는 사람이 항목을 체크할 수 있다
 * (`assertCanWrite`). 문서 본문에는 체크리스트에 대한 메모를 쓴다.
 *
 * 항목은 문서가 아니다 — "우유 사기" 하나마다 문서를 만들면 트리가 쓰레기로 찬다.
 * 대신 **사야 하는 항목은 구매로 넘길 때 그때 문서가 생긴다** (`purchase_item`, 체크리스트 아래).
 */
export const checklist = pgTable(
  "checklist",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("checklist_document_unique").on(t.documentId)],
);

export const checklistItem = pgTable(
  "checklist_item",
  {
    id: text("id").primaryKey(),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => checklist.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by").references(() => user.id, { onDelete: "set null" }),
    /** 언제. `YYYY-MM-DD` — 시간대가 끼면 하루가 밀린다. */
    dueOn: text("due_on"),
    /** 몇 시. `HH:MM`. 없으면 그날 아무 때나 (알림은 아침에). */
    dueTime: text("due_time"),
    /** `none · daily · weekly · monthly`. 체크하면 다음 날짜로 새 줄이 생긴다. */
    repeat: text("repeat").notNull().default("none"),
    /**
     * 매달 반복의 **원래 날** (1~31). 31일짜리가 2월에 28일로 당겨져도 3월에는 31일로 돌아가야 한다 —
     * 지금 날짜만 보고 다음 달을 정하면 한 번 당겨진 날이 영영 안 돌아온다 (0017).
     */
    repeatDay: integer("repeat_day"),
    /** 누가 할 일인가. 가족 체크리스트에서만 뜻이 있다. 없으면 누구든. */
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    /** 형제 정렬. **`COLLATE "C"`** (0016) — CLAUDE.md 의 fractional index 규칙. */
    position: text("position").notNull(),
    /**
     * 사야 하는 항목이면 구매로 넘긴 그 살 것. 살 것을 빼도 항목은 남는다(`set null`).
     * 살 것이 "받음"이 되면 이 항목도 체크된다.
     */
    purchaseItemId: text("purchase_item_id").references(() => purchaseItem.id, {
      onDelete: "set null",
    }),
    /** 이 일정으로 알림을 보냈는가. 날짜·시간을 바꾸면 다시 비운다. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("checklist_item_list_idx").on(t.checklistId, t.position),
    index("checklist_item_due_idx").on(t.done, t.dueOn),
    index("checklist_item_purchase_idx").on(t.purchaseItemId),
  ],
);

export const checklistRelations = relations(checklist, ({ one, many }) => ({
  document: one(document, { fields: [checklist.documentId], references: [document.id] }),
  items: many(checklistItem),
}));

export const checklistItemRelations = relations(checklistItem, ({ one }) => ({
  checklist: one(checklist, { fields: [checklistItem.checklistId], references: [checklist.id] }),
  purchase: one(purchaseItem, {
    fields: [checklistItem.purchaseItemId],
    references: [purchaseItem.id],
  }),
}));

export type Checklist = typeof checklist.$inferSelect;
export type ChecklistItem = typeof checklistItem.$inferSelect;
