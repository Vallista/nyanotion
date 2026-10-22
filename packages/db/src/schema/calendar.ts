import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { space } from "./app";
import { user } from "./auth";

/**
 * 외부 캘린더 구독 — Google·iCloud 등이 내주는 **iCal(ICS) 주소** 하나 (0020).
 *
 * **space 에 매인다.** 가족 space 에 달면 가족 모두가, 내 space 에 달면 나만 그 일정을 본다 —
 * 문서와 같은 경계라 권한을 새로 만들지 않는다. 읽기만 한다: 냥노션이 외부 캘린더에 쓰지 않는다.
 *
 * `url` 은 **비밀값처럼 다룬다.** Google 의 "비공개 주소"는 주소 자체가 열쇠다 — 화면에는 호스트만
 * 내보내고 주소 전체는 다시 보여 주지 않는다.
 */
export const calendarFeed = pgTable(
  "calendar_feed",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** 화면에서 이 캘린더의 일정을 칠할 색 (`#rrggbb`). 없으면 화면이 고른다. */
    color: text("color"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** 마지막으로 가져오려고 한 때 (성공·실패 무관). 비우면 워커가 곧 다시 가져온다. */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    /** 마지막으로 가져오는 데 성공한 때. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    /** 마지막 시도가 실패했으면 그 까닭. 성공하면 비운다. */
    error: text("error"),
  },
  (t) => [index("calendar_feed_space_idx").on(t.spaceId)],
);

/**
 * 구독한 캘린더에서 가져온 일정의 **사본.** 원본은 저쪽에 있고, 워커가 가져올 때마다 그 캘린더의
 * 줄을 통째로 갈아 끼운다 — 그래서 고치지 않는다.
 *
 * 반복 일정은 **펼쳐서** 담는다 (가져올 때 앞뒤 기간만). 화면이 RRULE 을 몰라도 되게.
 * 날짜·시간은 체크리스트와 같이 **이 집 시간대의 `YYYY-MM-DD` · `HH:MM` 문자열**이다.
 * 종일 일정은 시간이 없고, `ends_on` 은 **마지막 날을 포함한다** (ICS 의 DTEND 는 다음 날이다).
 */
export const calendarEvent = pgTable(
  "calendar_event",
  {
    id: text("id").primaryKey(),
    feedId: text("feed_id")
      .notNull()
      .references(() => calendarFeed.id, { onDelete: "cascade" }),
    /** 원본의 UID. 반복 일정이면 펼친 것들이 같은 값을 갖는다. */
    uid: text("uid").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    startsOn: text("starts_on").notNull(),
    /** 없으면 종일. */
    startTime: text("start_time"),
    endsOn: text("ends_on").notNull(),
    endTime: text("end_time"),
  },
  (t) => [index("calendar_event_range_idx").on(t.feedId, t.startsOn, t.endsOn)],
);

export type CalendarFeed = typeof calendarFeed.$inferSelect;
export type CalendarEvent = typeof calendarEvent.$inferSelect;
