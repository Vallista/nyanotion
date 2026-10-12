"use client";

import type { AgendaRow, ChecklistSummary } from "@nyanotion/db";
import { describeDue } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createChecklistAction } from "@/lib/checklist-actions";
import { ChecklistItem, inputStyle, type Person } from "./checklist-item";
import { ChecklistIcon, PlusIcon } from "./icons";

type SpaceOption = { id: string; name: string; kind: "personal" | "org" };

/**
 * 체크리스트 모아 보기 — **일정이 먼저, 목록이 다음.**
 *
 * 일정은 개인·가족을 가로지른다. "오늘 뭐 해야 하지"에 답하려고 체크리스트를 하나씩 열어 보게
 * 하지 않기 위해서다. 여기서 바로 체크할 수 있다.
 */
export function ChecklistOverview({
  today,
  lists,
  agenda,
  people,
  spaces,
  allSpaces,
  defaultSpaceId,
  userId,
}: {
  today: string;
  lists: ChecklistSummary[];
  agenda: AgendaRow[];
  people: Person[];
  /** 새 체크리스트를 만들 수 있는 곳. */
  spaces: SpaceOption[];
  /** 볼 수 있는 곳 전부 — 목록을 나눠 보여 줄 때 쓴다. */
  allSpaces: SpaceOption[];
  defaultSpaceId: string;
  userId: string;
}) {
  const nameOf = (id: string) =>
    id === userId ? "나" : (people.find((p) => p.id === id)?.name ?? "누군가");

  const late = agenda.filter((row) => row.dueOn !== null && row.dueOn < today);
  const now = agenda.filter((row) => row.dueOn === today);
  const soon = agenda.filter((row) => row.dueOn !== null && row.dueOn > today);

  const sections = allSpaces
    .map((space) => ({ space, lists: lists.filter((list) => list.spaceId === space.id) }))
    .filter((section) => section.lists.length > 0);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
        체크리스트
      </h1>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28, lineHeight: 1.7 }}>
        나만 보는 것은 <b style={{ fontWeight: 500 }}>내 문서</b>에, 같이 챙길 것은{" "}
        <b style={{ fontWeight: 500 }}>가족</b>에 만드세요. 날짜를 정하면 그날 알려 드리고, 사야 하는
        것은 네이버·쿠팡에서 값을 찾아 옵니다.
      </p>

      <AgendaGroup title={`지난 것 ${late.length}`} rows={late} tone="late" today={today} nameOf={nameOf} />
      <AgendaGroup title={`오늘 ${now.length}`} rows={now} tone="today" today={today} nameOf={nameOf} />
      <AgendaGroup title="이번 주" rows={soon} today={today} nameOf={nameOf} />
      {agenda.length === 0 && lists.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28 }}>
          이번 주에 날짜가 정해진 일은 없어요.
        </p>
      )}

      <NewChecklist spaces={spaces} defaultSpaceId={defaultSpaceId} />

      {sections.map(({ space, lists: inSpace }) => (
        <section key={space.id} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 8 }}>
            {space.name}
            {space.kind === "org" && " · 가족"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inSpace.map((list) => (
              <ListCard key={list.id} list={list} today={today} />
            ))}
          </div>
        </section>
      ))}

      {lists.length === 0 && (
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.8 }}>
          아직 체크리스트가 없어요. 위에서 하나 만들어 보세요 — "장보기", "이번 주 집안일", "여행
          준비물" 같은 것부터.
        </p>
      )}
    </div>
  );
}

function AgendaGroup({
  title,
  rows,
  tone,
  today,
  nameOf,
}: {
  title: string;
  rows: AgendaRow[];
  tone?: "late" | "today";
  today: string;
  nameOf: (id: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <section style={{ marginBottom: 26 }}>
      <h2
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          marginBottom: 4,
          color: tone === "late" ? "var(--late)" : tone === "today" ? "var(--accent)" : "var(--ink-3)",
        }}
      >
        {title}
      </h2>
      <ul style={{ padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)" }}>
        {rows.map((row) => (
          <ChecklistItem
            key={row.id}
            item={row}
            today={today}
            // 모아 보기에서는 체크만. 고치기는 그 체크리스트에서 — 권한은 액션이 문서로 다시 본다.
            canWrite
            nameOf={nameOf}
            context={{
              title: row.checklistTitle.trim() === "" ? "제목 없음" : row.checklistTitle,
              href: `/lists/${row.checklistId}`,
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function ListCard({ list, today }: { list: ChecklistSummary; today: string }) {
  const total = list.open + list.done;
  const due = list.nextDueOn === null ? null : describeDue(list.nextDueOn, today);
  return (
    <Link
      href={`/lists/${list.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        background: "var(--card)",
        color: "var(--ink)",
      }}
    >
      <span style={{ display: "flex", color: "var(--ink-4)", width: 18, justifyContent: "center" }}>
        {list.icon ?? <ChecklistIcon size={15} />}
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14.5, fontWeight: 500 }}>
        {list.title.trim() === "" ? "제목 없음" : list.title}
      </span>
      {due !== null && (
        <span
          style={{
            fontSize: 12,
            color: due.tone === "late" ? "var(--late)" : due.tone === "today" ? "var(--accent)" : "var(--ink-3)",
          }}
        >
          {due.label}
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
        {total === 0 ? "비어 있음" : list.open === 0 ? "다 함" : `${list.open}/${total}`}
      </span>
    </Link>
  );
}

function NewChecklist({ spaces, defaultSpaceId }: { spaces: SpaceOption[]; defaultSpaceId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const id = await createChecklistAction({ title: clean, spaceId });
        router.push(`/lists/${id}`);
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "만들지 못했어요.");
      }
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder="새 체크리스트 이름"
          aria-label="새 체크리스트 이름"
          style={{ ...inputStyle, flex: "1 1 200px" }}
        />
        {spaces.length > 1 && (
          <select
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
            aria-label="어디에"
            style={{ ...inputStyle, width: 140 }}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.kind === "org" ? `👪 ${space.name}` : space.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={submit}
          disabled={busy || title.trim() === ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: busy || title.trim() === "" ? 0.45 : 1,
          }}
        >
          <PlusIcon size={13} />
          만들기
        </button>
      </div>
      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--late)", marginTop: 6 }}>{problem}</p>
      )}
    </section>
  );
}
