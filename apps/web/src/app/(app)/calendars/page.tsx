import { listCalendarFeeds } from "@nyanotion/db";
import { CalendarFeeds } from "@/components/calendar-feeds";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "캘린더 연결" };

/**
 * 캘린더 연결 — 구글·애플 캘린더의 **iCal 주소**를 달면 첫 화면 캘린더에 그 일정이 같이 보인다.
 * 가족 공간에 달면 가족 모두가, 내 공간에 달면 나만 본다 (`docs/14-calendar.md`).
 */
export default async function CalendarsPage() {
  const viewer = await requireViewer();
  const feeds = await listCalendarFeeds(viewer.spaceIds);

  const spaces = [
    ...viewer.spaces.filter((space) => space.kind === "org"),
    ...viewer.spaces.filter((space) => space.kind === "personal"),
  ].map((space) => ({
    id: space.id,
    name: space.kind === "org" ? (space.organizationName ?? space.name) : "나만",
    kind: space.kind,
    canWrite: space.baseRole === "editor" || space.baseRole === "owner",
  }));

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "캘린더", href: "/" }, { id: null, title: "캘린더 연결" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "40px 16px 120px" }}>
          <CalendarFeeds feeds={feeds} spaces={spaces} />
        </div>
      </div>
    </>
  );
}
