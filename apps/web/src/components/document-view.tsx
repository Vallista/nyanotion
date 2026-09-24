"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { renameDocumentAction, saveContentAction } from "@/lib/actions";
import { UNTITLED } from "@/lib/tree";

// BlockNote 는 DOM 에 의존하므로 서버에서 렌더하지 않는다.
const Editor = dynamic(() => import("./editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "4px 2px" }}>에디터를 불러오는 중…</p>
  ),
});

const SAVE_DELAY_MS = 800;

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

export function DocumentView({
  id,
  initialTitle,
  initialContent,
  updatedAt,
}: {
  id: string;
  initialTitle: string;
  initialContent: unknown;
  updatedAt: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [state, setState] = useState<SaveState>("idle");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<unknown>(null);
  const inFlight = useRef(false);

  // 문서를 옮겨 다니면 초기값을 다시 잡는다.
  useEffect(() => {
    setTitle(initialTitle);
    setState("idle");
    pending.current = null;
  }, [id, initialTitle]);

  const flush = useCallback(async () => {
    if (pending.current === null || inFlight.current) return;
    const payload = pending.current;
    pending.current = null;
    inFlight.current = true;
    setState("saving");
    try {
      const result = await saveContentAction(id, payload);
      // 제목이 비어 있었으면 서버가 첫 줄로 채워 준다.
      if (result.title !== "" && title.trim() === "") setTitle(result.title);
      setState(pending.current === null ? "saved" : "dirty");
    } catch {
      setState("failed");
    } finally {
      inFlight.current = false;
      if (pending.current !== null) void flush();
    }
  }, [id, title]);

  const onContentChange = useCallback(
    (blocks: unknown) => {
      pending.current = blocks;
      setState("dirty");
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <article style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
      <header style={{ marginBottom: 26 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== initialTitle) void renameDocumentAction(id, title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={UNTITLED}
          aria-label="문서 제목"
          style={{
            display: "block",
            width: "100%",
            border: 0,
            background: "transparent",
            padding: 0,
            fontSize: 27,
            fontWeight: 600,
            letterSpacing: "-0.022em",
            lineHeight: 1.34,
            color: "var(--ink)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 14,
            fontSize: 12.5,
            color: "var(--ink-3)",
          }}
        >
          <span>{updatedAt}에 고침</span>
          <SaveBadge state={state} />
        </div>
      </header>

      <Editor initialContent={initialContent} onChange={onContentChange} />
    </article>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const label =
    state === "dirty" ? "고치는 중"
    : state === "saving" ? "저장 중"
    : state === "saved" ? "저장됨"
    : "저장 실패 — 다시 시도합니다";
  const dot =
    state === "saved" ? "dot dot-synced"
    : state === "failed" ? "dot dot-offline"
    : "dot dot-syncing";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className={dot} />
      <span style={{ color: state === "failed" ? "var(--ink-2)" : "var(--ink-3)" }}>{label}</span>
    </span>
  );
}
