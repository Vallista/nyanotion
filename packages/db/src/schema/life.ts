import { index, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { space } from "./app";
import { user } from "./auth";

/**
 * 생활 기록 (0024) — Bento(맥)의 계획 블록 · 생각 · 기분/회고 · 주간·월간 회고를 도란으로 옮긴 것.
 * `docs/15-today.md`.
 *
 * 경계는 둘이다.
 * - **일정(`plan_event`)은 space 에 매인다** — 캘린더 구독·체크리스트와 같다. 가족 space 에 적으면 가족 모두가 본다.
 * - **메모·기분·회고는 사람 한 명의 것**이다 — 루틴처럼 `user_id` 가 주인이고 가족에게 보이는 길이 없다.
 *
 * 날짜·시간은 체크리스트와 같이 **이 집 시간대의 `YYYY-MM-DD` · `HH:MM` 문자열**이다.
 */

/**
 * 손으로 적은 일정 — 할 일이 아니라 "그 시간에 있는 일"(약속·수업·여행). 체크하지 않는다.
 * 구독한 캘린더의 사본(`calendar_event`)과 달리 여기서 고친다. 종일이면 시간이 없고 `ends_on` 은 마지막 날을 포함한다.
 */
export const planEvent = pgTable(
  "plan_event",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    startsOn: text("starts_on").notNull(),
    /** 없으면 종일. */
    startTime: text("start_time"),
    endsOn: text("ends_on").notNull(),
    endTime: text("end_time"),
    /** `#rrggbb` — 구독 캘린더와 같은 팔레트(`FEED_COLORS`). 없으면 화면이 정한다. */
    color: text("color"),
    location: text("location"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plan_event_range_idx").on(t.spaceId, t.startsOn, t.endsOn)],
);

/**
 * 빠른 메모 — 떠오른 것을 일단 적어 두는 곳. 나중에 할 일·문서로 옮기거나 끝냈다고 표시한다.
 * 문서가 아니다: 권한·트리·Yjs 를 거치지 않는 가벼운 줄 하나.
 */
export const memo = pgTable(
  "memo",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** 끝냈거나 다른 곳으로 옮긴 때. 비어 있으면 아직 메모함에 있다. */
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** 옮긴 곳 — `todo:<checklistItemId>` · `doc:<documentId>`. 화면이 링크를 건다. */
    movedTo: text("moved_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memo_user_idx").on(t.userId, t.createdAt)],
);

/** 하루 한 줄 — 기분 · 에너지(1~5) · 한 줄 메모 · 하루 회고. */
export const dayNote = pgTable(
  "day_note",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    mood: smallint("mood"),
    energy: smallint("energy"),
    note: text("note"),
    retro: text("retro"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/** 주간·월간 회고. `period` 는 `2026-W43` · `2026-10`. */
export const review = pgTable(
  "review",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `week · month`. */
    kind: text("kind").notNull(),
    period: text("period").notNull(),
    text: text("text").notNull(),
    /** `manual` (손으로) · `import` (Bento 에서 가져옴 — 그때는 AI 가 쓴 것). */
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("review_user_period_unique").on(t.userId, t.kind, t.period)],
);

export type PlanEvent = typeof planEvent.$inferSelect;
export type Memo = typeof memo.$inferSelect;
export type DayNote = typeof dayNote.$inferSelect;
export type Review = typeof review.$inferSelect;
