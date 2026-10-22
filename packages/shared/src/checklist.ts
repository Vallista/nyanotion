/**
 * 체크리스트의 규칙 — 서버·화면·워커가 같이 쓴다. 런타임 의존이 없어야 한다.
 *
 * **날짜는 `YYYY-MM-DD` 문자열, 시간은 `HH:MM` 문자열이다.** `Date` 로 들고 다니면 시간대가 끼어
 * 하루가 밀린다 (`purchase_item.needed_by` 와 같은 이유). "오늘"은 늘 이 집의 시간대로 센다.
 */

/** 이 집의 시간대. 서버가 어디서 돌든 "오늘"은 여기 기준이다. */
export const HOME_TIME_ZONE = "Asia/Seoul";

/**
 *  none      한 번
 *  daily     매일
 *  weekdays  평일 (월~금 — 금요일 다음은 월요일)
 *  weekly    매주 (같은 요일)
 *  monthly   매달 (같은 날 — 없는 날이면 그달 마지막 날)
 *  yearly    매년 (같은 달 같은 날 — 2월 29일은 없는 해에 28일)
 *
 * **더하기만 한다.** 값은 `checklist_item.repeat` 에 글자로 남으므로 이름을 바꾸면 이미 적힌 반복이 깨진다.
 */
export const CHECKLIST_REPEATS = ["none", "daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type ChecklistRepeat = (typeof CHECKLIST_REPEATS)[number];

export const REPEAT_LABEL: Record<ChecklistRepeat, string> = {
  none: "반복 안 함",
  daily: "매일",
  weekdays: "평일마다",
  weekly: "매주",
  monthly: "매달",
  yearly: "매년",
};

export function asRepeat(value: string): ChecklistRepeat {
  return (CHECKLIST_REPEATS as readonly string[]).includes(value)
    ? (value as ChecklistRepeat)
    : "none";
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 사람이 넣은 날짜를 믿지 않는다 — 모양이 맞고 실제로 있는 날이어야 한다. */
export function cleanDay(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const day = value.trim();
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? day
    : null;
}

export function cleanTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const time = value.trim();
  return TIME_RE.test(time) ? time : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fromUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** `day` 에서 n 일 뒤. 음수면 앞으로. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return fromUtc(new Date(Date.UTC(y, m - 1, d + n)));
}

/**
 * 반복 일정의 다음 날짜.
 *
 * 매달은 **원래 날을 지킨다** — 31일짜리를 2월로 넘기면 28일이 되지만, 그다음 달에는 다시 31일로
 * 돌아가야 한다. 그래서 `anchorDay`(처음 정한 날의 "일")를 따로 받는다.
 */
export function nextDueOn(day: string, repeat: ChecklistRepeat, anchorDay?: number): string | null {
  switch (repeat) {
    case "none":
      return null;
    case "daily":
      return addDays(day, 1);
    case "weekdays": {
      // 금(5) → 월 +3, 토(6) → 월 +2, 그 밖은 다음 날.
      const weekday = weekdayOf(day);
      return addDays(day, weekday === 5 ? 3 : weekday === 6 ? 2 : 1);
    }
    case "weekly":
      return addDays(day, 7);
    case "monthly":
    case "yearly": {
      const [y, m, d] = day.split("-").map(Number) as [number, number, number];
      const want = anchorDay ?? d;
      const year = repeat === "yearly" || m === 12 ? y + 1 : y;
      const month = repeat === "yearly" ? m : m === 12 ? 1 : m + 1;
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return `${year}-${pad(month)}-${pad(Math.min(want, last))}`;
    }
  }
}

/** 그날의 요일 — 0 이 일요일. 날짜 문자열만 보고 센다(시간대와 무관). */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 이 집 시간대로 지금이 며칠 몇 시인가. */
export function homeNow(now: Date = new Date()): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** 시간을 안 정한 일은 그날 이 시각에 알린다. */
export const DEFAULT_REMIND_TIME = "09:00";

/** 화면에 "오늘 · 내일 · 3일 지남" 처럼. */
export function describeDue(dueOn: string, today: string): { label: string; tone: "late" | "today" | "soon" | "later" } {
  const [y1, m1, d1] = today.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = dueOn.split("-").map(Number) as [number, number, number];
  const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
  if (diff < 0) return { label: `${-diff}일 지남`, tone: "late" };
  if (diff === 0) return { label: "오늘", tone: "today" };
  if (diff === 1) return { label: "내일", tone: "soon" };
  if (diff < 7) {
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y2, m2 - 1, d2)).getUTCDay()];
    return { label: `${weekday}요일`, tone: "soon" };
  }
  return { label: `${m2}월 ${d2}일`, tone: "later" };
}

/**
 * 쇼핑몰 **검색 결과 화면** 주소. 사람이 눌러서 직접 보는 길이다 — 자동 접속이 아니다.
 * 값을 찾아 오는 일은 구매 에이전트(`docs/08-purchase.md`)가 따로 한다.
 */
export const SHOPPING_SOURCES = ["naver", "coupang"] as const;
export type ShoppingSource = (typeof SHOPPING_SOURCES)[number];

export function shoppingSearchUrl(source: ShoppingSource, query: string): string {
  const q = encodeURIComponent(query.trim());
  return source === "naver"
    ? `https://search.shopping.naver.com/search/all?query=${q}`
    : `https://www.coupang.com/np/search?q=${q}`;
}
