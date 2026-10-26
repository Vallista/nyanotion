"use client";

import type { MemoRow } from "@nyanotion/db";
import { MEMO_MAX } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addMemoAction,
  editMemoAction,
  memoToDocumentAction,
  memoToTodoAction,
  removeMemoAction,
  setMemoDoneAction,
  type LifeResult,
} from "@/lib/life-actions";
import { SmallButton, inputStyle } from "../checklist-item";

/**
 * 메모함 — 떠오른 것을 일단 적고, 나중에 할 일·문서로 옮기거나 끝냈다고 표시한다 (`docs/15-today.md`).
 * 오늘 화면(위 몇 개)과 `/memos`(전부)가 같이 쓴다.
 */

export type MemoSpace = { id: string; label: string };

/** 서버 동작을 부르고 결과를 알린다. 되면 화면을 다시 받는다. */
function useLifeCall(): {
  pending: boolean;
  problem: string | null;
  call: (task: () => Promise<LifeResult>, after?: (result: LifeResult) => void) => void;
} {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const call = (task: () => Promise<LifeResult>, after?: (result: LifeResult) => void) =>
    start(async () => {
      setProblem(null);
      try {
        const result = await task();
        if (!result.ok) {
          setProblem(result.message ?? "하지 못했어요.");
          return;
        }
        after?.(result);
        router.refresh();
      } catch {
        setProblem("하지 못했어요. 잠시 뒤 다시 해 주세요.");
      }
    });
  return { pending, problem, call };
}

export { useLifeCall };

export function MemoCapture({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const [text, setText] = useState("");
  const { pending, problem, call } = useLifeCall();
  const submit = () => {
    if (text.trim() === "" || pending) return;
    call(() => addMemoAction(text), () => setText(""));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        autoFocus={autoFocus}
        value={text}
        maxLength={MEMO_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter 로 적고, Shift+Enter 로 줄을 바꾼다. 한글 조합 중의 Enter 는 건너뛴다.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="떠오른 것을 적어 두세요 — Enter 로 저장, Shift+Enter 로 줄바꿈"
        aria-label="새 메모"
        rows={compact ? 2 : 3}
        style={{ ...inputStyle, width: "100%", height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.55 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SmallButton primary busy={pending} disabled={pending || text.trim() === ""} onClick={submit}>
          메모하기
        </SmallButton>
        {problem !== null && (
          <span role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
            {problem}
          </span>
        )}
      </div>
    </div>
  );
}

function ago(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso)) / 60_000;
  if (diff < 1) return "방금";
  if (diff < 60) return `${Math.floor(diff)}분 전`;
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`;
  const days = Math.floor(diff / (60 * 24));
  if (days < 30) return `${days}일 전`;
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function movedLink(movedTo: string | null): { href: string; label: string } | null {
  if (movedTo === null) return null;
  if (movedTo.startsWith("doc:")) return { href: `/d/${movedTo.slice(4)}`, label: "문서로 옮김" };
  if (movedTo.startsWith("todo:")) return { href: "/", label: "할 일로 옮김" };
  return null;
}

export function MemoList({
  memos,
  spaces,
  now,
  done = false,
  limit,
}: {
  memos: MemoRow[];
  /** 할 일로 옮길 수 있는 공간들 — 첫 번째가 기본(나). */
  spaces: MemoSpace[];
  /** 서버가 그린 시각(밀리초) — 첫 그리기가 어긋나지 않게. */
  now: number;
  done?: boolean;
  limit?: number;
}) {
  const shown = limit === undefined ? memos : memos.slice(0, limit);
  if (shown.length === 0) {
    return <p style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "6px 0" }}>{done ? "끝낸 메모가 아직 없어요." : "메모함이 비어 있어요."}</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
      {shown.map((memo, i) => (
        <MemoItem key={memo.id} memo={memo} spaces={spaces} now={now} first={i === 0} />
      ))}
    </ul>
  );
}

function MemoItem({ memo, spaces, now, first }: { memo: MemoRow; spaces: MemoSpace[]; now: number; first: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(memo.text);
  const [menu, setMenu] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { pending, problem, call } = useLifeCall();
  const done = memo.doneAt !== null;
  const moved = movedLink(memo.movedTo);

  return (
    <li style={{ borderTop: first ? 0 : "1px solid var(--line-soft)", padding: "9px 0", display: "flex", flexDirection: "column", gap: 6, opacity: pending ? 0.6 : 1 }}>
      {editing ? (
        <>
          <textarea
            autoFocus
            value={text}
            maxLength={MEMO_MAX}
            onChange={(e) => setText(e.target.value)}
            aria-label="메모 고치기"
            rows={Math.min(8, Math.max(2, text.split("\n").length))}
            style={{ ...inputStyle, width: "100%", height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.55 }}
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
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <button
            onClick={() => call(() => setMemoDoneAction(memo.id, !done))}
            aria-label={done ? `"${firstLine(memo.text)}" 다시 메모함으로` : `"${firstLine(memo.text)}" 끝냄`}
            title={done ? "다시 메모함으로" : "끝냄"}
            style={{
              width: 18,
              height: 18,
              marginTop: 2,
              flexShrink: 0,
              borderRadius: "50%",
              textAlign: "center",
              border: `1.5px solid ${done ? "var(--accent)" : "var(--ink-4)"}`,
              background: done ? "var(--accent)" : "transparent",
              color: "var(--paper)",
              fontSize: 11,
              lineHeight: "15px",
            }}
          >
            {done ? "✓" : ""}
          </button>
          <div style={{ minWidth: 0, flexGrow: 1 }}>
            <p
              onDoubleClick={() => !done && setEditing(true)}
              style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", color: done ? "var(--ink-3)" : "var(--ink)" }}
            >
              {memo.text}
            </p>
            <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
              {ago(memo.createdAt, now)}
              {moved !== null && (
                <>
                  {" · "}
                  <Link href={moved.href} style={{ color: "var(--ink-3)" }}>
                    {moved.label}
                  </Link>
                </>
              )}
            </p>
          </div>
          {!done && (
            <button
              onClick={() => setMenu((v) => !v)}
              aria-expanded={menu}
              title="할 일·문서로 옮기기, 고치기, 지우기"
              style={{ flexShrink: 0, height: 26, padding: "0 8px", fontSize: 12, borderRadius: "var(--radius)", border: "1px solid var(--line)", background: menu ? "var(--chip)" : "var(--card)", color: "var(--ink-3)" }}
            >
              옮기기
            </button>
          )}
        </div>
      )}
      {menu && !editing && !done && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 28 }}>
          {spaces.map((space) => (
            <SmallButton key={space.id} disabled={pending} onClick={() => call(() => memoToTodoAction(memo.id, space.id), () => setMenu(false))}>
              {space.label} 할 일로
            </SmallButton>
          ))}
          <SmallButton disabled={pending} onClick={() => call(() => memoToDocumentAction(memo.id), () => setMenu(false))}>
            내 문서로
          </SmallButton>
          <SmallButton
            disabled={pending}
            onClick={() => {
              setMenu(false);
              setEditing(true);
            }}
          >
            고치기
          </SmallButton>
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
      )}
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12, color: "var(--late)", paddingLeft: 28 }}>
          {problem}
        </p>
      )}
    </li>
  );
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.length > 30 ? `${line.slice(0, 30)}…` : line;
}
