import { listChecklists, listRecent, openItems, usersByIds } from "@nyanotion/db";
import { homeNow } from "@nyanotion/shared";
import Link from "next/link";
import { HomeChecklists, type HomeSpace } from "@/components/home-checklists";
import { NewDocumentButton } from "@/components/new-document-button";
import { TopBar } from "@/components/top-bar";
import { PageIcon } from "@/components/icons";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle } from "@/lib/tree";

/**
 * 캣타워 — **체크리스트가 먼저다.** 열자마자 내 할 일과 가족 할 일이 보이고, 그 자리에서 적고 체크한다.
 * 문서는 그 아래 "최근 고친 문서" 로 조용히.
 *
 * 공간마다 카드 하나: 내 문서 → 가족들 순서. 손님(guest)으로 들어간 가족은 볼 수만 있다.
 */
export default async function HomePage() {
  const viewer = await requireViewer();
  const { day: today } = homeNow();

  const [items, lists, recent] = await Promise.all([
    openItems(viewer.spaceIds),
    listChecklists(viewer.spaceIds),
    listRecent(viewer.spaceIds, 6),
  ]);

  const people = await usersByIds([
    ...new Set(items.flatMap((item) => (item.assigneeId === null ? [] : [item.assigneeId]))),
  ]);

  const ordered = [
    ...viewer.spaces.filter((space) => space.kind === "personal"),
    ...viewer.spaces.filter((space) => space.kind === "org"),
  ];
  const spaces: HomeSpace[] = ordered.map((space) => ({
    id: space.id,
    name: space.kind === "org" ? (space.organizationName ?? space.name) : space.name,
    kind: space.kind,
    canWrite: space.baseRole === "editor" || space.baseRole === "owner",
    checklistCount: lists.filter((list) => list.spaceId === space.id).length,
    items: items.filter((item) => item.spaceId === space.id),
  }));

  const dueToday = items.filter((item) => item.dueOn !== null && item.dueOn <= today).length;

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "캣타워" }]} right={<NewDocumentButton />} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 960, margin: "0 auto", padding: "40px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 4 }}>
            {viewer.name.trim() === "" ? "안녕하세요" : `${viewer.name} 님, 안녕하세요`}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", marginBottom: 24 }}>
            {dueToday === 0 ? "오늘까지 할 일은 없어요." : `오늘까지 할 일 ${dueToday}개가 있어요.`}
          </p>

          <HomeChecklists
            spaces={spaces}
            today={today}
            people={[...people.entries()].map(([id, info]) => ({ id, name: info.name }))}
            userId={viewer.userId}
          />

          {spaces.every((space) => space.kind === "personal") && (
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 12, lineHeight: 1.7 }}>
              가족과 같이 쓰려면 사이드바의 <strong style={{ fontWeight: 500 }}>가족 만들기</strong>로
              가족을 만들거나 초대를 받으세요. 가족 체크리스트가 여기 나란히 생깁니다.
            </p>
          )}

          {recent.length > 0 && (
            <section style={{ marginTop: 44 }}>
              <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 8 }}>
                최근 고친 문서
              </h2>
              <ul style={{ padding: 0 }}>
                {recent.map((doc) => (
                  <li key={doc.id} style={{ listStyle: "none" }}>
                    <Link
                      href={`/d/${doc.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        height: 36,
                        padding: "0 8px",
                        border: 0,
                        color: "var(--ink)",
                        borderBottom: "1px solid var(--line-soft)",
                      }}
                    >
                      <span style={{ display: "flex", color: "var(--ink-4)" }}>
                        <PageIcon size={14} />
                      </span>
                      <span
                        style={{
                          flexGrow: 1,
                          minWidth: 0,
                          fontSize: 14,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayTitle(doc.title)}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
                        {formatWhen(doc.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
