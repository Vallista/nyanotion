import { agenda, listChecklists, usersByIds } from "@nyanotion/db";
import { addDays, homeNow } from "@nyanotion/shared";
import { ChecklistOverview } from "@/components/checklist-overview";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "체크리스트 — Nyanotion" };

/**
 * 체크리스트 모아 보기.
 *
 * 위에는 **일정** — 개인·가족 체크리스트를 가로질러 지난 것 · 오늘 · 이번 주를 한 줄로.
 * 아래에는 체크리스트들 — 내 것과 가족 것을 나눠서.
 */
export default async function ListsPage() {
  const viewer = await requireViewer();
  const { day: today } = homeNow();

  const [lists, upcoming] = await Promise.all([
    listChecklists(viewer.spaceIds),
    agenda(viewer.spaceIds, addDays(today, 7)),
  ]);

  const people = await usersByIds([
    ...new Set(upcoming.flatMap((row) => (row.assigneeId === null ? [] : [row.assigneeId]))),
  ]);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "체크리스트" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 820, margin: "0 auto", padding: "48px 16px 120px" }}>
          <ChecklistOverview
            today={today}
            lists={lists}
            agenda={upcoming}
            people={[...people.entries()].map(([id, info]) => ({ id, name: info.name }))}
            spaces={viewer.spaces
              // 쓸 수 없는 space(손님)에는 만들 수 없으므로 고르는 칸에도 안 보인다.
              .filter((space) => space.baseRole === "editor" || space.baseRole === "owner")
              .map((space) => ({
                id: space.id,
                name: space.kind === "org" ? (space.organizationName ?? space.name) : space.name,
                kind: space.kind,
              }))}
            allSpaces={viewer.spaces.map((space) => ({
              id: space.id,
              name: space.kind === "org" ? (space.organizationName ?? space.name) : space.name,
              kind: space.kind,
            }))}
            defaultSpaceId={viewer.personalSpace.id}
            userId={viewer.userId}
          />
        </div>
      </div>
    </>
  );
}
