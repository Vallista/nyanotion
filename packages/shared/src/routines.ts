/**
 * 루틴(습관) — 규칙과 통계. 서버(`lib/routine-actions.ts`)와 화면이 같이 쓴다.
 *
 * 맥 Bento(`apps/admin/src-tauri/src/commands/routines.rs`)·iPhone(`RoutineKit`)과 **같은 규칙**이다.
 * 하나를 바꾸면 셋을 같이 바꾼다 — 서버는 셋 중 누가 고쳐도 "나중에 고친 쪽"만 받으므로, 규칙이 어긋나면
 * 같은 버튼이 기기마다 다른 기록을 남긴다.
 *
 * 날짜는 `YYYY-MM-DD` 문자열이고 "오늘"은 부르는 쪽이 `homeNow().day` 로 넘긴다.
 * 이 파일은 DB·Next·DOM 을 모른다.
 */
import { addDays, weekdayOf } from "./checklist";
import { startOfWeek } from "./calendar";

/* ------------------------------------------------------------------ 모양 */

export const ROUTINE_COLOR_KEYS = ["blue", "orange", "aqua", "yellow", "magenta", "violet"] as const;
export type RoutineColorKey = (typeof ROUTINE_COLOR_KEYS)[number];
export const ROUTINE_SLOT_KEYS = ["morning", "afternoon", "evening", "anytime"] as const;
export type RoutineSlotKey = (typeof ROUTINE_SLOT_KEYS)[number];

export type RoutineSchedule = { freq: "daily" | "weekly"; weekdays: number[] };
export type RoutinePause = { from: string; to: string };

export type RoutineItem = {
  id: string;
  title: string;
  color: string;
  slot: string;
  schedule: RoutineSchedule;
  goalMin: number | null;
  startDate: string;
  archivedAt: string | null;
  pauses: RoutinePause[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutineSessionItem = { start: string; end: string; secs: number };

export type RoutineLogItem = {
  routineId: string;
  date: string;
  done: boolean;
  doneAt: string | null;
  secs: number;
  sessions: RoutineSessionItem[];
  updatedAt: string;
};

export type RoutineTimerItem = { routineId: string; date: string; startedAt: string };

export const ROUTINE_SLOT_LABEL: Record<RoutineSlotKey, string> = {
  morning: "아침",
  afternoon: "오후",
  evening: "저녁",
  anytime: "언제든",
};

export const ROUTINE_COLOR_LABEL: Record<RoutineColorKey, string> = {
  blue: "파랑",
  orange: "주황",
  aqua: "청록",
  yellow: "노랑",
  magenta: "분홍",
  violet: "보라",
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function slotOf(r: Pick<RoutineItem, "slot">): RoutineSlotKey {
  return (ROUTINE_SLOT_KEYS as readonly string[]).includes(r.slot) ? (r.slot as RoutineSlotKey) : "anytime";
}

export function colorOf(r: Pick<RoutineItem, "color">): RoutineColorKey {
  return (ROUTINE_COLOR_KEYS as readonly string[]).includes(r.color) ? (r.color as RoutineColorKey) : "blue";
}

/* ------------------------------------------------------------------ 날짜 */

/** b - a (일). */
export function dayDiff(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** from..to 양 끝 포함. from > to 면 빈 배열. */
export function dayRange(from: string, to: string): string[] {
  const n = dayDiff(from, to);
  const out: string[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

export function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const t = Date.parse(`${day}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === day;
}

export function monthEnd(day: string): string {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** "10월 26일 (월)" */
export function routineDayLabel(day: string): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${m}월 ${d}일 (${DOW[weekdayOf(day)]})`;
}

export function weekdayLabel(dow: number): string {
  return DOW[((dow % 7) + 7) % 7] ?? "";
}

/* ------------------------------------------------------------------ 예정일 */

/** 시작일 이후, 보관 전, 쉬는 구간 밖. */
export function isActiveOn(r: RoutineItem, day: string): boolean {
  if (day < r.startDate) return false;
  if (r.archivedAt !== null && day >= r.archivedAt) return false;
  return !r.pauses.some((p) => day >= p.from && day <= p.to);
}

export function isScheduledOn(r: RoutineItem, day: string): boolean {
  if (!isActiveOn(r, day)) return false;
  return r.schedule.freq === "daily" || r.schedule.weekdays.includes(weekdayOf(day));
}

export function describeSchedule(schedule: RoutineSchedule): string {
  if (schedule.freq === "daily") return "매일";
  const days = [...schedule.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "평일";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "주말";
  return days.map((d) => DOW[d]).join("·");
}

export function sortRoutines<T extends Pick<RoutineItem, "order" | "createdAt">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/* ------------------------------------------------------------------ 기록 색인 */

export type RoutineLogIndex = Map<string, RoutineLogItem>;

export function routineLogKey(routineId: string, date: string): string {
  return `${routineId}:${date}`;
}

export function indexRoutineLogs(logs: RoutineLogItem[]): RoutineLogIndex {
  return new Map(logs.map((l) => [routineLogKey(l.routineId, l.date), l]));
}

function isDone(idx: RoutineLogIndex, id: string, day: string): boolean {
  return idx.get(routineLogKey(id, day))?.done === true;
}

/* ------------------------------------------------------------------ 통계 */

export type RoutineDayStat = {
  date: string;
  scheduled: number;
  done: number;
  /** 예정이 아닌 날 한 것 */
  extra: number;
  secs: number;
  rate: number | null;
  future: boolean;
};

export function routineDayStat(
  routines: RoutineItem[],
  idx: RoutineLogIndex,
  day: string,
  today: string,
): RoutineDayStat {
  let scheduled = 0;
  let done = 0;
  let extra = 0;
  let secs = 0;
  for (const r of routines) {
    const log = idx.get(routineLogKey(r.id, day));
    secs += log?.secs ?? 0;
    if (isScheduledOn(r, day)) {
      scheduled += 1;
      if (log?.done) done += 1;
    } else if (log?.done) {
      extra += 1;
    }
  }
  return { date: day, scheduled, done, extra, secs, rate: scheduled > 0 ? done / scheduled : null, future: day > today };
}

export type RoutineRangeSummary = {
  from: string;
  to: string;
  days: RoutineDayStat[];
  scheduled: number;
  done: number;
  secs: number;
  rate: number | null;
  /** 예정한 것을 모두 끝낸 날 */
  perfectDays: number;
};

/** 미래 날짜는 days 에는 넣되 합계에서 뺀다. */
export function summarizeRoutines(
  routines: RoutineItem[],
  idx: RoutineLogIndex,
  from: string,
  to: string,
  today: string,
): RoutineRangeSummary {
  const days = dayRange(from, to).map((d) => routineDayStat(routines, idx, d, today));
  let scheduled = 0;
  let done = 0;
  let secs = 0;
  let perfectDays = 0;
  for (const s of days) {
    if (s.future) continue;
    scheduled += s.scheduled;
    done += s.done;
    secs += s.secs;
    if (s.scheduled > 0 && s.done === s.scheduled) perfectDays += 1;
  }
  return { from, to, days, scheduled, done, secs, rate: scheduled > 0 ? done / scheduled : null, perfectDays };
}

export type RoutineRateComparison = { cur: number; prev: number; delta: number; through: string };

/**
 * 두 기간의 달성률 비교 — **끝난 날끼리만** 견준다. 오늘 아직 안 한 것은 놓친 게 아니라서,
 * 오늘을 넣으면 아침마다 "지난주보다 낮아요"가 뜬다. 지금 기간을 어제까지로 자르고 앞 기간도 같은 길이로 맞춘다.
 * 끝난 날이 없거나 어느 쪽이든 예정이 없으면 null.
 */
export function compareRoutineRates(
  routines: RoutineItem[],
  idx: RoutineLogIndex,
  from: string,
  to: string,
  prevFrom: string,
  prevTo: string,
  today: string,
): RoutineRateComparison | null {
  const through = to < today ? to : addDays(today, -1);
  if (through < from) return null;
  const pEnd = [addDays(prevFrom, dayDiff(from, through)), prevTo].sort()[0]!;
  const cur = summarizeRoutines(routines, idx, from, through, today);
  const prev = summarizeRoutines(routines, idx, prevFrom, pEnd, today);
  if (cur.rate === null || prev.rate === null) return null;
  return { cur: cur.rate, prev: prev.rate, delta: Math.round((cur.rate - prev.rate) * 100), through };
}

export type RoutineStreak = { current: number; best: number; pendingToday: boolean };

/** 예정일만 센다. 오늘 안 한 것은 끊김이 아니라 '진행 중'. */
export function routineStreak(r: RoutineItem, idx: RoutineLogIndex, today: string): RoutineStreak {
  let current = 0;
  let best = 0;
  let pendingToday = false;
  if (r.startDate > today) return { current, best, pendingToday };
  for (const d of dayRange(r.startDate, today)) {
    if (!isScheduledOn(r, d)) continue;
    if (isDone(idx, r.id, d)) {
      current += 1;
      best = Math.max(best, current);
    } else if (d === today) {
      pendingToday = true;
    } else {
      current = 0;
    }
  }
  return { current, best, pendingToday };
}

/** 예정한 것을 전부 끝낸 날의 연속. 예정이 없는 날은 건너뛴다. */
export function perfectStreak(
  routines: RoutineItem[],
  idx: RoutineLogIndex,
  today: string,
): { current: number; best: number } {
  if (routines.length === 0) return { current: 0, best: 0 };
  const first = routines.reduce((m, r) => (r.startDate < m ? r.startDate : m), today);
  let current = 0;
  let best = 0;
  for (const d of dayRange(first, today)) {
    const s = routineDayStat(routines, idx, d, today);
    if (s.scheduled === 0) continue;
    if (s.done === s.scheduled) {
      current += 1;
      best = Math.max(best, current);
    } else if (d !== today) {
      current = 0;
    }
  }
  return { current, best };
}

export type RoutineRate = { scheduled: number; done: number; rate: number | null };

function rateOf(scheduled: number, done: number): RoutineRate {
  return { scheduled, done, rate: scheduled > 0 ? done / scheduled : null };
}

/** 요일별(0=일 … 6=토). */
export function weekdayRates(routines: RoutineItem[], idx: RoutineLogIndex, from: string, to: string): RoutineRate[] {
  const s = Array<number>(7).fill(0);
  const d = Array<number>(7).fill(0);
  for (const day of dayRange(from, to)) {
    const w = weekdayOf(day);
    for (const r of routines) {
      if (!isScheduledOn(r, day)) continue;
      s[w] = (s[w] ?? 0) + 1;
      if (isDone(idx, r.id, day)) d[w] = (d[w] ?? 0) + 1;
    }
  }
  return s.map((n, i) => rateOf(n, d[i] ?? 0));
}

export function slotRates(
  routines: RoutineItem[],
  idx: RoutineLogIndex,
  from: string,
  to: string,
): Record<RoutineSlotKey, RoutineRate> {
  const acc: Record<RoutineSlotKey, [number, number]> = { morning: [0, 0], afternoon: [0, 0], evening: [0, 0], anytime: [0, 0] };
  for (const day of dayRange(from, to)) {
    for (const r of routines) {
      if (!isScheduledOn(r, day)) continue;
      const a = acc[slotOf(r)];
      a[0] += 1;
      if (isDone(idx, r.id, day)) a[1] += 1;
    }
  }
  return {
    morning: rateOf(...acc.morning),
    afternoon: rateOf(...acc.afternoon),
    evening: rateOf(...acc.evening),
    anytime: rateOf(...acc.anytime),
  };
}

export type RoutineCell = "done" | "missed" | "pending" | "extra" | "off";

export function routineCell(r: RoutineItem, idx: RoutineLogIndex, day: string, today: string): RoutineCell {
  const done = isDone(idx, r.id, day);
  if (!isScheduledOn(r, day)) return done ? "extra" : "off";
  if (done) return "done";
  return day >= today ? "pending" : "missed";
}

export type RoutineRow = {
  routine: RoutineItem;
  streak: RoutineStreak;
  rate30: RoutineRate;
  secs7: number;
  /** 최근 14일, 오래된 날부터 */
  recent: RoutineCell[];
};

/** 한 루틴의 달성률. 오늘은 했을 때만 센다 — 아직 안 한 것은 놓친 게 아니다(오늘 만든 루틴이 0% 로 보이지 않게). */
function rateFor(r: RoutineItem, idx: RoutineLogIndex, from: string, to: string, today: string): RoutineRate {
  let s = 0;
  let d = 0;
  for (const day of dayRange(from, to)) {
    if (!isScheduledOn(r, day)) continue;
    const ok = isDone(idx, r.id, day);
    if (!ok && day >= today) continue;
    s += 1;
    if (ok) d += 1;
  }
  return rateOf(s, d);
}

function secsFor(r: RoutineItem, idx: RoutineLogIndex, from: string, to: string): number {
  return dayRange(from, to).reduce((sum, day) => sum + (idx.get(routineLogKey(r.id, day))?.secs ?? 0), 0);
}

export function routineRows(routines: RoutineItem[], idx: RoutineLogIndex, today: string): RoutineRow[] {
  return routines.map((r) => ({
    routine: r,
    streak: routineStreak(r, idx, today),
    rate30: rateFor(r, idx, addDays(today, -29), today, today),
    secs7: secsFor(r, idx, addDays(today, -6), today),
    recent: dayRange(addDays(today, -13), today).map((d) => routineCell(r, idx, d, today)),
  }));
}

export type RoutineInsight = { id: string; tone: "good" | "warn" | "info"; text: string };

/** 기록에서 눈여겨볼 점. 근거가 얇으면 말하지 않는다. `routines` 는 보관하지 않은 것만. */
export function routineInsights(routines: RoutineItem[], idx: RoutineLogIndex, today: string): RoutineInsight[] {
  const out: RoutineInsight[] = [];
  if (routines.length === 0) return out;

  // 이번 주 끝난 날이 이틀은 있어야 견준다 — 하루치로는 근거가 얇다.
  const ws = startOfWeek(today);
  const elapsed = dayDiff(ws, today);
  if (elapsed >= 2) {
    const week = compareRoutineRates(routines, idx, ws, today, addDays(ws, -7), addDays(ws, -1), today);
    const scheduled = summarizeRoutines(routines, idx, ws, addDays(today, -1), today).scheduled;
    if (week && scheduled >= 3 && Math.abs(week.delta) >= 5) {
      out.push({
        id: "week-delta",
        tone: week.delta > 0 ? "good" : "warn",
        text: `이번 주 어제까지 달성률 ${pct(week.cur)} — 지난주 같은 요일까지보다 ${Math.abs(week.delta)}%p ${week.delta > 0 ? "높아요" : "낮아요"}.`,
      });
    }
  }

  const rows = routineRows(routines, idx, today);
  const record = rows
    .filter((r) => r.streak.current >= 3 && r.streak.current === r.streak.best)
    .sort((a, b) => b.streak.current - a.streak.current)[0];
  if (record) {
    out.push({
      id: `record-${record.routine.id}`,
      tone: "good",
      text: `‘${record.routine.title}’ ${record.streak.current}일 연속 — 최고 기록을 갱신하는 중이에요.`,
    });
  }
  const atStake = rows
    .filter((r) => r.streak.pendingToday && r.streak.current >= 3 && r !== record)
    .sort((a, b) => b.streak.current - a.streak.current)[0];
  if (atStake) {
    out.push({
      id: `stake-${atStake.routine.id}`,
      tone: "info",
      text: `‘${atStake.routine.title}’ 오늘도 하면 ${atStake.streak.current + 1}일 연속이에요.`,
    });
  }

  const yesterday = addDays(today, -1);
  const judged = weekdayRates(routines, idx, addDays(today, -56), yesterday)
    .map((r, dow) => ({ ...r, dow }))
    .filter((r) => r.rate !== null && r.scheduled >= 4);
  if (judged.length >= 3) {
    const avg = judged.reduce((a, r) => a + r.done, 0) / judged.reduce((a, r) => a + r.scheduled, 0);
    const worst = [...judged].sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))[0];
    const best = [...judged].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0];
    if (worst && best && avg - (worst.rate ?? 0) >= 0.15) {
      out.push({
        id: "weekday",
        tone: "warn",
        text: `최근 8주 동안 ${weekdayLabel(worst.dow)}요일 달성률이 가장 낮아요 (${pct(worst.rate)}, 평균 ${pct(avg)}). 가장 잘 지키는 날은 ${weekdayLabel(best.dow)}요일(${pct(best.rate)})이에요.`,
      });
    }
  }

  const struggling = rows
    .filter((r) => r.rate30.scheduled >= 8 && (r.rate30.rate ?? 1) < 0.5)
    .sort((a, b) => (a.rate30.rate ?? 0) - (b.rate30.rate ?? 0))[0];
  if (struggling) {
    out.push({
      id: `struggle-${struggling.routine.id}`,
      tone: "warn",
      text: `‘${struggling.routine.title}’ 최근 30일 달성률 ${pct(struggling.rate30.rate)} — 요일을 줄이거나 목표를 낮춰 보는 것도 방법이에요.`,
    });
  }

  const top = routines
    .map((r) => ({ r, secs: secsFor(r, idx, ws, today) }))
    .sort((a, b) => b.secs - a.secs)[0];
  if (top && top.secs >= 600) {
    out.push({
      id: "time-top",
      tone: "info",
      text: `이번 주는 ‘${top.r.title}’에 가장 많은 시간을 썼어요 (${formatSecs(top.secs)}, 하루 평균 ${formatSecs(top.secs / (elapsed + 1))}).`,
    });
  }

  const slots = slotRates(routines, idx, addDays(today, -29), yesterday);
  const comparable = (Object.keys(slots) as RoutineSlotKey[])
    .filter((s) => s !== "anytime" && slots[s].scheduled >= 10 && slots[s].rate !== null)
    .sort((a, b) => (slots[b].rate ?? 0) - (slots[a].rate ?? 0));
  if (comparable.length >= 2) {
    const hi = comparable[0]!;
    const lo = comparable[comparable.length - 1]!;
    if ((slots[hi].rate ?? 0) - (slots[lo].rate ?? 0) >= 0.15) {
      out.push({
        id: "slot",
        tone: "info",
        text: `${ROUTINE_SLOT_LABEL[hi]} 루틴(${pct(slots[hi].rate)})이 ${ROUTINE_SLOT_LABEL[lo]} 루틴(${pct(slots[lo].rate)})보다 잘 지켜지고 있어요.`,
      });
    }
  }
  return out.slice(0, 5);
}

/* ------------------------------------------------------------------ 글자 */

export function pct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "–";
  return `${Math.round(rate * 100)}%`;
}

export function formatSecs(secs: number): string {
  if (!Number.isFinite(secs) || secs < 60) return "0분";
  const min = Math.floor(secs / 60);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** mm:ss · h:mm:ss */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

/* ------------------------------------------------------------------ 규칙 (고치기) */

export const ROUTINE_MAX_SESSION_SECS = 12 * 3600;
const MAX_DAY_SECS = 24 * 3600;
const MAX_SESSIONS = 100;

export type RoutineInputData = {
  title: string;
  color: string;
  slot: string;
  schedule: RoutineSchedule;
  goalMin: number | null;
  startDate: string;
};

export class RoutineRuleError extends Error {}

/** 입력 정리 — 맥·폰과 같은 메시지. */
export function normalizeRoutineInput(input: RoutineInputData): RoutineInputData {
  const title = input.title.trim();
  if (title === "") throw new RoutineRuleError("루틴 이름을 입력하세요");
  if ([...title].length > 60) throw new RoutineRuleError("루틴 이름은 60자 이하로 적어주세요");
  let schedule: RoutineSchedule = { freq: "daily", weekdays: [] };
  if (input.schedule.freq === "weekly") {
    const days = [...new Set(input.schedule.weekdays)].sort((a, b) => a - b);
    if (days.length === 0) throw new RoutineRuleError("요일을 하나 이상 선택하세요");
    if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new RoutineRuleError("요일 값이 올바르지 않습니다");
    schedule = days.length === 7 ? { freq: "daily", weekdays: [] } : { freq: "weekly", weekdays: days };
  }
  let goalMin = input.goalMin;
  if (goalMin !== null && (!Number.isFinite(goalMin) || goalMin <= 0)) goalMin = null;
  if (goalMin !== null) goalMin = Math.round(goalMin);
  if (goalMin !== null && goalMin > 600) throw new RoutineRuleError("목표 시간은 600분 이하로 정해주세요");
  const startDate = input.startDate.trim();
  if (!isRealDay(startDate)) throw new RoutineRuleError("시작일은 YYYY-MM-DD 형식이어야 합니다");
  const color = (ROUTINE_COLOR_KEYS as readonly string[]).includes(input.color) ? input.color : "blue";
  const slot = (ROUTINE_SLOT_KEYS as readonly string[]).includes(input.slot) ? input.slot : "anytime";
  return { title, color, slot, schedule, goalMin, startDate };
}

export function checkRoutineDate(r: RoutineItem, date: string, today: string): void {
  if (!isRealDay(date)) throw new RoutineRuleError("날짜는 YYYY-MM-DD 형식이어야 합니다");
  if (date > today) throw new RoutineRuleError("미래 날짜에는 기록할 수 없습니다");
  if (date < r.startDate) throw new RoutineRuleError(`시작일(${r.startDate}) 이전에는 기록할 수 없습니다`);
}

function emptyLog(routineId: string, date: string, now: string): RoutineLogItem {
  return { routineId, date, done: false, doneAt: null, secs: 0, sessions: [], updatedAt: now };
}

/** 완료도 아니고 시간도 없으면 줄을 지운다(null). */
function settle(log: RoutineLogItem): RoutineLogItem | null {
  return !log.done && log.secs <= 0 && log.sessions.length === 0 ? null : log;
}

function completeIfGoal(log: RoutineLogItem, goalMin: number | null, now: string): boolean {
  if (goalMin === null || goalMin <= 0 || log.done || log.secs < goalMin * 60) return false;
  log.done = true;
  log.doneAt = now;
  return true;
}

/** 체크·해제. 돌려준 null 은 "그 줄을 지운다". */
export function applyRoutineCheck(
  r: RoutineItem,
  log: RoutineLogItem | undefined,
  date: string,
  done: boolean,
  today: string,
  now: string,
): RoutineLogItem | null {
  checkRoutineDate(r, date, today);
  const next = { ...(log ?? emptyLog(r.id, date, now)), sessions: [...(log?.sessions ?? [])], updatedAt: now };
  if (next.done !== done) {
    next.done = done;
    next.doneAt = done ? now : null;
  }
  return settle(next);
}

/** 그날 시간을 `minutes` 분으로. 목표를 채우면 완료(되돌리지 않는다). */
export function applyRoutineMinutes(
  r: RoutineItem,
  log: RoutineLogItem | undefined,
  date: string,
  minutes: number,
  today: string,
  now: string,
): { log: RoutineLogItem | null; reachedGoal: boolean } {
  checkRoutineDate(r, date, today);
  const next = { ...(log ?? emptyLog(r.id, date, now)), sessions: [...(log?.sessions ?? [])], updatedAt: now };
  next.secs = Math.min(Math.max(0, Math.round(minutes)) * 60, MAX_DAY_SECS);
  const reachedGoal = completeIfGoal(next, r.goalMin, now);
  return { log: settle(next), reachedGoal };
}

export type RoutineTimerCommit = { log: RoutineLogItem; addedSecs: number; capped: boolean; reachedGoal: boolean };

/** 돌던 타이머를 기록으로 옮긴다. 1초도 안 됐으면 null(기록 없음). */
export function commitRoutineTimer(
  r: RoutineItem,
  timer: RoutineTimerItem,
  log: RoutineLogItem | undefined,
  now: Date,
): RoutineTimerCommit | null {
  const started = Date.parse(timer.startedAt);
  if (Number.isNaN(started)) return null;
  const elapsed = Math.max(0, Math.floor((now.getTime() - started) / 1000));
  const capped = elapsed > ROUTINE_MAX_SESSION_SECS;
  const secs = Math.min(elapsed, ROUTINE_MAX_SESSION_SECS);
  if (secs <= 0) return null;
  const at = now.toISOString();
  const end = capped ? new Date(started + ROUTINE_MAX_SESSION_SECS * 1000).toISOString() : at;
  const next = { ...(log ?? emptyLog(r.id, timer.date, at)), sessions: [...(log?.sessions ?? [])], updatedAt: at };
  next.sessions.push({ start: new Date(started).toISOString(), end, secs });
  if (next.sessions.length > MAX_SESSIONS) next.sessions.splice(0, next.sessions.length - MAX_SESSIONS);
  next.secs = Math.min(next.secs + secs, MAX_DAY_SECS);
  const reachedGoal = completeIfGoal(next, r.goalMin, at);
  return { log: next, addedSecs: secs, capped, reachedGoal };
}

/** 보관하면 오늘부터 예정에서 빠지고, 꺼내면 보관일~어제를 쉬는 구간으로 남긴다. */
export function applyRoutineArchive(r: RoutineItem, archived: boolean, today: string, now: string): RoutineItem {
  const next = { ...r, pauses: [...r.pauses], updatedAt: now };
  if (archived) {
    if (next.archivedAt === null) next.archivedAt = today;
  } else if (next.archivedAt !== null) {
    const from = next.archivedAt;
    next.archivedAt = null;
    const to = addDays(today, -1);
    if (from <= to) next.pauses.push({ from, to });
  }
  return next;
}

export function routineElapsed(timer: RoutineTimerItem | null, now: Date): number {
  if (timer === null) return 0;
  const t = Date.parse(timer.startedAt);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now.getTime() - t) / 1000));
}

export function newRoutineId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `rt_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const ROUTINE_TEMPLATES: { title: string; slot: RoutineSlotKey; goalMin: number | null; weekdays?: number[] }[] = [
  { title: "물 한 잔", slot: "morning", goalMin: null },
  { title: "스트레칭", slot: "morning", goalMin: 10 },
  { title: "독서", slot: "evening", goalMin: 30 },
  { title: "명상", slot: "anytime", goalMin: 10 },
  { title: "운동", slot: "afternoon", goalMin: 40, weekdays: [1, 3, 5] },
  { title: "일기", slot: "evening", goalMin: null },
];
