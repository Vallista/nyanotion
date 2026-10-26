import {
  calendarEvents,
  calendarItems,
  dayNotes,
  listMemos,
  openItems,
  planEvents,
  routineState,
} from "@nyanotion/db";
import { addDays, homeNow, indexRoutineLogs, isScheduledOn, routineStreak, sortRoutines } from "@nyanotion/shared";
import { fromFeedEvent, fromPlanEvent } from "@/components/calendar-model";
import { TodayScreen } from "@/components/life/today-screen";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "오늘" };

/**
 * 오늘 — 일정 · 할 일 · 루틴 · 메모함 · 기분/회고를 한 화면에 (`docs/15-today.md`).
 * 일정·할 일은 space 로(가족 것도 보인다), 루틴·메모·기분은 나만의 것으로 좁힌다.
 */
export default async function TodayPage() {
  const viewer = await requireViewer();
  const { day: today, time } = homeNow();

  // 연속 기록은 시작일부터 세야 해서 루틴 기록은 넉넉히 — 한 사람의 루틴 × 날짜라 많지 않다.
  const [feed, plans, todos, open, routines, memos, notes] = await Promise.all([
    calendarEvents(viewer.spaceIds, today, today),
    planEvents(viewer.spaceIds, today, today),
    calendarItems(viewer.spaceIds, today, today),
    openItems(viewer.spaceIds),
    routineState(viewer.userId, addDays(today, -400)),
    listMemos(viewer.userId, 0),
    dayNotes(viewer.userId, today, today),
  ]);

  const idx = indexRoutineLogs(routines.logs);
  const todayRoutines = sortRoutines(routines.routines)
    .filter((r) => isScheduledOn(r, today))
    .map((r) => ({
      routine: r,
      done: idx.get(`${r.id}:${today}`)?.done === true,
      streak: routineStreak(r, idx, today).current,
    }));

  const spaceLabel: Record<string, string> = {};
  for (const space of viewer.spaces) {
    spaceLabel[space.id] = space.kind === "personal" ? "나" : (space.organizationName ?? space.name);
  }
  // 메모를 할 일로 옮길 곳 — 나 먼저, 그다음 가족(쓸 수 있는 곳만).
  const memoSpaces = [
    ...viewer.spaces.filter((s) => s.kind === "personal"),
    ...viewer.spaces.filter((s) => s.kind === "org" && (s.baseRole === "editor" || s.baseRole === "owner")),
  ].map((s) => ({ id: s.id, label: s.kind === "personal" ? "내" : `${s.organizationName ?? s.name}` }));

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "오늘" }]} />
      <TodayScreen
        today={today}
        serverTime={time}
        serverNow={Date.now()}
        events={[...plans.map(fromPlanEvent), ...feed.map(fromFeedEvent)]}
        todos={todos}
        overdue={open.filter((item) => item.dueOn !== null && item.dueOn < today)}
        routines={todayRoutines}
        memos={memos.open}
        memoCount={memos.open.length}
        note={notes[0] ?? null}
        memoSpaces={memoSpaces}
        spaceLabel={spaceLabel}
      />
    </>
  );
}
