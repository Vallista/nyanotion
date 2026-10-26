/**
 * 생활 기록의 규칙 — 일정 · 메모 · 기분 · 회고 기간. 서버 동작과 화면이 같이 쓴다 (`docs/15-today.md`).
 * DB·Next·DOM 을 모른다.
 */
import { addDays, cleanDay, cleanTime } from "./checklist";
import { FEED_COLORS, minutesOf, startOfWeek, timeOf } from "./calendar";

export class LifeRuleError extends Error {}

/* ------------------------------------------------------------------ 일정 */

export type PlanEventFields = {
  title: string;
  startsOn: string;
  startTime: string | null;
  endsOn: string;
  endTime: string | null;
  color: string | null;
  location: string | null;
  note: string | null;
};

/** 일정 색 — 구독 캘린더와 같은 팔레트. 안 고르면 첫 색. */
export const PLAN_COLORS = FEED_COLORS;
export const PLAN_DEFAULT_COLOR = FEED_COLORS[0];
const DEFAULT_EVENT_MIN = 60;

function trimOrNull(value: string | null | undefined, max: number): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v.slice(0, max);
}

/**
 * 사람이 넣은 일정을 믿을 수 있는 모양으로. 맞지 않으면 `LifeRuleError`.
 * - 종일이면 시간 둘 다 없다. 시간이 있으면 시작 시각은 꼭, 끝 시각은 없으면 한 시간 뒤(자정을 넘기면 23:59).
 * - 같은 날이면 끝이 시작보다 늦어야 한다. 끝 날은 시작 날보다 앞일 수 없다.
 */
export function normalizePlanEvent(input: {
  title: string;
  startsOn: string;
  startTime?: string | null;
  endsOn?: string | null;
  endTime?: string | null;
  color?: string | null;
  location?: string | null;
  note?: string | null;
}): PlanEventFields {
  const title = input.title.trim();
  if (title === "") throw new LifeRuleError("일정 이름을 적어 주세요.");
  if ([...title].length > 120) throw new LifeRuleError("일정 이름은 120자까지예요.");
  const startsOn = cleanDay(input.startsOn);
  if (startsOn === null) throw new LifeRuleError("날짜가 올바르지 않아요.");
  const endsOn = input.endsOn === null || input.endsOn === undefined || input.endsOn === "" ? startsOn : cleanDay(input.endsOn);
  if (endsOn === null) throw new LifeRuleError("끝나는 날짜가 올바르지 않아요.");
  if (endsOn < startsOn) throw new LifeRuleError("끝나는 날이 시작하는 날보다 앞이에요.");

  const rawStart = input.startTime ?? null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (rawStart !== null && rawStart !== "") {
    startTime = cleanTime(rawStart);
    if (startTime === null) throw new LifeRuleError("시작 시각이 올바르지 않아요.");
    const rawEnd = input.endTime ?? null;
    if (rawEnd === null || rawEnd === "") {
      endTime = endsOn === startsOn ? timeOf(minutesOf(startTime) + DEFAULT_EVENT_MIN) : startTime;
    } else {
      endTime = cleanTime(rawEnd);
      if (endTime === null) throw new LifeRuleError("끝 시각이 올바르지 않아요.");
    }
    if (endsOn === startsOn && minutesOf(endTime) <= minutesOf(startTime)) {
      throw new LifeRuleError("끝 시각이 시작보다 늦어야 해요.");
    }
  }

  const color =
    input.color !== null && input.color !== undefined && (PLAN_COLORS as readonly string[]).includes(input.color)
      ? input.color
      : null;
  return {
    title,
    startsOn,
    startTime,
    endsOn,
    endTime,
    color,
    location: trimOrNull(input.location, 200),
    note: trimOrNull(input.note, 4000),
  };
}

/** 일정을 `day`(·`time`)로 옮긴다 — 길이(날 수 · 분)는 그대로. 종일 줄에 놓으면 종일이 된다. */
export function movePlanEvent(event: PlanEventFields, day: string, time: string | null): PlanEventFields {
  const spanDays = dayGap(event.startsOn, event.endsOn);
  if (time === null) {
    return { ...event, startsOn: day, endsOn: addDays(day, spanDays), startTime: null, endTime: null };
  }
  if (event.startTime === null) {
    return { ...event, startsOn: day, endsOn: day, startTime: time, endTime: timeOf(minutesOf(time) + DEFAULT_EVENT_MIN) };
  }
  const length = spanDays * 24 * 60 + minutesOf(event.endTime ?? event.startTime) - minutesOf(event.startTime);
  const endAbs = minutesOf(time) + Math.max(length, 15);
  const endsOn = addDays(day, Math.floor(endAbs / (24 * 60)));
  const endMin = endAbs % (24 * 60);
  // 자정에 딱 끝나면 그날 23:59 까지로 — 다음 날 00:00 짜리 칸을 만들지 않는다.
  if (endMin === 0 && endsOn > day) return { ...event, startsOn: day, startTime: time, endsOn: addDays(endsOn, -1), endTime: "23:59" };
  return { ...event, startsOn: day, startTime: time, endsOn, endTime: timeOf(endMin) };
}

function dayGap(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/* ------------------------------------------------------------------ 메모 */

export const MEMO_MAX = 4000;

export function normalizeMemo(text: string): string {
  const value = text.replace(/\r\n/g, "\n").trim();
  if (value === "") throw new LifeRuleError("메모를 적어 주세요.");
  if (value.length > MEMO_MAX) throw new LifeRuleError(`메모는 ${MEMO_MAX}자까지예요.`);
  return value;
}

/** 메모의 첫 줄 — 할 일·문서로 옮길 때 제목이 된다. */
export function memoTitle(text: string): string {
  const first = text.split("\n").find((line) => line.trim() !== "") ?? "";
  return first.trim().slice(0, 200);
}

/* ------------------------------------------------------------------ 기분 · 에너지 */

export const MOOD_LEVELS = [1, 2, 3, 4, 5] as const;
export const MOOD_LABEL: Record<number, string> = { 1: "많이 처짐", 2: "처짐", 3: "보통", 4: "좋음", 5: "아주 좋음" };
export const ENERGY_LABEL: Record<number, string> = { 1: "바닥", 2: "낮음", 3: "보통", 4: "높음", 5: "가득" };

export function cleanLevel(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= 5 ? n : null;
}

/* ------------------------------------------------------------------ 회고 기간 */

export type ReviewPeriodKind = "week" | "month";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * 주 이름 `2026-W43` — 이 앱의 주(일요일 시작)를 그 주가 시작한 해의 몇 번째 주로 센다.
 * 1월 1일이 든 주가 1주. Bento 의 일요일 시작 주 이름과 같은 셈이다(가져온 회고가 같은 주를 가리키게).
 */
export function weekKey(day: string): string {
  const ws = startOfWeek(day);
  const year = Number(ws.slice(0, 4));
  const first = startOfWeek(`${year}-01-01`);
  return `${year}-W${pad(1 + Math.round(dayGap(first, ws) / 7))}`;
}

export function monthKey(day: string): string {
  return day.slice(0, 7);
}

/** 기간 이름 → 첫날·끝날. 모양이 틀리면 null. */
export function periodRange(kind: ReviewPeriodKind, period: string): { from: string; to: string } | null {
  if (kind === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (m === null || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    const from = `${period}-01`;
    const [y, mo] = [Number(m[1]), Number(m[2])];
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { from, to: `${period}-${pad(last)}` };
  }
  const w = /^(\d{4})-W(\d{2})$/.exec(period);
  if (w === null || Number(w[2]) < 1 || Number(w[2]) > 54) return null;
  const from = addDays(startOfWeek(`${w[1]}-01-01`), (Number(w[2]) - 1) * 7);
  return { from, to: addDays(from, 6) };
}

/** "10월 19일 – 25일 주" · "2026년 10월". */
export function periodLabel(kind: ReviewPeriodKind, period: string): string {
  const range = periodRange(kind, period);
  if (range === null) return period;
  if (kind === "month") return `${range.from.slice(0, 4)}년 ${Number(range.from.slice(5, 7))}월`;
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
  return `${Number(range.from.slice(5, 7))}월 ${Number(range.from.slice(8))}일 – ${sameMonth ? "" : `${Number(range.to.slice(5, 7))}월 `}${Number(range.to.slice(8))}일 주`;
}
