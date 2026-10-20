import {
  calendarEvents,
  calendarItems,
  listCalendarFeeds,
  openItems,
  usersByIds,
} from "@nyanotion/db";
import { CALENDAR_VIEWS, cleanDay, homeNow, visibleRange, type CalendarView } from "@nyanotion/shared";
import { CalendarHome } from "@/components/calendar-home";
import type { CalSpace } from "@/components/calendar-model";
import { NewDocumentButton } from "@/components/new-document-button";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

/**
 * 첫 화면 — **캘린더.** 가족 캘린더(구독한 iCal)의 일정이 기본으로 보이고, 그 위에 할 일을 놓는다.
 *
 * 날짜 없는 할 일은 **백로그**다. 백로그에서 끌어(폰에서는 눌러 고르고 칸을 눌러) 시간 칸에 놓으면
 * 그 날·시각·길이가 할 일에 적힌다 (`due_on` · `due_time` · `est_min`). 반복 할 일은 앞날까지 그려 준다.
 * 개인·가족의 구분은 체크리스트와 같이 **어느 space 에 있느냐**다 — 캘린더도 같다.
 *
 * 보기(`?view=`)를 안 정했으면 화면이 정한다 — 넓으면 주, 좁으면 하루.
 * 주·하루 보기는 그 주를 통째로 가져온다 (하루씩 넘겨도 같은 주면 같은 데이터).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string }>;
}) {
  const viewer = await requireViewer();
  const { day: today } = homeNow();
  const params = await searchParams;
  const view = (CALENDAR_VIEWS as readonly string[]).includes(params.view ?? "")
    ? (params.view as CalendarView)
    : null;
  const anchor = cleanDay(params.d) ?? today;
  const range = visibleRange(view === "month" ? "month" : "week", anchor);

  const [events, scheduled, open, feeds] = await Promise.all([
    calendarEvents(viewer.spaceIds, range.from, range.to),
    calendarItems(viewer.spaceIds, range.from, range.to),
    openItems(viewer.spaceIds),
    listCalendarFeeds(viewer.spaceIds),
  ]);

  const backlog = open.filter((item) => item.dueOn === null);
  const overdue = open.filter((item) => item.dueOn !== null && item.dueOn < today);

  const people = await usersByIds([
    ...new Set(
      [...scheduled, ...open].flatMap((item) => (item.assigneeId === null ? [] : [item.assigneeId])),
    ),
  ]);

  const spaces: CalSpace[] = [
    ...viewer.spaces.filter((space) => space.kind === "personal"),
    ...viewer.spaces.filter((space) => space.kind === "org"),
  ].map((space) => ({
    id: space.id,
    name: space.kind === "org" ? (space.organizationName ?? space.name) : "나",
    kind: space.kind,
    canWrite: space.baseRole === "editor" || space.baseRole === "owner",
  }));

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "캘린더" }]} right={<NewDocumentButton />} />
      <CalendarHome
        view={view}
        anchor={anchor}
        today={today}
        range={range}
        events={events}
        items={scheduled}
        backlog={backlog}
        overdue={overdue}
        spaces={spaces}
        feedCount={feeds.length}
        feedProblems={feeds.filter((feed) => feed.error !== null).length}
        people={[...people.entries()].map(([id, info]) => ({ id, name: info.name }))}
        userId={viewer.userId}
      />
    </>
  );
}
