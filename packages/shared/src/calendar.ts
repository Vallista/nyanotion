/**
 * 캘린더의 규칙 — 첫 화면·서버·워커가 같이 쓴다. 런타임 의존이 없어야 한다.
 *
 * 체크리스트와 같이 **날짜는 `YYYY-MM-DD`, 시간은 `HH:MM` 문자열**이고 이 집 시간대로 센다.
 * 주는 **일요일에 시작한다** — 이 집이 쓰는 캘린더(네이버·구글 한국어)가 다 그렇다.
 */
import { addDays, nextDueOn, weekdayOf, type ChecklistRepeat } from "./checklist";

export const CALENDAR_VIEWS = ["day", "week", "month"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** 백로그에서 시간 칸에 놓을 때 소요 시간을 안 정했으면 이만큼. */
export const DEFAULT_BLOCK_MIN = 60;
/** 고를 수 있는 소요 시간 (분). */
export const BLOCK_MINUTES = [15, 30, 45, 60, 90, 120, 180, 240] as const;

/** 그 날이 든 주의 일요일. */
export function startOfWeek(day: string): string {
  return addDays(day, -weekdayOf(day));
}

/** 그 날이 든 달의 1일. */
export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** 달을 n 개 넘긴다. 날짜는 1일로 맞춘다. */
export function addMonths(day: string, n: number): string {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + n;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * 보기마다 화면에 보이는 첫날·마지막 날 (둘 다 포함).
 * 달 보기는 6주 격자 — 앞뒤 달의 날이 끼므로 그 날들의 일정도 같이 가져온다.
 */
export function visibleRange(view: CalendarView, anchor: string): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  const from = startOfWeek(startOfMonth(anchor));
  return { from, to: addDays(from, 41) };
}

/** `from` 부터 `to` 까지의 날들 (둘 다 포함). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to && out.length < 400; day = addDays(day, 1)) out.push(day);
  return out;
}

/**
 * 반복 할 일이 앞으로 **될 날들** — `from`~`to` 안에서, 지금 줄의 날짜(`dueOn`)는 빼고.
 *
 * 반복은 체크할 때 다음 줄을 만든다(`setChecklistItemDone`). 그래서 DB 에는 늘 "다음 한 번"만 있다.
 * 캘린더는 그 뒤의 날들도 보여 줘야 "매주 화요일 분리수거"가 달력에 보인다 — 그건 여기서 **그려만 준다.**
 * 실제 줄은 여전히 체크할 때 생긴다.
 */
export function projectRepeats(
  dueOn: string,
  repeat: ChecklistRepeat,
  from: string,
  to: string,
  anchorDay?: number,
  limit = 400,
): string[] {
  if (repeat === "none") return [];
  const out: string[] = [];
  let day: string | null = dueOn;
  for (let i = 0; i < 2000 && out.length < limit; i += 1) {
    day = nextDueOn(day, repeat, anchorDay);
    if (day === null || day > to) break;
    if (day >= from) out.push(day);
  }
  return out;
}

/** `HH:MM` → 자정부터 분. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** 자정부터 분 → `HH:MM` (0~23:59 로 자른다). */
export function timeOf(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * 구독 주소를 받아도 되는 모양으로. `webcal://` 은 `https://` 다 (애플·구글이 그렇게 준다).
 * **https 만 받는다** — 집 서버가 대신 가져오므로 `http://127.0.0.1:…` 같은 집 안 주소를 찌르는
 * 길이 되면 안 된다. 사설 주소인지는 가져오는 쪽이 이름을 풀어서 한 번 더 본다.
 */
export function normalizeFeedUrl(raw: string): string | null {
  const value = raw.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.hostname === "" || url.hostname === "localhost" || !url.hostname.includes(".")) return null;
  if (value.length > 2000) return null;
  return url.toString();
}

/**
 * 캘린더 색의 **키** — 구독·일정에 이 값이 저장된다. 화면 색은 `calendarColorVar` 가 테마 변수
 * (`--cal-1`…`--cal-6`, 라이트·다크마다 다른 시스템 색)로 바꾼다. 값을 바꾸면 저장된 색이 끊기니 그대로 둔다.
 * 순서대로 파랑 · 주황 · 보라 · 초록 · 분홍 · 갈색.
 */
export const FEED_COLORS = [
  "#4f7cac",
  "#b5651d",
  "#7a5c99",
  "#3f8f7a",
  "#b24a5b",
  "#8a8a3c",
] as const;

/** 저장된 캘린더 색 → 화면 색(CSS 변수). 모르는 값은 그대로 돌려준다. */
export function calendarColorVar(color: string): string {
  const index = (FEED_COLORS as readonly string[]).indexOf(color);
  return index === -1 ? color : `var(--cal-${index + 1})`;
}
