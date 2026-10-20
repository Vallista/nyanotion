import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { calendarEvent, calendarFeed } from "../schema/calendar";

/**
 * 외부 캘린더 구독 (0020) — `docs/14-calendar.md`.
 *
 * 권한은 **space** 다. 목록·일정 질의는 전부 `spaceIds` 로 좁히고, 구독을 달거나 떼는 쪽은
 * 그 space 에 쓸 수 있는지를 부르는 쪽이 본다 (체크리스트 만들기와 같은 규칙).
 */

export type FeedSummary = {
  id: string;
  spaceId: string;
  name: string;
  /** 주소 전체는 내보내지 않는다 — 비공개 주소는 주소 자체가 열쇠다. */
  host: string;
  color: string | null;
  fetchedAt: string | null;
  checkedAt: string | null;
  error: string | null;
  events: number;
};

export type CalendarEventRow = {
  id: string;
  feedId: string;
  spaceId: string;
  calendarName: string;
  color: string | null;
  title: string;
  location: string | null;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function listCalendarFeeds(spaceIds: readonly string[]): Promise<FeedSummary[]> {
  if (spaceIds.length === 0) return [];
  const rows = await db
    .select({
      feed: calendarFeed,
      // 하위 질의 안에서는 칼럼 이름이 표 이름 없이 찍혀 "id" 가 calendar_event 의 것으로 읽힌다 — 표 이름을 박는다.
      events: sql<number>`(select count(*) from "calendar_event" e where e."feed_id" = "calendar_feed"."id")`,
    })
    .from(calendarFeed)
    .where(inArray(calendarFeed.spaceId, [...spaceIds]))
    .orderBy(asc(calendarFeed.createdAt));
  // 원시 집계는 타입이 보장되지 않는다 — 숫자로 바꿔서 내보낸다.
  return rows.map(({ feed, events }) => ({
    id: feed.id,
    spaceId: feed.spaceId,
    name: feed.name,
    host: hostOf(feed.url),
    color: feed.color,
    fetchedAt: feed.fetchedAt?.toISOString() ?? null,
    checkedAt: feed.checkedAt?.toISOString() ?? null,
    error: feed.error,
    events: Number(events),
  }));
}

/** 구독이 매인 space. 떼기·다시 가져오기 전에 권한을 이걸로 본다. */
export async function spaceOfCalendarFeed(feedId: string): Promise<string | null> {
  const rows = await db
    .select({ spaceId: calendarFeed.spaceId })
    .from(calendarFeed)
    .where(eq(calendarFeed.id, feedId))
    .limit(1);
  return rows[0]?.spaceId ?? null;
}

export async function addCalendarFeed(input: {
  spaceId: string;
  userId: string;
  name: string;
  url: string;
  color: string | null;
}): Promise<string> {
  const id = newId();
  await db.insert(calendarFeed).values({
    id,
    spaceId: input.spaceId,
    name: input.name,
    url: input.url,
    color: input.color,
    createdBy: input.userId,
  });
  return id;
}

export async function updateCalendarFeed(
  feedId: string,
  patch: { name?: string; color?: string | null },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.color !== undefined) values.color = patch.color;
  if (Object.keys(values).length === 0) return;
  await db.update(calendarFeed).set(values).where(eq(calendarFeed.id, feedId));
}

/** 구독을 뗀다. 가져온 일정도 같이 사라진다 (`on delete cascade`). 원본 캘린더는 그대로다. */
export async function removeCalendarFeed(feedId: string): Promise<void> {
  await db.delete(calendarFeed).where(eq(calendarFeed.id, feedId));
}

/** 곧 다시 가져오게 한다 — 워커가 다음 바퀴에 집는다. */
export async function requestFeedRefresh(feedId: string): Promise<void> {
  await db.update(calendarFeed).set({ checkedAt: null }).where(eq(calendarFeed.id, feedId));
}

/**
 * `from`~`to` 와 겹치는 일정 (둘 다 포함). **space 로 좁힌다.**
 * 여러 날짜에 걸친 일정은 시작이 범위 앞이어도 끝이 범위 안이면 나온다.
 */
export async function calendarEvents(
  spaceIds: readonly string[],
  from: string,
  to: string,
  limit = 2000,
): Promise<CalendarEventRow[]> {
  if (spaceIds.length === 0) return [];
  const rows = await db
    .select({
      id: calendarEvent.id,
      feedId: calendarEvent.feedId,
      spaceId: calendarFeed.spaceId,
      calendarName: calendarFeed.name,
      color: calendarFeed.color,
      title: calendarEvent.title,
      location: calendarEvent.location,
      startsOn: calendarEvent.startsOn,
      startTime: calendarEvent.startTime,
      endsOn: calendarEvent.endsOn,
      endTime: calendarEvent.endTime,
    })
    .from(calendarEvent)
    .innerJoin(calendarFeed, eq(calendarEvent.feedId, calendarFeed.id))
    .where(
      and(
        inArray(calendarFeed.spaceId, [...spaceIds]),
        lte(calendarEvent.startsOn, to),
        gte(calendarEvent.endsOn, from),
      ),
    )
    .orderBy(asc(calendarEvent.startsOn), asc(calendarEvent.startTime))
    .limit(limit);
  return rows;
}

/* ------------------------------------------------------------------ 가져오기 (워커 전용) */

export type DueFeed = { id: string; url: string; name: string };

/**
 * **워커 전용** — 가져올 때가 된 구독. space 로 좁히지 않는다 (사람이 아니라 이 집 프로세스다).
 * 화면에서 부르지 말 것 — 주소 전체가 담겨 나온다.
 */
export async function feedsDueForFetch(everyMs: number, limit = 5): Promise<DueFeed[]> {
  const before = new Date(Date.now() - everyMs);
  return db
    .select({ id: calendarFeed.id, url: calendarFeed.url, name: calendarFeed.name })
    .from(calendarFeed)
    .where(or(isNull(calendarFeed.checkedAt), lt(calendarFeed.checkedAt, before)))
    .orderBy(sql`${calendarFeed.checkedAt} asc nulls first`)
    .limit(limit);
}

export type IncomingEvent = {
  uid: string;
  title: string;
  location: string | null;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
};

/**
 * 가져온 일정으로 **통째로 갈아 끼운다.** 원본에서 지운 일정이 여기 남지 않게 —
 * 하나씩 맞추는 것보다 단순하고, 사본이라 잃을 것이 없다. 한 트랜잭션이라 화면이 반쯤 빈 것을 보지 않는다.
 */
export async function replaceFeedEvents(feedId: string, events: readonly IncomingEvent[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(calendarEvent).where(eq(calendarEvent.feedId, feedId));
    for (let i = 0; i < events.length; i += 500) {
      const chunk = events.slice(i, i + 500);
      if (chunk.length === 0) continue;
      await tx.insert(calendarEvent).values(chunk.map((event) => ({ id: newId(), feedId, ...event })));
    }
    await tx
      .update(calendarFeed)
      .set({ checkedAt: new Date(), fetchedAt: new Date(), error: null })
      .where(eq(calendarFeed.id, feedId));
  });
}

/** 가져오지 못했다. **있던 일정은 그대로 둔다** — 한 번 실패했다고 캘린더가 비면 안 된다. */
export async function markFeedFailed(feedId: string, reason: string): Promise<void> {
  await db
    .update(calendarFeed)
    .set({ checkedAt: new Date(), error: reason.slice(0, 300) })
    .where(eq(calendarFeed.id, feedId));
}
