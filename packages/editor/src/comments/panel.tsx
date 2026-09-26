"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePorts } from "../context";
import { CheckIcon, CloseIcon, CommentIcon, DotsIcon } from "../icons";
import type { CommentAuthor, CommentThread } from "../ports";

/**
 * 댓글 — 블록 하나에 실타래 하나.
 *
 * **댓글은 Yjs 가 아니라 서버(Postgres)에 있다.** 본문은 오프라인에서도 고칠 수 있어야 하지만
 * 댓글은 "다른 사람에게 말 걸기"라서 연결이 없으면 어차피 뜻이 없다. CRDT 에 넣으면
 * 지운 댓글이 다른 기기에서 되살아나는 종류의 문제를 떠안게 된다.
 *
 * 노션은 고른 **글자 범위**에 달지만 여기서는 **블록**에 단다. 범위를 쓰려면 본문 안에 표식을
 * 남겨야 하고(=CRDT 로 돌아간다), 가족끼리 쓰는 메모에서는 "이 줄에 대해"로 충분하다.
 */
export function CommentsPanel({
  documentId,
  editor,
  userId,
}: {
  documentId: string;
  // BlockNote 에디터. 타입이 스키마에 따라 달라지므로 필요한 것만 좁게 받는다.
  editor: {
    getTextCursorPosition(): { block: { id: string } };
    getBlock(id: string): unknown;
  };
  userId: string;
}) {
  const ports = usePorts();
  const comments = ports.comments;

  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [people, setPeople] = useState<CommentAuthor[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canComment, setCanComment] = useState(false);

  const load = useCallback(async () => {
    if (comments === null) return;
    try {
      const got = await comments.load(documentId);
      setThreads(got.threads);
      setPeople(got.people);
      setCanComment(got.canComment);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [comments, documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]));
    return (id: string) => map.get(id)?.name ?? "누군가";
  }, [people]);

  if (comments === null) return null;

  const openCount = threads.filter((t) => !t.resolved).length;
  const shown = threads.filter((t) => (showResolved ? true : !t.resolved));

  async function start(body: string): Promise<void> {
    const blockId = editor.getTextCursorPosition().block.id;
    await comments!.start(documentId, blockId, body);
    await load();
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 24,
          padding: "5px 9px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--line)",
          fontSize: 12.5,
          color: "var(--ink-2)",
          background: open ? "var(--surface)" : "transparent",
        }}
      >
        <CommentIcon size={14} />
        댓글
        {openCount > 0 && <span style={{ color: "var(--accent)" }}>{openCount}</span>}
      </button>

      {open && (
        <section
          aria-label="댓글"
          style={{
            marginTop: 10,
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            background: "var(--card)",
            padding: "12px 14px",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              댓글 {openCount}
            </span>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: "var(--ink-3)",
              }}
            >
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(event) => setShowResolved(event.target.checked)}
                style={{ width: 13, height: 13, accentColor: "var(--accent)" }}
              />
              정리된 것도 보기
            </label>
          </header>

          {failed && (
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 10 }}>
              댓글을 가져오지 못했어요.
            </p>
          )}

          {shown.length === 0 && !failed && (
            <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.75, marginBottom: 10 }}>
              아직 댓글이 없어요. 본문에 커서를 두고 아래에 쓰면 그 줄에 달립니다.
            </p>
          )}

          {shown.map((thread) => (
            <Thread
              key={thread.id}
              thread={thread}
              userId={userId}
              editable={canComment}
              nameOf={nameOf}
              onChanged={load}
            />
          ))}

          {canComment && <Composer placeholder="커서가 있는 줄에 댓글 달기" onSubmit={start} />}
        </section>
      )}
    </>
  );
}

function Thread({
  thread,
  userId,
  editable,
  nameOf,
  onChanged,
}: {
  thread: CommentThread;
  userId: string;
  editable: boolean;
  nameOf: (id: string) => string;
  onChanged: () => Promise<void>;
}) {
  const ports = usePorts();
  const comments = ports.comments!;
  const [busy, setBusy] = useState(false);

  async function act(run: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      style={{
        borderTop: "1px solid var(--line-soft)",
        paddingTop: 10,
        marginBottom: 10,
        opacity: thread.resolved ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {thread.resolved ? "정리됨" : "열림"}
        </span>
        {editable && (
          <button
            onClick={() => void act(() => comments.setResolved(thread.id, !thread.resolved))}
            disabled={busy}
            title={thread.resolved ? "다시 열기" : "정리하기"}
            aria-label={thread.resolved ? "다시 열기" : "정리하기"}
            style={{ display: "flex", color: "var(--ink-4)", padding: 2 }}
          >
            {thread.resolved ? <CloseIcon size={13} /> : <CheckIcon size={13} />}
          </button>
        )}
      </div>

      {thread.comments.map((comment) => (
        <div key={comment.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              fontSize: 11.5,
              color: "var(--ink-3)",
              marginBottom: 2,
            }}
          >
            <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>
              {nameOf(comment.authorId)}
            </span>
            <span>{when(comment.createdAt)}</span>
            {comment.authorId === userId && editable && (
              <button
                onClick={() => void act(() => comments.remove(comment.id))}
                disabled={busy}
                aria-label="댓글 지우기"
                title="지우기"
                style={{ marginLeft: "auto", color: "var(--ink-5)", display: "flex" }}
              >
                <DotsIcon size={13} />
              </button>
            )}
          </div>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.7,
              color: "var(--ink)",
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {comment.body}
          </p>
        </div>
      ))}

      {editable && !thread.resolved && (
        <Composer
          placeholder="답하기"
          compact
          onSubmit={async (body) => {
            await comments.reply(thread.id, body);
            await onChanged();
          }}
        />
      )}
    </article>
  );
}

function Composer({
  placeholder,
  compact = false,
  onSubmit,
}: {
  placeholder: string;
  compact?: boolean;
  onSubmit: (body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(): Promise<void> {
    const body = draft.trim();
    if (body === "" || busy) return;
    setBusy(true);
    try {
      await onSubmit(body);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, marginTop: compact ? 4 : 8 }}>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // 줄바꿈은 Shift+Enter. Enter 로 보낸다 — 짧은 말이 대부분이라.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder={placeholder}
        rows={compact ? 1 : 2}
        style={{
          flex: 1,
          resize: "vertical",
          font: "inherit",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--ink)",
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          padding: "6px 8px",
          outline: "none",
        }}
      />
      <button
        onClick={() => void send()}
        disabled={busy || draft.trim() === ""}
        style={{
          alignSelf: "flex-end",
          height: 28,
          padding: "0 10px",
          borderRadius: "var(--radius)",
          fontSize: 12.5,
          background: "var(--ink)",
          color: "var(--paper)",
          opacity: busy || draft.trim() === "" ? 0.45 : 1,
        }}
      >
        남기기
      </button>
    </div>
  );
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
