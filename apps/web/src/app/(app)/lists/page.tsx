import { listChecklists, openItems, usersByIds } from "@nyanotion/db";
import { homeNow } from "@nyanotion/shared";
import { ChecklistOverview } from "@/components/checklist-overview";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "체크리스트" };

/**
 * 체크리스트 — 나 · 가족으로 나눠서, 체크리스트마다 할 일을 펼쳐 둔다.
 * 맨 위에는 오늘까지 할 일만 짧게.
 */
export default async function ListsPage() {
  const viewer = await requireViewer();
  const { day: today } = homeNow();

  const [lists, items] = await Promise.all([
    listChecklists(viewer.spaceIds),
    openItems(viewer.spaceIds),
  ]);

  const people = await usersByIds([
    ...new Set(items.flatMap((row) => (row.assigneeId === null ? [] : [row.assigneeId]))),
  ]);

  // 나 먼저, 가족들 다음. 체크리스트는 만든 순서가 아니라 최근에 고친 것 먼저(listChecklists).
  const ordered = [
    ...viewer.spaces.filter((space) => space.kind === "personal"),
    ...viewer.spaces.filter((space) => space.kind === "org"),
  ];

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "체크리스트", href: "/" }, { id: null, title: "모든 체크리스트" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 1040, margin: "0 auto", padding: "40px 16px 120px" }}>
          <ChecklistOverview
            today={today}
            lists={lists}
            items={items}
            people={[...people.entries()].map(([id, info]) => ({ id, name: info.name }))}
            spaces={ordered.map((space) => ({
              id: space.id,
              name: space.kind === "org" ? (space.organizationName ?? space.name) : space.name,
              kind: space.kind,
              canWrite: space.baseRole === "editor" || space.baseRole === "owner",
            }))}
            userId={viewer.userId}
          />
        </div>
      </div>
    </>
  );
}
