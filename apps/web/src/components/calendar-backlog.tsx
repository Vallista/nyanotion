"use client";

import type { AgendaRow } from "@nyanotion/db";
import { REPEAT_LABEL, describeDue } from "@nyanotion/shared";
import { useState } from "react";
import { DRAG_TYPE } from "./calendar-grid";
import { durationLabel, type CalSpace } from "./calendar-model";
import { inputStyle } from "./checklist-item";
import { CheckBoxIcon, PlusIcon } from "./icons";

/**
 * 백로그 — **날짜 없는 할 일.** 생각나면 여기 적고, 할 때가 정해지면 캘린더 칸에 놓는다.
 *
 * 데스크탑은 끌어다 놓는다. 폰은 "놓기" 를 눌러 고른 뒤 칸을 누른다 (터치에서 끌기는 스크롤과 싸운다).
 * 지난 날짜에 안 한 것은 "밀린 일" 로 위에 따로 — 오늘로 당기거나 백로그로 돌려 다시 놓는다.
 */
export function Backlog({
  backlog,
  overdue,
  spaces,
  today,
  placingId,
  busy,
  nameOf,
  onAdd,
  onPlace,
  onOpen,
  onToggle,
  onToday,
  onUnschedule,
  onDragItem,
}: {
  backlog: AgendaRow[];
  overdue: AgendaRow[];
  spaces: CalSpace[];
  today: string;
  placingId: string | null;
  busy: boolean;
  nameOf: (id: string) => string;
  onAdd: (spaceId: string, title: string) => Promise<boolean>;
  onPlace: (item: AgendaRow) => void;
  onOpen: (item: AgendaRow) => void;
  onToggle: (item: AgendaRow) => void;
  onToday: (item: AgendaRow) => void;
  onUnschedule: (item: AgendaRow) => void;
  onDragItem: (itemId: string | null) => void;
}) {
  const writable = spaces.filter((space) => space.canWrite);
  const [spaceId, setSpaceId] = useState(writable[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const several = spaces.length > 1;
  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? "";

  async function submit(): Promise<void> {
    const clean = title.trim();
    if (clean === "" || spaceId === "") return;
    if (await onAdd(spaceId, clean)) setTitle("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 14px 40px" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>백로그</h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          {backlog.length === 0 ? "비어 있어요" : `${backlog.length}개`}
        </span>
      </header>

      {writable.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                // 한글 조합 중의 Enter 는 글자를 확정하는 것이지 제출이 아니다.
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void submit();
              }}
              placeholder="할 일 적기 — 날짜는 나중에"
              aria-label="백로그에 적기"
              disabled={busy}
              style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0, height: 36 }}
            />
            <button
              onClick={() => void submit()}
              disabled={busy || title.trim() === ""}
              aria-label="적기"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: "var(--radius)",
                background: "var(--accent)",
                color: "var(--on-accent)",
                opacity: busy || title.trim() === "" ? 0.45 : 1,
              }}
            >
              <PlusIcon size={14} />
            </button>
          </div>
          {writable.length > 1 && (
            <div role="radiogroup" aria-label="누구의 할 일" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {writable.map((space) => (
                <button
                  key={space.id}
                  role="radio"
                  aria-checked={space.id === spaceId}
                  onClick={() => setSpaceId(space.id)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    border: `1px solid ${space.id === spaceId ? "var(--accent-line)" : "var(--line)"}`,
                    background: space.id === spaceId ? "var(--accent-soft)" : "var(--card)",
                    color: space.id === spaceId ? "var(--accent)" : "var(--ink-3)",
                  }}
                >
                  {space.kind === "personal" ? "내 할 일" : `${space.name} 할 일`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {overdue.length > 0 && (
        <section aria-label="밀린 일">
          <h3 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--late)", marginBottom: 4 }}>
            밀린 일 {overdue.length}
          </h3>
          <ul style={{ padding: 0, margin: 0 }}>
            {overdue.map((item) => (
              <Row
                key={item.id}
                item={item}
                meta={describeDue(item.dueOn ?? today, today).label}
                late
                tag={several ? spaceName(item.spaceId) : null}
                nameOf={nameOf}
                placing={placingId === item.id}
                busy={busy}
                onOpen={onOpen}
                onToggle={onToggle}
                onDragItem={onDragItem}
                actions={
                  <>
                    <TextButton onClick={() => onToday(item)}>오늘로</TextButton>
                    <TextButton onClick={() => onUnschedule(item)}>백로그로</TextButton>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-label="백로그 목록">
        {backlog.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.7 }}>
            날짜를 아직 못 정한 할 일을 적어 두세요. 할 때가 정해지면 캘린더 칸에 놓습니다.
          </p>
        ) : (
          <ul style={{ padding: 0, margin: 0 }}>
            {backlog.map((item) => (
              <Row
                key={item.id}
                item={item}
                meta={null}
                tag={several ? spaceName(item.spaceId) : null}
                nameOf={nameOf}
                placing={placingId === item.id}
                busy={busy}
                onOpen={onOpen}
                onToggle={onToggle}
                onDragItem={onDragItem}
                actions={<TextButton onClick={() => onPlace(item)}>{placingId === item.id ? "고름" : "놓기"}</TextButton>}
              />
            ))}
          </ul>
        )}
        <p style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.6, marginTop: 10 }}>
          끌어다 시간 칸에 놓거나, <strong style={{ fontWeight: 500 }}>놓기</strong>를 누른 뒤 칸을 누르세요.
        </p>
      </section>
    </div>
  );
}

function Row({
  item,
  meta,
  late = false,
  tag,
  nameOf,
  placing,
  busy,
  onOpen,
  onToggle,
  onDragItem,
  actions,
}: {
  item: AgendaRow;
  meta: string | null;
  late?: boolean;
  tag: string | null;
  nameOf: (id: string) => string;
  placing: boolean;
  busy: boolean;
  onOpen: (item: AgendaRow) => void;
  onToggle: (item: AgendaRow) => void;
  onDragItem: (itemId: string | null) => void;
  actions: React.ReactNode;
}) {
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragItem(item.id);
      }}
      onDragEnd={() => onDragItem(null)}
      style={{
        listStyle: "none",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 6px",
        margin: "0 -6px",
        borderBottom: "1px solid var(--line-soft)",
        borderRadius: "var(--radius)",
        background: placing ? "var(--accent-soft)" : "transparent",
        outline: placing ? "1px solid var(--accent-line)" : "none",
        cursor: "grab",
        opacity: busy ? 0.7 : 1,
      }}
    >
      <button
        onClick={() => onToggle(item)}
        aria-label="했음"
        style={{ display: "flex", flexShrink: 0, padding: 6, margin: -6, marginTop: -5, color: "var(--ink-4)" }}
      >
        <CheckBoxIcon size={16} checked={false} />
      </button>
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <button
          onClick={() => onOpen(item)}
          style={{ fontSize: 13.5, lineHeight: 1.45, textAlign: "left", color: "var(--ink)", wordBreak: "break-word" }}
        >
          {item.title}
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 8px", fontSize: 11.5, color: "var(--ink-3)" }}>
          {meta !== null && <span style={{ color: late ? "var(--late)" : undefined }}>{meta}</span>}
          {tag !== null && <span>{tag}</span>}
          {item.estMin !== null && <span>{durationLabel(item.estMin)}</span>}
          {item.repeat !== "none" && <span>↻ {REPEAT_LABEL[item.repeat]}</span>}
          {item.assigneeId !== null && <span>@{nameOf(item.assigneeId)}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>
    </li>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, color: "var(--accent)", padding: "2px 0", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}
