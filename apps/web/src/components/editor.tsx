"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { ko } from "@blocknote/core/locales";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { withCollaboration } from "@blocknote/core/yjs";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { TASK_LABELS, blocksToPlainText, type AiTask } from "@nyanotion/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { CatMark } from "./cat-mark";
import { NyanSuggestion, type NyanState } from "./nyan-suggestion";

/**
 * BlockNote 는 브라우저 DOM(ProseMirror) 위에서만 돈다 — 이 파일은 항상 클라이언트다.
 *
 * 편집의 원본은 이 브라우저의 **로컬 Y.Doc** 이다. IndexedDB 에 곧바로 남고, 연결이 살아 있을 때만
 * 서버로 흘러간다 — ARCHITECTURE.md §4.
 *
 * Ariakit 판 BlockNoteView 는 theme 을 "light" | "dark" 만 받는다. 색은 globals.css 의 `--bn-*`
 * 변수로 맞춘다 (메뉴·툴팁이 portal 로 나가므로 :root 에 둔다). 여기서 색을 새로 만들지 말 것.
 */

/** 화면에 보여 줄 동기화 상태. 색이 아니라 점의 모양으로 구분한다 — 시안 09. */
export type SyncState = "opening" | "connecting" | "synced" | "offline" | "denied";

/** @blocknote/server-util 의 기본 fragment 이름과 같아야 한다. */
const FRAGMENT = "prosemirror";

/**
 * 동기화 서버 주소.
 *
 * 집 서버는 한 대인데 주소가 여럿이다 — localhost, 집 랜 IP, Tailscale IP, 나중엔 터널 도메인.
 * 그래서 기본값은 **지금 이 페이지를 연 주소**에서 만든다. 터널처럼 경로가 달라지는 경우에만
 * NEXT_PUBLIC_COLLAB_URL 로 못 박는다.
 */
function collabUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_COLLAB_URL;
  if (explicit !== undefined && explicit !== "") return explicit;
  const port = process.env.NEXT_PUBLIC_COLLAB_PORT ?? "1234";
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.hostname}:${port}`;
}

async function fetchTicket(documentId: string): Promise<string> {
  const response = await fetch(`/api/collab/ticket?doc=${encodeURIComponent(documentId)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`표를 받지 못했습니다 (${response.status})`);
  const body: unknown = await response.json();
  const ticket = (body as { ticket?: unknown }).ticket;
  if (typeof ticket !== "string") throw new Error("표 모양이 이상합니다");
  return ticket;
}

export function Editor({
  documentId,
  user,
  onSyncStateChange,
  editable = true,
}: {
  documentId: string;
  user: { name: string; color: string };
  onSyncStateChange?: (state: SyncState) => void;
  editable?: boolean;
}) {
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [localReady, setLocalReady] = useState(false);
  const [nyan, setNyan] = useState<NyanState | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const notify = (state: SyncState) => {
      if (alive) onSyncStateChange?.(state);
    };

    // 1) 로컬 저장소를 먼저 붙인다 — 서버가 없어도 여기까지는 된다.
    const local = new IndexeddbPersistence(`nyanotion:${documentId}`, ydoc);
    const localDone = () => {
      if (!alive) return;
      setLocalReady(true);
      notify("connecting");
    };
    local.whenSynced.then(localDone).catch(localDone);

    // 2) 그다음 서버. 표는 붙을 때마다 새로 받는다 — 수명이 짧다.
    const provider = new HocuspocusProvider({
      url: collabUrl(),
      name: documentId,
      document: ydoc,
      token: () => fetchTicket(documentId),
      onStatus: ({ status }) => {
        if (status === "connected") notify("synced");
        else if (status === "connecting") notify("connecting");
        else notify("offline");
      },
      onSynced: () => notify("synced"),
      onDisconnect: () => notify("offline"),
      onAuthenticationFailed: () => notify("denied"),
    });

    return () => {
      alive = false;
      provider.destroy();
      void local.destroy();
    };
  }, [documentId, ydoc, onSyncStateChange]);

  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: ko,
      trailingBlock: true,
      collaboration: { fragment: ydoc.getXmlFragment(FRAGMENT), user },
    }),
    [ydoc],
  );

  /** 지금 글감으로 쓸 것: 선택한 블록들, 없으면 커서가 있는 블록. */
  const pickSource = useCallback(() => {
    const selection = editor.getSelection();
    const blocks =
      selection !== undefined && selection.blocks.length > 0
        ? selection.blocks
        : [editor.getTextCursorPosition().block];
    return {
      blockIds: blocks.map((block) => block.id),
      text: blocksToPlainText(blocks),
    };
  }, [editor]);

  const run = useCallback(
    async (task: AiTask, source?: { blockIds: string[]; text: string }) => {
      const picked = source ?? pickSource();
      if (picked.text.trim() === "") {
        setNyan({ task, blockIds: [], text: "", status: "empty", source: picked });
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setNyan({ task, blockIds: picked.blockIds, text: "", status: "streaming", source: picked });

      try {
        const response = await fetch("/api/ai/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            task,
            documentId,
            selection: picked.text,
            context: task === "continue" ? blocksToPlainText(editor.document) : undefined,
          }),
        });

        if (!response.ok || response.body === null) {
          setNyan((prev) =>
            prev === null ? prev : { ...prev, status: "failed", message: "냥이를 부르지 못했어요." },
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");

            const eventLine = frame.split("\n").find((line) => line.startsWith("event:"));
            const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
            if (dataLine === undefined) continue;
            const event = eventLine?.slice(6).trim() ?? "chunk";
            let payload: unknown;
            try {
              payload = JSON.parse(dataLine.slice(5).trim());
            } catch {
              continue;
            }

            if (event === "chunk") {
              const piece = (payload as { text?: unknown }).text;
              if (typeof piece === "string") {
                text += piece;
                setNyan((prev) => (prev === null ? prev : { ...prev, text }));
              }
            } else if (event === "busy") {
              const info = payload as { kind?: unknown; message?: unknown };
              setNyan((prev) =>
                prev === null
                  ? prev
                  : {
                      ...prev,
                      status: info.kind === "gaming" ? "gaming" : "failed",
                      message: typeof info.message === "string" ? info.message : undefined,
                    },
              );
              return;
            } else if (event === "done") {
              setNyan((prev) => (prev === null ? prev : { ...prev, status: "ready" }));
              return;
            }
          }
        }
        setNyan((prev) => (prev === null ? prev : { ...prev, status: "ready" }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNyan((prev) =>
          prev === null ? prev : { ...prev, status: "failed", message: "냥이를 부르지 못했어요." },
        );
      }
    },
    [documentId, editor, pickSource],
  );

  useEffect(() => () => abort.current?.abort(), []);

  const aiItems: DefaultReactSuggestionItem[] = useMemo(
    () =>
      (Object.keys(TASK_LABELS) as AiTask[]).map((task) => ({
        title: `냥이 — ${TASK_LABELS[task]}`,
        subtext: "고른 글을 냥이가 손봅니다",
        group: "냥이",
        aliases: ["ai", "nyan", "냥이", TASK_LABELS[task]],
        icon: <CatMark size={16} color="currentColor" />,
        onItemClick: () => void run(task),
      })),
    [run],
  );

  // IndexedDB 를 읽기 전에 그리면 빈 문서가 잠깐 보이고, 그 빈 상태가 서버로 갈 수 있다.
  if (!localReady) {
    return (
      <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "4px 2px" }}>문서를 여는 중…</p>
    );
  }

  return (
    <>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        className="nyan-editor"
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              editable
                ? [...getDefaultReactSlashMenuItems(editor), ...aiItems]
                : getDefaultReactSlashMenuItems(editor),
              query,
            )
          }
        />
      </BlockNoteView>

      {nyan !== null && (
        <NyanSuggestion
          state={nyan}
          onRetry={() => void run(nyan.task, nyan.source)}
          onDismiss={() => {
            abort.current?.abort();
            setNyan(null);
          }}
          onReplace={() => {
            const blocks = nyan.blockIds
              .map((id) => editor.getBlock(id))
              .filter((block): block is NonNullable<typeof block> => block !== undefined);
            const first = blocks[0];
            if (first === undefined) return;
            editor.replaceBlocks(blocks, toBlocks(nyan.text));
            setNyan(null);
          }}
          onAppend={() => {
            const last = nyan.blockIds[nyan.blockIds.length - 1];
            const anchor = last === undefined ? undefined : editor.getBlock(last);
            if (anchor === undefined) return;
            editor.insertBlocks(toBlocks(nyan.text), anchor, "after");
            setNyan(null);
          }}
        />
      )}
    </>
  );
}

/** 냥이가 준 글을 단락 블록들로. 표 같은 건 만들지 않는다 — 글자만 돌려준다. */
function toBlocks(text: string): { type: "paragraph"; content: string }[] {
  const lines = text
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) return [{ type: "paragraph", content: "" }];
  return lines.map((line) => ({ type: "paragraph" as const, content: line }));
}
