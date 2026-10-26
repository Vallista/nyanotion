"use client";

import type { MemoRow } from "@nyanotion/db";
import { MEMO_MAX } from "@nyanotion/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  editMemoAction,
  memoToDocumentAction,
  memoToTodoAction,
  removeMemoAction,
  setMemoDoneAction,
} from "@/lib/life-actions";
import { SmallButton } from "../checklist-item";
import { ChevronDown, ChevronRight } from "../icons";
import { PageTitle, Section, SingleView, useMedia } from "../mac-ui";
import { MemoCapture, MemoList, ago, firstLine, movedLink, useLifeCall, type MemoSpace } from "./memo-box";

/**
 * 메모함 전체. 넓으면 메모 앱처럼 두 칸 — 왼쪽 목록(첫 줄이 제목), 오른쪽 고른 메모.
 * 좁으면 한 줄로 쌓은 목록(오늘 화면과 같은 MemoList).
 */
export function MemosScreen({ open, done, spaces, serverNow }: { open: MemoRow[]; done: MemoRow[]; spaces: MemoSpace[]; serverNow: number }) {
  const wide = useMedia("(min-width: 900px)");
  const narrow = useMedia("(max-width: 760px)");
  const [showDone, setShowDone] = useState(false);

  // 폭을 재기 전(서버·첫 그리기)에는 비워 둔다 — 두 칸과 한 줄 중 틀린 쪽을 한 번 보여 주고 바꾸면 화면이 튄다.
  if (wide === null) return <div style={{ flexGrow: 1 }} />;
  if (!wide) {
    return (
      <SingleView maxWidth={720}>
          <PageTitle title="메모함" sub="떠오른 것을 일단 적어 두는 곳 — 나만 봐요." />
          <MemoCapture autoFocus={narrow === false} />
          <Section title={`남은 메모 ${open.length}`}>
            <MemoList memos={open} spaces={spaces} now={serverNow} />
          </Section>
          {done.length > 0 && (
            <Section
              title={
                <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                  {showDone ? <ChevronDown size={11} /> : <ChevronRight size={11} />}끝낸 메모 {done.length}
                </button>
              }
            >
              {showDone && <MemoList memos={done} spaces={spaces} now={serverNow} done />}
            </Section>
          )}
      </SingleView>
    );
  }
  return <MemoSplit open={open} done={done} spaces={spaces} now={serverNow} />;
}

/* ------------------------------------------------------------------ 두 칸 */

function MemoSplit({ open, done, spaces, now }: { open: MemoRow[]; done: MemoRow[]; spaces: MemoSpace[]; now: number }) {
  const [showDone, setShowDone] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(open[0]?.id ?? null);
  const all = [...open, ...done];
  const selected = all.find((m) => m.id === selectedId) ?? null;

  // 고른 메모가 사라지면(옮김·지움) 남은 것 중 첫 번째로.
  useEffect(() => {
    if (selectedId !== null && !all.some((m) => m.id === selectedId)) setSelectedId(open[0]?.id ?? null);
  }, [all, open, selectedId]);

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", lineHeight: 1.45 }}>
      <section
        aria-label="메모 목록"
        style={{ width: 320, flexShrink: 0, borderRight: "1px solid var(--line)", overflowY: "auto", padding: "16px 10px 24px", display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ padding: "0 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ fontSize: 15, fontWeight: 700 }}>메모함</h1>
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{open.length}개</span>
        </div>
        <div style={{ padding: "0 6px" }}>
          <MemoCapture compact />
        </div>
        <MemoRows memos={open} now={now} selectedId={selectedId} onSelect={setSelectedId} empty="메모함이 비어 있어요." />
        {done.length > 0 && (
          <>
            <button
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px 0", fontSize: 11, fontWeight: 600, color: "var(--ink-4)" }}
            >
              {showDone ? <ChevronDown size={10} /> : <ChevronRight size={10} />}끝낸 메모 {done.length}
            </button>
            {showDone && <MemoRows memos={done} now={now} selectedId={selectedId} onSelect={setSelectedId} empty="" />}
          </>
        )}
      </section>
      <div style={{ flexGrow: 1, minWidth: 0, overflowY: "auto" }}>
        {selected === null ? (
          <p style={{ padding: "64px 24px", textAlign: "center", fontSize: 13, color: "var(--ink-4)" }}>메모를 고르면 여기에 보여요.</p>
        ) : (
          <MemoDetail key={selected.id} memo={selected} spaces={spaces} now={now} />
        )}
      </div>
    </div>
  );
}

function MemoRows({
  memos,
  now,
  selectedId,
  onSelect,
  empty,
}: {
  memos: MemoRow[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (memos.length === 0) {
    return empty === "" ? null : <p style={{ padding: "6px 8px", fontSize: 12.5, color: "var(--ink-4)" }}>{empty}</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
      {memos.map((memo, i) => {
        const on = memo.id === selectedId;
        const [title, ...rest] = memo.text.split("\n").filter((line) => line.trim() !== "");
        // 선은 고른 줄과 그 바로 아래 줄에서는 숨긴다 — 메모 앱처럼 고른 판이 깔끔하게.
        const nextOn = memos[i + 1]?.id === selectedId;
        return (
          <li key={memo.id}>
            <button
              onClick={() => onSelect(memo.id)}
              aria-current={on ? "true" : undefined}
              style={{
                display: "block",
                width: "100%",
                padding: "8px 10px",
                borderRadius: "var(--radius)",
                background: on ? "var(--sel)" : "transparent",
                boxShadow: on || nextOn || i === memos.length - 1 ? "none" : "0 1px 0 var(--line-soft)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: memo.doneAt === null ? "var(--ink)" : "var(--ink-3)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {title ?? ""}
              </span>
              <span style={{ display: "block", fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                <span style={{ color: "var(--ink-2)" }}>{ago(memo.createdAt, now)}</span>
                {rest.length > 0 ? `  ${rest.join(" ")}` : ""}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MemoDetail({ memo, spaces, now }: { memo: MemoRow; spaces: MemoSpace[]; now: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memo.text);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { pending, problem, call } = useLifeCall();
  const done = memo.doneAt !== null;
  const moved = movedLink(memo.movedTo);
  const created = new Date(memo.createdAt);
  const when = `${created.getFullYear()}년 ${created.getMonth() + 1}월 ${created.getDate()}일 ${created.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;

  return (
    <article aria-label={`메모: ${firstLine(memo.text)}`} style={{ display: "flex", flexDirection: "column", minHeight: "100%", opacity: pending ? 0.6 : 1 }}>
      {/* 메모 앱의 도구 막대 자리 — 고른 메모를 다루는 단추. */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "10px 16px", borderBottom: "1px solid var(--line-soft)" }}>
        <SmallButton primary={!done} disabled={pending} onClick={() => call(() => setMemoDoneAction(memo.id, !done))}>
          {done ? "다시 메모함으로" : "끝냄"}
        </SmallButton>
        {!done &&
          spaces.map((space) => (
            <SmallButton key={space.id} disabled={pending} onClick={() => call(() => memoToTodoAction(memo.id, space.id))}>
              {space.label} 할 일로
            </SmallButton>
          ))}
        {!done && (
          <SmallButton disabled={pending} onClick={() => call(() => memoToDocumentAction(memo.id))}>
            내 문서로
          </SmallButton>
        )}
        <span style={{ flexGrow: 1 }} />
        {!done && !editing && (
          <SmallButton disabled={pending} onClick={() => setEditing(true)}>
            고치기
          </SmallButton>
        )}
        <SmallButton
          disabled={pending}
          onClick={() => {
            if (!confirmRemove) {
              setConfirmRemove(true);
              return;
            }
            call(() => removeMemoAction(memo.id));
          }}
        >
          {confirmRemove ? "정말 지우기" : "지우기"}
        </SmallButton>
      </div>

      <div style={{ width: "100%", maxWidth: 680, margin: "0 auto", padding: "18px 32px 48px", display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
          {when}
          {moved !== null && (
            <>
              {" · "}
              <Link href={moved.href}>{moved.label}</Link>
            </>
          )}
          {done && moved === null && " · 끝냄"}
        </p>
        {editing ? (
          <>
            <textarea
              autoFocus
              value={text}
              maxLength={MEMO_MAX}
              onChange={(e) => setText(e.target.value)}
              aria-label="메모 고치기"
              rows={Math.min(18, Math.max(4, text.split("\n").length + 1))}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius)",
                background: "var(--card)",
                fontSize: "var(--input-font, 15px)",
                lineHeight: 1.65,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <SmallButton primary disabled={pending || text.trim() === ""} onClick={() => call(() => editMemoAction(memo.id, text), () => setEditing(false))}>
                저장
              </SmallButton>
              <SmallButton
                onClick={() => {
                  setText(memo.text);
                  setEditing(false);
                }}
              >
                그만두기
              </SmallButton>
            </div>
          </>
        ) : (
          <div
            onDoubleClick={() => !done && setEditing(true)}
            style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", color: done ? "var(--ink-3)" : "var(--ink)" }}
          >
            <MemoBody text={memo.text} />
          </div>
        )}
        {problem !== null && (
          <p role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
            {problem}
          </p>
        )}
        <p style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {ago(memo.updatedAt, now)} 고침 · 두 번 누르면 고칠 수 있어요
        </p>
      </div>
    </article>
  );
}

/** 첫 줄은 메모 앱처럼 제목으로 굵게. */
function MemoBody({ text }: { text: string }) {
  const lines = text.split("\n");
  const head = lines.findIndex((line) => line.trim() !== "");
  if (head === -1) return null;
  return (
    <>
      <span style={{ display: "block", fontSize: 22, fontWeight: 700, lineHeight: 1.35, marginBottom: 6 }}>{lines[head]}</span>
      {lines.slice(head + 1).join("\n")}
    </>
  );
}
