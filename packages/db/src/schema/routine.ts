import { sql } from "drizzle-orm";
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

/**
 * 루틴(습관) — Bento(맥)와 iPhone 앱이 같이 쓰는 **사람 한 명의 것** (0023, `docs/13-sync.md` §루틴).
 *
 * 문서도 체크리스트도 아니다. 공간(space)에 매이지 않고 **`user_id` 하나가 주인**이다 — 가족과 나누는
 * 것이 아니라서 `access.ts` 의 문서 권한을 거치지 않는다. 대신 모든 질의가 `user_id` 로 좁힌다.
 *
 * 동기화는 체크리스트와 같은 규칙: 고칠 때마다 `routine_rev_seq` 에서 새 `rev`, 지우기는 `deleted_at`,
 * 나중에 고친 쪽이 이긴다(`updated_at`).
 */
export const routine = pgTable(
  "routine",
  {
    /** 클라이언트가 정한다 (Bento `rt_…`). */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** `blue · orange · aqua · yellow · magenta · violet` — 클라이언트의 색 토큰 이름. */
    color: text("color").notNull().default("blue"),
    /** `morning · afternoon · evening · anytime`. */
    slot: text("slot").notNull().default("anytime"),
    /** `daily · weekly`. */
    freq: text("freq").notNull().default("daily"),
    /** weekly 일 때 요일. 0=일 … 6=토. */
    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
    /** 하루 목표 시간(분). 채우면 클라이언트가 완료로 표시한다. */
    goalMin: integer("goal_min"),
    /** `YYYY-MM-DD`. 이날부터 예정일을 센다. */
    startDate: text("start_date").notNull(),
    /** `YYYY-MM-DD`. 보관한 날 — 이날부터 예정이 아니다. */
    archivedAt: text("archived_at"),
    /** 보관했다 다시 꺼낸 구간들 `[{from, to}]` (양 끝 포함). */
    pauses: jsonb("pauses").$type<{ from: string; to: string }[]>().notNull().default([]),
    /** 목록 순서. 클라이언트가 0,1,2… 로 다시 매긴다. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    rev: bigint("rev", { mode: "number" }).notNull().default(sql`nextval('routine_rev_seq')`),
  },
  (t) => [index("routine_user_rev_idx").on(t.userId, t.rev)],
);

/**
 * 루틴 × 날짜 한 줄. id 는 `<routineId>:<YYYY-MM-DD>` — 두 기기가 같은 날 같은 루틴을 따로 체크해도
 * 같은 줄이 되게 클라이언트가 같은 규칙으로 만든다.
 *
 * `routine_id` 에 외래 키를 걸지 않았다 — 동기화는 순서가 뒤섞여 들어온다(기록이 루틴보다 먼저).
 */
export const routineLog = pgTable(
  "routine_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    routineId: text("routine_id").notNull(),
    /** `YYYY-MM-DD` — 그 사람의 로컬 날짜. */
    date: text("date").notNull(),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** 그날 기록한 시간(초). */
    secs: integer("secs").notNull().default(0),
    /** 타이머 세션 `[{start, end, secs}]`. */
    sessions: jsonb("sessions").$type<{ start: string; end: string; secs: number }[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    rev: bigint("rev", { mode: "number" }).notNull().default(sql`nextval('routine_rev_seq')`),
  },
  (t) => [
    index("routine_log_user_rev_idx").on(t.userId, t.rev),
    uniqueIndex("routine_log_user_day_unique").on(t.userId, t.routineId, t.date),
  ],
);

/**
 * 돌고 있는 타이머 — 사람마다 한 줄. 폰에서 켠 타이머가 맥에도 보이게.
 * 멈추면 `routine_id` 가 빈다(줄은 남는다 — "멈췄다"도 동기화해야 하므로).
 */
export const routineTimer = pgTable("routine_timer", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  routineId: text("routine_id"),
  /** 시작한 로컬 날짜. 자정을 넘겨도 이 날짜에 기록한다. */
  date: text("date"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  rev: bigint("rev", { mode: "number" }).notNull().default(sql`nextval('routine_rev_seq')`),
});

export type Routine = typeof routine.$inferSelect;
export type RoutineLog = typeof routineLog.$inferSelect;
