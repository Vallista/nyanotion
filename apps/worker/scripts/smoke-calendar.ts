/**
 * 캘린더 구독 점검 — iCal 펼치기 · 시간대 · 집 안 주소 거절 · **남의 캘린더는 안 보인다.**
 *   pnpm --filter @nyanotion/worker smoke:calendar
 *
 * 네트워크에 나가지 않는다 — ICS 본문을 직접 넣어 `parseIcs` 를 시험한다.
 * 두 사람(A·B)을 잠깐 만들고 끝나면 치운다.
 */
import {
  addCalendarFeed,
  calendarEvent,
  calendarEvents,
  db,
  feedsDueForFetch,
  listCalendarFeeds,
  loadEnv,
  markFeedFailed,
  newId,
  removeCalendarFeed,
  replaceFeedEvents,
  requestFeedRefresh,
  space,
  user,
} from "@nyanotion/db";
import { normalizeFeedUrl } from "@nyanotion/shared";
import { inArray } from "drizzle-orm";
import { isPrivateAddress, parseIcs } from "../src/calendars.ts";

loadEnv();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TODAY = "2026-10-20";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//smoke//EN
BEGIN:VTIMEZONE
TZID:Asia/Seoul
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
TZNAME:KST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:utc@smoke
DTSTART:20261020T000000Z
DTEND:20261020T013000Z
SUMMARY:UTC 회의
LOCATION:거실
END:VEVENT
BEGIN:VEVENT
UID:seoul@smoke
DTSTART;TZID=Asia/Seoul:20261021T190000
DTEND;TZID=Asia/Seoul:20261021T200000
SUMMARY:저녁 약속
END:VEVENT
BEGIN:VEVENT
UID:ny@smoke
DTSTART;TZID=America/New_York:20261022T090000
DTEND;TZID=America/New_York:20261022T100000
SUMMARY:뉴욕 통화
END:VEVENT
BEGIN:VEVENT
UID:floating@smoke
DTSTART:20261023T080000
DTEND:20261023T083000
SUMMARY:떠 있는 시각
END:VEVENT
BEGIN:VEVENT
UID:allday@smoke
DTSTART;VALUE=DATE:20261024
DTEND;VALUE=DATE:20261025
SUMMARY:소풍
END:VEVENT
BEGIN:VEVENT
UID:trip@smoke
DTSTART;VALUE=DATE:20261026
DTEND;VALUE=DATE:20261029
SUMMARY:제주 여행
END:VEVENT
BEGIN:VEVENT
UID:late@smoke
DTSTART;TZID=Asia/Seoul:20261027T230000
DTEND;TZID=Asia/Seoul:20261028T000000
SUMMARY:자정에 끝남
END:VEVENT
BEGIN:VEVENT
UID:cancel@smoke
DTSTART:20261020T050000Z
DTEND:20261020T060000Z
STATUS:CANCELLED
SUMMARY:취소된 일정
END:VEVENT
BEGIN:VEVENT
UID:old@smoke
DTSTART;VALUE=DATE:20200101
DTEND;VALUE=DATE:20200102
SUMMARY:아주 옛날
END:VEVENT
BEGIN:VEVENT
UID:weekly@smoke
DTSTART;TZID=Asia/Seoul:20261006T070000
DTEND;TZID=Asia/Seoul:20261006T073000
RRULE:FREQ=WEEKLY;COUNT=6
EXDATE;TZID=Asia/Seoul:20261020T070000
SUMMARY:분리수거
END:VEVENT
BEGIN:VEVENT
UID:weekly@smoke
RECURRENCE-ID;TZID=Asia/Seoul:20261027T070000
DTSTART;TZID=Asia/Seoul:20261027T080000
DTEND;TZID=Asia/Seoul:20261027T083000
SUMMARY:분리수거 (늦게)
END:VEVENT
BEGIN:VEVENT
UID:forever@smoke
DTSTART;VALUE=DATE:20200301
RRULE:FREQ=YEARLY
SUMMARY:생일
END:VEVENT
END:VCALENDAR`;

const TAG = "CALSMOKE";
const made = { users: [] as string[], spaces: [] as string[] };

async function makeUser(label: string): Promise<{ userId: string; spaceId: string }> {
  const userId = newId();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: `${TAG} ${label}`,
    email: `${TAG.toLowerCase()}-${label}-${userId.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(userId);
  const spaceId = newId();
  await db.insert(space).values({ id: spaceId, kind: "personal", ownerUserId: userId, name: `${TAG} ${label}` });
  made.spaces.push(spaceId);
  return { userId, spaceId };
}

async function main(): Promise<void> {
  console.log("iCal 펼치기");
  const events = parseIcs(ICS, TODAY);
  const by = (uid: string) => events.filter((e) => e.uid === uid);

  const utc = by("utc@smoke")[0];
  check("UTC 00:00 → 서울 09:00", utc?.startsOn === "2026-10-20" && utc?.startTime === "09:00" && utc?.endTime === "10:30", utc);
  check("장소가 같이 온다", utc?.location === "거실");
  const seoul = by("seoul@smoke")[0];
  check("서울 시각은 그대로", seoul?.startTime === "19:00" && seoul?.endTime === "20:00", seoul);
  const ny = by("ny@smoke")[0];
  check(
    "**VTIMEZONE 없는 뉴욕 09:00 → 서울 22:00** (서머타임 중)",
    ny?.startsOn === "2026-10-22" && ny?.startTime === "22:00" && ny?.endTime === "23:00",
    ny,
  );
  const floating = by("floating@smoke")[0];
  check("떠 있는 시각은 이 집 시각으로", floating?.startTime === "08:00", floating);
  const allday = by("allday@smoke")[0];
  check(
    "종일 — DTEND(다음 날)를 마지막 날로",
    allday?.startsOn === "2026-10-24" && allday?.endsOn === "2026-10-24" && allday?.startTime === null,
    allday,
  );
  const trip = by("trip@smoke")[0];
  check("여러 날 종일 — 26~28일", trip?.startsOn === "2026-10-26" && trip?.endsOn === "2026-10-28", trip);
  const late = by("late@smoke")[0];
  check("자정에 끝나면 그날 밤까지로", late?.endsOn === "2026-10-27" && late?.endTime === "23:59", late);
  check("취소된 일정은 빠진다", by("cancel@smoke").length === 0);
  check("기간 밖 옛 일정은 빠진다", by("old@smoke").length === 0);

  const weekly = by("weekly@smoke").map((e) => `${e.startsOn} ${e.startTime}`).sort();
  check(
    "**매주 6번 — 빠진 날(EXDATE)은 빼고 고친 회차는 고친 대로**",
    weekly.join() ===
      ["2026-10-06 07:00", "2026-10-13 07:00", "2026-10-27 08:00", "2026-11-03 07:00", "2026-11-10 07:00"].join(),
    weekly,
  );
  check("고친 회차는 고친 제목으로", by("weekly@smoke").some((e) => e.title === "분리수거 (늦게)"));
  const birthdays = by("forever@smoke").map((e) => e.startsOn);
  check("끝없는 반복은 기간 안만 (2027-03-01 하나)", birthdays.join() === "2027-03-01", birthdays);

  console.log("\n주소 지키기");
  check("webcal:// 은 https:// 로", normalizeFeedUrl("webcal://p01-caldav.icloud.com/published/2/abc") === "https://p01-caldav.icloud.com/published/2/abc");
  check("http 는 거절", normalizeFeedUrl("http://calendar.google.com/x.ics") === null);
  check("localhost 는 거절", normalizeFeedUrl("https://localhost/x.ics") === null);
  check("점 없는 이름은 거절", normalizeFeedUrl("https://nas/x.ics") === null);
  check("주소에 계정·비밀번호는 거절", normalizeFeedUrl("https://a:b@calendar.google.com/x.ics") === null);
  check("루프백은 집 안", isPrivateAddress("127.0.0.1") && isPrivateAddress("::1"));
  check("공유기 · 사설망은 집 안", isPrivateAddress("192.168.0.10") && isPrivateAddress("10.0.0.2") && isPrivateAddress("172.20.1.1"));
  check("Tailscale(100.64/10)도 집 안", isPrivateAddress("100.101.102.103"));
  check("IPv4 를 품은 IPv6 도", isPrivateAddress("::ffff:127.0.0.1"));
  check("공인 주소는 통과", !isPrivateAddress("142.250.196.110") && !isPrivateAddress("2404:6800:4004:80c::200e"));

  console.log("\n구독 — 남의 캘린더는 안 보인다");
  const a = await makeUser("a");
  const b = await makeUser("b");
  const feedId = await addCalendarFeed({
    spaceId: a.spaceId,
    userId: a.userId,
    name: `${TAG} 우리집`,
    url: "https://calendar.google.com/calendar/ical/secret-token/basic.ics",
    color: "#4f7cac",
  });
  check("단 구독은 곧 가져올 차례", (await feedsDueForFetch(15 * 60_000, 1000)).some((f) => f.id === feedId));
  await replaceFeedEvents(feedId, events);
  check("가져오면 차례에서 빠진다", !(await feedsDueForFetch(15 * 60_000, 1000)).some((f) => f.id === feedId));
  const listed = (await listCalendarFeeds([a.spaceId])).find((f) => f.id === feedId);
  check("A 목록에 있고 일정 수가 맞다", listed?.events === events.length, listed);
  check("**주소 전체는 내보내지 않는다 — 호스트만**", listed?.host === "calendar.google.com" && !JSON.stringify(listed).includes("secret-token"));
  check("**B 목록에는 없다**", (await listCalendarFeeds([b.spaceId])).length === 0);

  const week = await calendarEvents([a.spaceId], "2026-10-18", "2026-10-24");
  check("A 의 이번 주 일정", week.some((e) => e.title === "UTC 회의") && week.some((e) => e.title === "소풍"));
  check("일정에 캘린더 이름·색이 붙는다", week[0]?.calendarName === `${TAG} 우리집` && week[0]?.color === "#4f7cac");
  check("**B 캘린더에는 없다**", (await calendarEvents([b.spaceId], "2026-10-18", "2026-10-24")).length === 0);
  check(
    "범위 앞에서 시작해 범위 안에서 끝나는 여행도 나온다",
    (await calendarEvents([a.spaceId], "2026-10-27", "2026-10-31")).some((e) => e.title === "제주 여행"),
  );

  await markFeedFailed(feedId, "캘린더 서버가 500 을 돌려줬습니다.");
  check("실패해도 있던 일정은 그대로", (await calendarEvents([a.spaceId], "2026-10-18", "2026-10-24")).length === week.length);
  check("실패 까닭이 보인다", (await listCalendarFeeds([a.spaceId]))[0]?.error?.includes("500") === true);
  await requestFeedRefresh(feedId);
  check("다시 가져오기를 누르면 곧 차례", (await feedsDueForFetch(15 * 60_000, 1000)).some((f) => f.id === feedId));

  await removeCalendarFeed(feedId);
  check("떼면 일정도 같이 사라진다", (await db.select().from(calendarEvent).where(inArray(calendarEvent.feedId, [feedId]))).length === 0);
}

async function cleanup(): Promise<void> {
  if (made.spaces.length > 0) await db.delete(space).where(inArray(space.id, made.spaces));
  if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
