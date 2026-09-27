"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { renameDocumentAction } from "@/lib/actions";
import { UNTITLED } from "@/lib/tree";
import { DocumentTags } from "./document-tags";
import { SuggestionBar } from "./suggestion-bar";
import type { SyncState } from "@nyanotion/editor";

// BlockNote 와 Yjs 는 DOM 에 의존하므로 서버에서 렌더하지 않는다.
const Editor = dynamic(() => import("./document-editor").then((m) => m.DocumentEditor), {
  ssr: false,
  loading: () => (
    <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "4px 2px" }}>에디터를 불러오는 중…</p>
  ),
});

export function DocumentView({
  id,
  initialTitle,
  updatedAt,
  user,
  tags,
  tagSuggestions,
  canWrite,
  suggestion,
}: {
  id: string;
  initialTitle: string;
  updatedAt: string;
  user: { id: string; name: string; color: string };
  tags: { id: string; name: string; color: string | null }[];
  tagSuggestions: { id: string; name: string }[];
  /** 읽기 전용으로 받은 문서면 false — 제목·태그·본문이 전부 잠긴다. */
  canWrite: boolean;
  /** 냥이가 낸 제목·태그 제안. **누르기 전까지 문서는 안 바뀐다.** */
  suggestion: { title: string; tags: string[] } | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [sync, setSync] = useState<SyncState>("opening");

  // Editor 가 useEffect 의존성으로 들고 있으므로 안정적이어야 한다.
  const onSyncStateChange = useCallback((state: SyncState) => setSync(state), []);

  return (
    <article style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
      {suggestion !== null && (
        <SuggestionBar documentId={id} title={suggestion.title} tags={suggestion.tags} />
      )}

      <header style={{ marginBottom: 26 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          readOnly={!canWrite}
          onBlur={() => {
            if (canWrite && title !== initialTitle) void renameDocumentAction(id, title);
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
            flexWrap: "wrap",
            fontSize: 12.5,
            color: "var(--ink-3)",
          }}
        >
          <DocumentTags
            documentId={id}
            tags={tags}
            suggestions={tagSuggestions}
            canWrite={canWrite}
          />
          <span>{updatedAt}에 고침</span>
          <SyncBadge state={sync} />
        </div>
      </header>

      {/* 본문 저장은 Yjs 가 한다 — 여기서 따로 저장하지 않는다. */}
      <Editor
        documentId={id}
        user={user}
        onSyncStateChange={onSyncStateChange}
        editable={canWrite}
      />
    </article>
  );
}

/** 상태는 색이 아니라 점의 모양으로 구분한다 — 시안 09. */
function SyncBadge({ state }: { state: SyncState }) {
  if (state === "opening") return null;

  const { dot, label, strong } = describe(state);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={label}>
      <span className={dot} />
      <span style={{ color: strong ? "var(--ink-2)" : "var(--ink-3)" }}>{label}</span>
    </span>
  );
}

function describe(state: Exclude<SyncState, "opening">): {
  dot: string;
  label: string;
  strong: boolean;
} {
  switch (state) {
    case "synced":
      return { dot: "dot dot-synced", label: "동기화됨", strong: false };
    case "connecting":
      return { dot: "dot dot-syncing", label: "맞추는 중", strong: false };
    case "offline":
      return { dot: "dot dot-offline", label: "이 기기에 저장 중", strong: false };
    case "denied":
      return { dot: "dot dot-offline", label: "서버가 이 문서를 거절했습니다", strong: true };
  }
}
