"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { ko } from "@blocknote/core/locales";
import { withCollaboration } from "@blocknote/core/yjs";
import { useCreateBlockNote } from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useMemo, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

/**
 * BlockNote 는 브라우저 DOM(ProseMirror) 위에서만 돈다 — 이 파일은 항상 클라이언트다.
 *
 * 편집의 원본은 이 브라우저의 **로컬 Y.Doc** 이다. IndexedDB 에 곧바로 남고, 연결이 살아 있을 때만
 * 서버로 흘러간다. 그래서 집 서버가 꺼져 있어도 글이 써지고, 서버가 돌아오면 CRDT 가 합친다
 * — ARCHITECTURE.md §4.
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
 * 그래서 기본값은 **지금 이 페이지를 연 주소**에서 만든다. 폰에서 IP 로 열면 그 IP 로 붙는다.
 * 터널처럼 경로가 달라지는 경우에만 NEXT_PUBLIC_COLLAB_URL 로 못 박는다.
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
}: {
  documentId: string;
  user: { name: string; color: string };
  onSyncStateChange?: (state: SyncState) => void;
}) {
  // 문서마다 새 Y.Doc. DocumentView 가 key={id} 로 갈아끼운다.
  const ydoc = useMemo(() => new Y.Doc(), [documentId]);
  const [localReady, setLocalReady] = useState(false);

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
    // 저장소가 막혀 있어도(시크릿 창 등) 메모리에만 두고 계속 간다.
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

  // initialContent 를 주지 않는다 — 내용은 Y.Doc 에서 온다 (둘 다 주면 BlockNote 가 던진다).
  const editor = useCreateBlockNote(
    withCollaboration({
      dictionary: ko,
      trailingBlock: true,
      collaboration: { fragment: ydoc.getXmlFragment(FRAGMENT), user },
    }),
    [ydoc],
  );

  // IndexedDB 를 읽기 전에 그리면 빈 문서가 잠깐 보이고, 그 빈 상태가 서버로 갈 수 있다.
  if (!localReady) {
    return (
      <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "4px 2px" }}>문서를 여는 중…</p>
    );
  }

  return <BlockNoteView editor={editor} theme="light" className="nyan-editor" />;
}
