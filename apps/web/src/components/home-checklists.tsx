"use client";

import type { AgendaRow } from "@nyanotion/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { quickAddAction } from "@/lib/checklist-actions";
import { ChecklistItem, inputStyle, type Person } from "./checklist-item";
import { FamilyIcon, PlusIcon } from "./icons";

/**
 * 첫 화면의 중심 — **내 체크리스트 · 가족 체크리스트.**
 *
 * 공간마다 카드 하나. 카드에서 바로 적고 바로 체크한다. 적은 것은 그 공간의 기본 체크리스트로 간다
 * (없으면 "할 일" 이 생긴다). 체크리스트가 여럿이면 항목 옆에 어느 것인지 적어 준다.
 * 날짜·반복·담당·구매 같은 것은 `⋯` 나 체크리스트 화면에서 — 여기는 **적고 지우는** 자리다.
 */

export type HomeSpace = {
  id: string;
  name: string;
  kind: "personal" | "org";
  canWrite: boolean;
  /** 이 공간의 체크리스트 수. 둘 이상이면 항목마다 어느 체크리스트인지 보여 준다. */
  checklistCount: number;
  items: AgendaRow[];
};

/** 카드 하나에 처음 보여 줄 항목 수. 나머지는 "더 보기". */
const FIRST = 8;

export function HomeChecklists({
  spaces,
  today,
  people,
  userId,
}: {
  spaces: HomeSpace[];
  today: string;
  people: Person[];
  userId: string;
}) {
  const nameOf = (id: string) =>
    id === userId ? "나" : (people.find((p) => p.id === id)?.name ?? "누군가");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
        gap: 16,
        alignItems: "start",
      }}
    >
      {spaces.map((space) => (
        <SpaceCard key={space.id} space={space} today={today} nameOf={nameOf} />
      ))}
    </div>
  );
}

function SpaceCard({
  space,
  today,
  nameOf,
}: {
  space: HomeSpace;
  today: string;
  nameOf: (id: string) => string;
}) {
  const [all, setAll] = useState(false);
  const late = space.items.filter((item) => item.dueOn !== null && item.dueOn < today).length;
  const now = space.items.filter((item) => item.dueOn === today).length;
  const shown = all ? space.items : space.items.slice(0, FIRST);
  const title = space.kind === "org" ? `${space.name} 체크리스트` : "내 체크리스트";

  return (
    <section
      aria-label={title}
      style={{
        border: "1px solid var(--line)",
        borderRadius: 8,
        background: "var(--card)",
        padding: "16px 16px 10px",
      }}
    >
      <header style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        {space.kind === "org" && (
          <span style={{ display: "flex", color: "var(--ink-4)", alignSelf: "center" }}>
            <FamilyIcon size={15} />
          </span>
        )}
        <h2 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {space.items.length === 0 ? "다 했어요" : `${space.items.length}개`}
          {now > 0 && <span style={{ color: "var(--accent)" }}> · 오늘 {now}</span>}
          {late > 0 && <span style={{ color: "var(--late)" }}> · 지남 {late}</span>}
        </span>
      </header>

      {space.canWrite && <QuickAdd spaceId={space.id} today={today} family={space.kind === "org"} />}

      {space.items.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.7, padding: "10px 2px 6px" }}>
          {space.canWrite
            ? space.kind === "org"
              ? "가족이 같이 챙길 것을 적어 보세요. 누가 체크했는지 남아요."
              : "생각나는 할 일을 적어 보세요."
            : "아직 아무것도 없어요."}
        </p>
      ) : (
        <ul style={{ padding: 0, margin: "6px 0 0", borderTop: "1px solid var(--line-soft)" }}>
          {shown.map((item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              today={today}
              canWrite={space.canWrite}
              nameOf={nameOf}
              context={
                space.checklistCount > 1
                  ? {
                      title: item.checklistTitle.trim() === "" ? "제목 없음" : item.checklistTitle,
                      href: `/lists/${item.checklistId}`,
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 8,
          fontSize: 12,
        }}
      >
        {space.items.length > FIRST ? (
          <button
            onClick={() => setAll((value) => !value)}
            style={{ color: "var(--ink-3)", padding: "4px 0" }}
          >
            {all ? "접기" : `${space.items.length - FIRST}개 더 보기`}
          </button>
        ) : (
          <span />
        )}
        <Link href="/lists" style={{ border: 0, color: "var(--ink-3)", padding: "4px 0" }}>
          {space.checklistCount > 1 ? `체크리스트 ${space.checklistCount}개 ›` : "체크리스트 ›"}
        </Link>
      </footer>
    </section>
  );
}

function QuickAdd({ spaceId, today, family }: { spaceId: string; today: string; family: boolean }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [forToday, setForToday] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        await quickAddAction(spaceId, { title: clean, dueOn: forToday ? today : null });
        setTitle("");
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "적지 못했어요.");
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중의 Enter 는 글자를 확정하는 것이지 제출이 아니다.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder={family ? "가족 할 일 적기" : "할 일 적기"}
          aria-label={family ? "가족 할 일 적기" : "할 일 적기"}
          disabled={busy}
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0, height: 38 }}
        />
        <button
          onClick={() => setForToday((value) => !value)}
          aria-pressed={forToday}
          title="오늘 할 일로"
          style={{
            height: 38,
            padding: "0 10px",
            flexShrink: 0,
            borderRadius: "var(--radius)",
            fontSize: 12.5,
            border: `1px solid ${forToday ? "var(--accent-line)" : "var(--line)"}`,
            background: forToday ? "var(--accent-soft)" : "var(--card)",
            color: forToday ? "var(--accent)" : "var(--ink-3)",
          }}
        >
          오늘
        </button>
        <button
          onClick={submit}
          disabled={busy || title.trim() === ""}
          aria-label="적기"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            flexShrink: 0,
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            opacity: busy || title.trim() === "" ? 0.45 : 1,
          }}
        >
          <PlusIcon size={14} />
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
