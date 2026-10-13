import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

    /* ── 폴더 · Bento 필드 (0019) ─────────────────────────────────────────
       Bento(맥 앱)의 할 일과 양방향으로 맞추기 위해 Bento 가 가진 것을 그대로 받는다.
       웹 화면은 아직 폴더·메모·하위 항목만 쓴다 — 나머지는 Bento 가 쓰는 값을 **지우지 않고 지킨다.** */
    /** 그 체크리스트 안의 폴더. 없으면 맨 위. 폴더를 지우면 위 폴더(또는 맨 위)로 올라간다. */
    folderId: text("folder_id"),
    /** Bento 의 시작 시각 — `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:00`, 또는 `HH:MM`. 해석하지 않고 그대로 둔다. */
    startAt: text("start_at"),
    /** 예상 소요 분. */
    estMin: integer("est_min"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    color: text("color"),
    /** Bento 라벨 id. */
    kind: text("kind"),
    /** Bento 의 '구분' — 자유 텍스트 한 줄. */
    groupName: text("group_name"),
    notes: text("notes").notNull().default(""),
    subtasks: jsonb("subtasks").$type<{ id: string; title: string; done: boolean }[]>().notNull().default([]),
    /**
     * **지운 표시.** 동기화하는 쪽이 "지워졌다"를 알아야 하므로 줄을 바로 지우지 않는다.
     * 모든 목록 질의는 `deleted_at is null` 로 거른다.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * 바뀔 때마다 새로 받는 번호(`checklist_rev_seq`). 동기화는 "이 번호 다음부터 바뀐 것"을 묻는다 —
     * 시각은 기기마다 어긋나므로 쓰지 않는다. **고치는 질의는 전부 이 값을 새로 받아야 한다** (`bump`).
     */
    rev: bigint("rev", { mode: "number" }).notNull().default(sql`nextval('checklist_rev_seq')`),

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
    index("checklist_item_rev_idx").on(t.checklistId, t.rev),
  ],
);

/**
 * 체크리스트 안의 폴더 (0019). 중첩된다 — Bento 의 할 일 폴더와 하나씩 맞는다.
 *
 * `parent_id` 에 외래 키를 걸지 않았다 — 동기화는 순서가 뒤섞여 들어올 수 있어서(자식이 먼저) 잠깐
 * 없는 부모를 가리킬 수 있다. 화면은 부모를 못 찾으면 맨 위에 둔다.
 */
export const checklistFolder = pgTable(
  "checklist_folder",
  {
    id: text("id").primaryKey(),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => checklist.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    /** 형제 정렬. **`COLLATE "C"`** (0019). */
    position: text("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    rev: bigint("rev", { mode: "number" }).notNull().default(sql`nextval('checklist_rev_seq')`),
  },
  (t) => [index("checklist_folder_rev_idx").on(t.checklistId, t.rev)],
);

export type ChecklistFolder = typeof checklistFolder.$inferSelect;

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
