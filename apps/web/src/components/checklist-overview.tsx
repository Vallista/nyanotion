"use client";

import type { AgendaRow, ChecklistSummary } from "@nyanotion/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addChecklistItemAction, createChecklistAction } from "@/lib/checklist-actions";
import { ChecklistItem, inputStyle, type Person } from "./checklist-item";
import { ChecklistIcon, FamilyIcon, PlusIcon } from "./icons";
import { Spinner } from "./pending";

export type OverviewSpace = {
  id: string;
  name: string;
  kind: "personal" | "org";
  canWrite: boolean;
};

/**
 * 체크리스트 — **나 · 가족으로 나눠서, 체크리스트마다 할 일을 펼쳐 둔다.**
 *
 * 위에는 오늘·지난 것만 짧게(개인·가족을 가로질러). 그 아래 공간마다 한 덩어리: 그 공간의 체크리스트들이
 * 각자 할 일과 적는 칸을 갖고 있고, **새 체크리스트는 그 덩어리에서 만든다** — 어디에 만들지 고르는 칸을
 * 따로 두지 않는다. 날짜·반복·담당·구매는 항목의 `⋯`.
 */
export function ChecklistOverview({
  today,
  lists,
  items,
  people,
  spaces,
  userId,
}: {
  today: string;
  lists: ChecklistSummary[];
  /** 안 한 항목 전부 (날짜 없는 것까지). */
  items: AgendaRow[];
  people: Person[];
  spaces: OverviewSpace[];
  userId: string;
}) {
  const nameOf = (id: string) =>
    id === userId ? "나" : (people.find((p) => p.id === id)?.name ?? "누군가");
  const urgent = items.filter((item) => item.dueOn !== null && item.dueOn <= today);
  const writable = new Set(spaces.filter((s) => s.canWrite).map((s) => s.id));

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
        체크리스트
      </h1>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 24, lineHeight: 1.7 }}>
        <b style={{ fontWeight: 500 }}>나</b>만 보는 것과 <b style={{ fontWeight: 500 }}>가족</b>이 같이 챙기는
        것을 나눠 둡니다. 체크리스트는 원하는 곳에 몇 개든 만들 수 있어요.
      </p>

      {urgent.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--accent)", marginBottom: 4 }}>
            오늘까지 {urgent.length}
          </h2>
          <ul style={{ padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)" }}>
            {urgent.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                today={today}
                canWrite={writable.has(item.spaceId)}
                nameOf={nameOf}
                context={{
                  title: `${spaceLabel(spaces, item.spaceId)} · ${item.checklistTitle.trim() || "제목 없음"}`,
                  href: `/lists/${item.checklistId}`,
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {spaces.map((space) => (
        <SpaceSection
          key={space.id}
          space={space}
          lists={lists.filter((list) => list.spaceId === space.id)}
          items={items.filter((item) => item.spaceId === space.id)}
          today={today}
          nameOf={nameOf}
        />
      ))}

      {spaces.every((space) => space.kind === "personal") && (
        <section aria-label="가족 체크리스트" style={{ marginBottom: 40 }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: 8,
              marginBottom: 12,
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span style={{ display: "flex", color: "var(--ink-4)" }}>
              <FamilyIcon size={16} />
            </span>
            <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>가족</h2>
          </header>
          <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7 }}>
            아직 가족이 없어요. 사이드바의 <b style={{ fontWeight: 500 }}>가족 만들기</b>로 만들거나 초대를
            받으면, 가족이 같이 챙기는 체크리스트를 여기 만들 수 있어요.
          </p>
        </section>
      )}
    </div>
  );
}

function spaceLabel(spaces: OverviewSpace[], spaceId: string): string {
  const space = spaces.find((s) => s.id === spaceId);
  if (space === undefined) return "";
  return space.kind === "personal" ? "나" : space.name;
}

function SpaceSection({
  space,
  lists,
  items,
  today,
  nameOf,
}: {
  space: OverviewSpace;
  lists: ChecklistSummary[];
  items: AgendaRow[];
  today: string;
  nameOf: (id: string) => string;
}) {
  const title = space.kind === "personal" ? "나" : space.name;
  return (
    <section aria-label={`${title} 체크리스트`} style={{ marginBottom: 40 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 8,
          marginBottom: 12,
          borderBottom: "1px solid var(--line)",
        }}
      >
        <span style={{ display: "flex", color: "var(--ink-4)" }}>
          {space.kind === "org" ? <FamilyIcon size={16} /> : <ChecklistIcon size={16} />}
        </span>
        <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {space.kind === "org" ? "가족이 같이 봐요" : "나만 봐요"} · 남은 일 {items.length}
        </span>
      </header>

      {space.canWrite && <NewChecklist spaceId={space.id} family={space.kind === "org"} />}

      {lists.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7 }}>
          아직 체크리스트가 없어요.
          {space.canWrite && ' 위에서 하나 만들어 보세요 — "장보기", "이번 주 집안일", "여행 준비물" 같은 것.'}
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
            gap: 12,
            alignItems: "start",
          }}
        >
          {lists.map((list) => (
            <ListPanel
              key={list.id}
              list={list}
              items={items.filter((item) => item.checklistId === list.id)}
              canWrite={space.canWrite}
              today={today}
              nameOf={nameOf}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** 체크리스트 하나 — 제목, 안 한 일, 적는 칸. 다 보려면 제목을 눌러 들어간다. */
function ListPanel({
  list,
  items,
  canWrite,
  today,
  nameOf,
}: {
  list: ChecklistSummary;
  items: AgendaRow[];
  canWrite: boolean;
  today: string;
  nameOf: (id: string) => string;
}) {
  const FIRST = 6;
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <article
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--card)",
        padding: "12px 14px 8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <Link
          href={`/lists/${list.id}`}
          style={{
            border: 0,
            color: "var(--ink)",
            fontSize: 15,
            fontWeight: 600,
            flexGrow: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {list.icon !== null && <span style={{ marginRight: 5 }}>{list.icon}</span>}
          {list.title.trim() === "" ? "제목 없음" : list.title}
        </Link>
        <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
          {list.open === 0 ? (list.done > 0 ? "다 함" : "비어 있음") : `${list.open}/${list.open + list.done}`}
        </span>
      </div>

      {canWrite && <AddToList checklistId={list.id} />}

      {items.length > 0 && (
        <ul style={{ padding: 0, margin: "4px 0 0", borderTop: "1px solid var(--line-soft)" }}>
          {shown.map((item) => (
            <ChecklistItem key={item.id} item={item} today={today} canWrite={canWrite} nameOf={nameOf} />
          ))}
        </ul>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, paddingTop: 6 }}>
        {items.length > FIRST ? (
          <button onClick={() => setAll((v) => !v)} style={{ color: "var(--ink-3)", padding: "4px 0" }}>
            {all ? "접기" : `${items.length - FIRST}개 더`}
          </button>
        ) : (
          <span />
        )}
        <Link href={`/lists/${list.id}`} style={{ border: 0, color: "var(--ink-3)", padding: "4px 0" }}>
          열기 ›
        </Link>
      </div>
    </article>
  );
}

function AddToList({ checklistId }: { checklistId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    // 칸은 바로 비워 다음 것을 이어 적게 한다. 서버는 뒤따르고, 실패하면 글을 되돌려 놓는다.
    setTitle("");
    startTransition(async () => {
      setProblem(null);
      try {
        await addChecklistItemAction(checklistId, { title: clean });
        router.refresh();
      } catch (error) {
        setTitle((current) => (current === "" ? clean : current));
        setProblem(error instanceof Error ? error.message : "적지 못했어요.");
      }
    });
  }

  return (
    <div style={{ marginTop: 8 }}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
        }}
        placeholder="+ 할 일 적고 Enter"
        aria-label="할 일 적기"
        style={{ ...inputStyle, width: "100%", height: 32, border: "1px dashed var(--line-strong)" }}
      />
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--late)", marginTop: 4 }}>
          {problem}
        </p>
      )}
    </div>
  );
}

/** 그 공간에 새 체크리스트를 만든다. 만들고 나서 그 자리에 남는다 — 바로 할 일을 적을 수 있게. */
export function NewChecklist({
  spaceId,
  family,
  onCreated,
}: {
  spaceId: string;
  family: boolean;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const id = await createChecklistAction({ title: clean, spaceId });
        setTitle("");
        onCreated?.(id);
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "만들지 못했어요.");
      }
    });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder={family ? "새 가족 체크리스트 이름" : "새 체크리스트 이름"}
          aria-label={family ? "새 가족 체크리스트 이름" : "새 체크리스트 이름"}
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0 }}
        />
        <button
          onClick={submit}
          disabled={busy || title.trim() === ""}
          aria-busy={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            flexShrink: 0,
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: !busy && title.trim() === "" ? 0.45 : 1,
          }}
        >
          {busy ? <Spinner size={12} /> : <PlusIcon size={13} />}
          {busy ? "만드는 중…" : "새 체크리스트"}
        </button>
      </div>
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--late)", marginTop: 6 }}>
          {problem}
        </p>
      )}
    </div>
  );
}
