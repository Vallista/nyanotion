/**
 * 외부 캘린더(iCal) 가져오기 — `docs/14-calendar.md`.
 *
 * 구독한 주소에서 ICS 를 받아 **이 집 시간대의 날짜·시간 문자열로 펼쳐** `calendar_event` 에 갈아 끼운다.
 * 반복 일정(RRULE)·빠진 날(EXDATE)·고친 회차(RECURRENCE-ID)는 ical.js 가 푼다. 화면은 RRULE 을 모른다.
 *
 * **집 서버가 대신 가져오는 길이다.** 아무 주소나 받으면 집 안(Ollama·Postgres·공유기)을 찌르는 데
 * 쓸 수 있으므로 https 만 받고, 이름을 풀어 사설·루프백 주소면 거절하고, 넘겨주기(redirect)도 매번 다시 본다.
 *
 * GPU 와 무관해 게임 중에도 돈다. 실패해도 있던 일정은 그대로 둔다 (`markFeedFailed`).
 */
import {
  feedsDueForFetch,
  markFeedFailed,
  replaceFeedEvents,
  type IncomingEvent,
} from "@nyanotion/db";
import { HOME_TIME_ZONE, addDays, homeNow, normalizeFeedUrl } from "@nyanotion/shared";
import ICAL from "ical.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** 한 구독을 다시 가져오는 간격. */
export const FEED_EVERY_MS = 15 * 60_000;
/** 지난 일정은 이만큼 앞까지, 앞으로의 일정은 이만큼 뒤까지 펼친다. */
const PAST_DAYS = 62;
const FUTURE_DAYS = 400;
/** 한 캘린더에서 받는 최대 크기 · 일정 수. 터무니없는 주소가 워커를 붙잡지 않게. */
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EVENTS = 20_000;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

/* ------------------------------------------------------------------ 주소 지키기 */

/** 집 안을 가리키는 주소인가. Tailscale(100.64/10)도 집 안이다. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("ff")
  );
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("집 안 주소는 가져오지 않습니다.");
  }
}

/** ICS 본문을 받아 온다. 넘겨주기는 손으로 따라가며 매번 주소를 다시 본다. */
export async function fetchIcs(raw: string): Promise<string> {
  let current = normalizeFeedUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current === null) throw new Error("https 주소만 받습니다.");
    const url = new URL(current);
    await assertPublicHost(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/calendar, */*;q=0.5", "user-agent": "nyanotion-calendar/1" },
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      current = next === null ? null : normalizeFeedUrl(new URL(next, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`캘린더 서버가 ${response.status} 를 돌려줬습니다.`);
    const text = await readCapped(response);
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("iCal(ICS) 주소가 아닌 것 같습니다.");
    return text;
  }
  throw new Error("넘겨주기가 너무 많습니다.");
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new Error("캘린더가 너무 큽니다.");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/* ------------------------------------------------------------------ 시간대 */

/** 그 시간대에서 `ms` 순간의 UTC 와의 차이 (ms). */
function offsetIn(zone: string, ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - ms;
}

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * ICS 의 시각 하나를 **이 집의 날짜·시간**으로.
 *
 *  - 날짜만(종일)        → 그 날짜 그대로
 *  - UTC · VTIMEZONE 이 있는 시간대 → 그 순간을 서울 시각으로
 *  - VTIMEZONE 없이 TZID 만 (IANA 이름) → 그 시간대의 벽시계를 순간으로 바꿔 서울 시각으로
 *  - 떠 있는 시각(floating)·모르는 시간대 → 벽시계 그대로 (이 집 시각으로 본다)
 */
export function toHome(time: ICAL.Time): { day: string; time: string | null } {
  const wall = {
    day: `${time.year}-${pad(time.month)}-${pad(time.day)}`,
    time: `${pad(time.hour)}:${pad(time.minute)}`,
  };
  if (time.isDate) return { day: wall.day, time: null };

  const tzid = time.zone?.tzid;
  if (tzid !== undefined && tzid !== "floating") return homeNow(time.toJSDate());

  const named = (time as unknown as { timezone?: string }).timezone;
  if (named !== undefined && named !== HOME_TIME_ZONE && knownZone(named)) {
    const guess = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
    let instant = guess - offsetIn(named, guess);
    instant = guess - offsetIn(named, instant);
    return homeNow(new Date(instant));
  }
  return wall;
}

/* ------------------------------------------------------------------ 펼치기 */

function occurrence(uid: string, title: string, location: string | null, start: ICAL.Time, end: ICAL.Time | null): IncomingEvent {
  const from = toHome(start);
  if (from.time === null) {
    // 종일 — DTEND 는 "다음 날"이다. 마지막 날을 포함하는 꼴로 바꾼다.
    const until = end === null ? from.day : addDays(toHome(end).day, -1);
    return { uid, title, location, startsOn: from.day, startTime: null, endsOn: until < from.day ? from.day : until, endTime: null };
  }
  let to = end === null ? from : toHome(end);
  if (to.time === null) to = { day: to.day, time: "00:00" };
  let endsOn = to.day;
  let endTime = to.time ?? from.time;
  // 자정에 끝나면 그 전날 밤까지로 — 다음 날 칸에 0분짜리 꼬리가 생기지 않게.
  if (endTime === "00:00" && endsOn > from.day) {
    endsOn = addDays(endsOn, -1);
    endTime = "23:59";
  }
  if (endsOn < from.day || (endsOn === from.day && endTime < from.time)) {
    endsOn = from.day;
    endTime = from.time;
  }
  return { uid, title, location, startsOn: from.day, startTime: from.time, endsOn, endTime };
}

/**
 * ICS 본문 → 펼친 일정들. `today` 를 기준으로 앞뒤 기간만 담는다. 네트워크를 모르는 순수 함수라
 * 스모크가 이것만 따로 시험한다.
 */
export function parseIcs(text: string, today: string = homeNow().day): IncomingEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const zone of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(zone);
    } catch {
      // 망가진 VTIMEZONE 하나 때문에 캘린더 전체를 버리지 않는다 — 그 시각들은 TZID 이름으로 푼다.
    }
  }

  const windowFrom = addDays(today, -PAST_DAYS);
  const windowTo = addDays(today, FUTURE_DAYS);

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Component[] = [];
  const singles: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents("vevent")) {
    if (String(component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) exceptions.push(component);
    else if (event.isRecurring()) masters.set(event.uid, event);
    else singles.push(event);
  }
  for (const component of exceptions) {
    const master = masters.get(String(component.getFirstPropertyValue("uid") ?? ""));
    if (master !== undefined) master.relateException(component);
    else singles.push(new ICAL.Event(component));
  }

  const out: IncomingEvent[] = [];
  const keep = (event: IncomingEvent): void => {
    if (event.endsOn >= windowFrom && event.startsOn <= windowTo) out.push(event);
  };
  const label = (event: ICAL.Event) => ({
    title: (event.summary ?? "").trim().slice(0, 300) || "(제목 없음)",
    location: (event.location ?? "").trim().slice(0, 200) || null,
  });

  for (const event of singles) {
    if (out.length >= MAX_EVENTS) break;
    if (event.startDate === null) continue;
    const { title, location } = label(event);
    keep(occurrence(event.uid ?? "", title, location, event.startDate, event.endDate ?? null));
  }

  for (const event of masters.values()) {
    const iterator = event.iterator();
    for (let i = 0; i < 3000 && out.length < MAX_EVENTS; i += 1) {
      const next = iterator.next();
      if (next === null || next === undefined) break;
      const details = event.getOccurrenceDetails(next);
      const start = toHome(details.startDate);
      if (start.day > windowTo) break;
      if (String(details.item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
      const { title, location } = label(details.item);
      keep(occurrence(event.uid ?? "", title, location, details.startDate, details.endDate ?? null));
    }
  }

  return out.slice(0, MAX_EVENTS);
}

/* ------------------------------------------------------------------ 워커 한 바퀴 */

/** 때가 된 구독을 가져온다. 돌려주는 값은 가져온 구독 수 · 실패 수. */
export async function refreshDueFeeds(): Promise<{ fetched: number; failed: number; events: number }> {
  const feeds = await feedsDueForFetch(FEED_EVERY_MS);
  let fetched = 0;
  let failed = 0;
  let events = 0;
  for (const feed of feeds) {
    try {
      const parsed = parseIcs(await fetchIcs(feed.url));
      await replaceFeedEvents(feed.id, parsed);
      fetched += 1;
      events += parsed.length;
    } catch (error) {
      failed += 1;
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? "캘린더 서버가 너무 오래 답하지 않습니다."
          : error instanceof Error
            ? error.message
            : String(error);
      await markFeedFailed(feed.id, reason);
    }
  }
  return { fetched, failed, events };
}
