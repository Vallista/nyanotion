import type { AgendaRow, CalendarEventRow, PlanEventRow } from "@nyanotion/db";
import { FEED_COLORS, PLAN_DEFAULT_COLOR, calendarColorVar, minutesOf, projectRepeats } from "@nyanotion/shared";

/**
 * 첫 화면 캘린더가 그리는 것들의 모양 — 외부 일정(읽기만)과 할 일(고칠 수 있음).
 * 서버 질의 결과를 날마다 나누고, 겹치는 칸을 옆으로 나눠 앉힌다. 화면 코드는 위치만 그린다.
 */

export type CalSpace = {
  id: string;
  name: string;
  kind: "personal" | "org";
  canWrite: boolean;
};

export type TodoEntry = {
  kind: "todo";
  key: string;
  item: AgendaRow;
  /** 반복 할 일의 **앞날** — DB 에 아직 줄이 없다. 체크하면 원래 줄이 체크된다. */
  ghost: boolean;
  day: string;
};

/**
 * 캘린더에 그리는 일정 하나 — 구독한 캘린더의 사본(`plan: null`, 읽기만)이거나 여기서 적은 일정(`plan`, 고칠 수 있음).
 * 칸을 그리는 코드는 둘을 가리지 않는다. 고치는 창과 끌기만 `plan` 을 본다.
 */
export type CalEvent = CalendarEventRow & { plan: PlanEventRow | null };

/** 여기서 적은 일정을 캘린더 모양으로. 색을 안 골랐으면 기본 색. */
export function fromPlanEvent(row: PlanEventRow): CalEvent {
  return {
    id: row.id,
    feedId: "plan",
    spaceId: row.spaceId,
    calendarName: "",
    color: row.color ?? PLAN_DEFAULT_COLOR,
    title: row.title,
    location: row.location,
    startsOn: row.startsOn,
    startTime: row.startTime,
    endsOn: row.endsOn,
    endTime: row.endTime,
    plan: row,
  };
}

export function fromFeedEvent(row: CalendarEventRow): CalEvent {
  return { ...row, plan: null };
}

/** 끌 때 쓰는 표 — 할 일은 id 그대로, 일정은 앞에 `plan:`. */
export const PLAN_DRAG_PREFIX = "plan:";

/** 일정의 길이(분) — 끄는 동안 놓일 자리를 그릴 때. 종일·여러 날이면 null. */
export function planMinutes(event: CalEvent): number | null {
  if (event.startTime === null || event.endTime === null || event.startsOn !== event.endsOn) return null;
  return Math.max(15, minutesOf(event.endTime) - minutesOf(event.startTime));
}

export type EventEntry = {
  kind: "event";
  key: string;
  event: CalEvent;
};

export type Entry = TodoEntry | EventEntry;

/** 시간 칸 하나 — 그날 안에서의 시작·끝(분). 여러 날 일정은 날마다 잘린다. */
export type Segment = Entry & { start: number; end: number };
export type Placed = Segment & { col: number; cols: number };

/** 시간을 안 정한 할 일을 칸에 그릴 때의 길이 (분) — 그리기만 그렇다. */
const UNSIZED_MIN = 30;
/** 아주 짧은 일정도 글자가 읽힐 만큼은 높이를 준다 (겹침 계산에도 같은 값). */
export const MIN_VISIBLE_MIN = 20;

export const TODO_COLOR = { personal: "var(--accent)", org: "var(--family)" } as const;

/** 화면에 칠할 색 — 저장된 색 이름을 테마 변수(`--cal-N`)로 바꿔 돌려준다. */
export function eventColor(event: { feedId: string; color: string | null }): string {
  if (event.color !== null) return calendarColorVar(event.color);
  let hash = 0;
  for (let i = 0; i < event.feedId.length; i += 1) hash = (hash * 31 + event.feedId.charCodeAt(i)) | 0;
  return calendarColorVar(FEED_COLORS[Math.abs(hash) % FEED_COLORS.length] ?? FEED_COLORS[0]);
}

/** 할 일 → 그려야 할 날들의 항목. 반복이면 범위 안의 앞날도 (`projectRepeats`). */
export function todoEntries(items: readonly AgendaRow[], from: string, to: string): TodoEntry[] {
  const out: TodoEntry[] = [];
  for (const item of items) {
    if (item.dueOn === null) continue;
    if (item.dueOn >= from && item.dueOn <= to) {
      out.push({ kind: "todo", key: item.id, item, ghost: false, day: item.dueOn });
    }
    if (!item.done && item.repeat !== "none") {
      for (const day of projectRepeats(item.dueOn, item.repeat, from, to, item.repeatDay ?? undefined)) {
        out.push({ kind: "todo", key: `${item.id}@${day}`, item, ghost: true, day });
      }
    }
  }
  return out;
}

export type DayBuckets = { allDay: Entry[]; timed: Placed[] };

/** 날마다 종일 줄과 시간 칸으로 나눈다. */
export function bucketByDay(
  days: readonly string[],
  todos: readonly TodoEntry[],
  events: readonly CalEvent[],
): Map<string, DayBuckets> {
  const map = new Map<string, DayBuckets>();
  for (const day of days) {
    const allDay: Entry[] = [];
    const timed: Segment[] = [];

    for (const event of events) {
      if (event.startsOn > day || event.endsOn < day) continue;
      const entry: EventEntry = { kind: "event", key: `${event.id}:${day}`, event };
      if (event.startTime === null) {
        allDay.push(entry);
        continue;
      }
      const start = day === event.startsOn ? minutesOf(event.startTime) : 0;
      const end = day === event.endsOn && event.endTime !== null ? minutesOf(event.endTime) : 24 * 60;
      timed.push({ ...entry, start, end: Math.max(end, start) });
    }

    for (const todo of todos) {
      if (todo.day !== day) continue;
      if (todo.item.dueTime === null) {
        allDay.push(todo);
        continue;
      }
      const start = minutesOf(todo.item.dueTime);
      timed.push({ ...todo, start, end: Math.min(24 * 60, start + (todo.item.estMin ?? UNSIZED_MIN)) });
    }

    // 종일 줄: 일정 먼저, 그다음 할 일 (안 한 것 먼저).
    allDay.sort((a, b) => rank(a) - rank(b));
    map.set(day, { allDay, timed: layoutColumns(timed) });
  }
  return map;
}

function rank(entry: Entry): number {
  if (entry.kind === "event") return 0;
  return entry.item.done ? 2 : 1;
}

/**
 * 겹치는 칸을 옆으로 나눠 앉힌다 — 서로 겹치는 무리마다 가장 적게 쓰는 열 수를 찾는다.
 * 무리 하나가 끝나야(그 뒤 칸이 앞의 어느 칸과도 안 겹쳐야) 열 수가 정해진다.
 */
export function layoutColumns<T extends { start: number; end: number }>(
  segments: readonly T[],
): (T & { col: number; cols: number })[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { col: number; cols: number })[] = [];
  let group: (T & { col: number; cols: number })[] = [];
  let columns: number[] = [];
  let groupEnd = -1;

  const flush = () => {
    for (const item of group) item.cols = columns.length;
    out.push(...group);
    group = [];
    columns = [];
  };

  for (const segment of sorted) {
    const visibleEnd = Math.max(segment.end, segment.start + MIN_VISIBLE_MIN);
    if (segment.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    let col = columns.findIndex((end) => end <= segment.start);
    if (col === -1) {
      col = columns.length;
      columns.push(visibleEnd);
    } else {
      columns[col] = visibleEnd;
    }
    group.push({ ...segment, col, cols: 1 });
    groupEnd = Math.max(groupEnd, visibleEnd);
  }
  flush();
  return out;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function weekdayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}

/** "10월 21일 (수)" */
export function dayLabel(day: string): string {
  return `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 (${weekdayLabel(day)})`;
}

/** "오후 2:30" 이 아니라 "14:30" — 이 앱의 시간 칸은 24시간제다. 분 단위 길이는 "1시간 30분". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
