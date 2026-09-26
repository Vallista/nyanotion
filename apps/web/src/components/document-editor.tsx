"use client";

import {
  NyanotionEditor,
  type CommentThread,
  type CommentsLoad,
  type DatabaseView,
  type DocumentRef,
  type EditorPorts,
  type SyncState,
} from "@nyanotion/editor";
import type { AiTask } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  addPropertyAction,
  addRowAction,
  createInlineDatabaseAction,
  deletePropertyAction,
  moveRowAction,
  removeRowAction,
  setSelectValueAction,
  setValueAction,
  updateCollectionAction,
  updatePropertyAction,
} from "@/lib/actions";

/**
 * 에디터 패키지에 **이 앱의 서버**를 꽂는 자리.
 *
 * `@nyanotion/editor` 는 서버를 모른다 — 어디에 저장하고 누가 볼 수 있는지는 전부 여기서 준다.
 * 그래서 서버 액션·fetch·Next 의존은 이 파일에서 끝나야 한다. 패키지 안으로 새면 분리한 뜻이 없다.
 */

/**
 * 동기화 서버 주소.
 *
 * 집 서버는 한 대인데 주소가 여럿이다 — localhost, 집 랜 IP, Tailscale IP, 터널 도메인.
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

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`요청이 실패했습니다 (${response.status})`);
  return (await response.json()) as T;
}

/**
 * 포트 한 벌을 만든다. 문서 화면과 모음 화면이 **같은 것**을 쓴다 —
 * 표는 두 곳에서 같은 동작을 해야 하기 때문이다.
 *
 * `documentId` 와 `userId` 는 문서 화면에서만 있다. 없으면 댓글 포트를 null 로 둔다 —
 * 댓글은 문서에 달리는 것이라 모음 화면에는 붙을 자리가 없다.
 */
export function useEditorPorts(options: { documentId?: string; userId?: string } = {}): EditorPorts {
  const router = useRouter();
  const { documentId, userId } = options;

  return useMemo<EditorPorts>(
    () => ({
      Link,
      hrefForDocument: (id) => `/d/${id}`,
      hrefForCollection: (id) => `/c/${id}`,
      onDataChanged: () => router.refresh(),

      collab: {
        url: collabUrl,
        fetchTicket: async (id) => {
          const body = await json<{ ticket: string }>(
            await fetch(`/api/collab/ticket?doc=${encodeURIComponent(id)}`, { cache: "no-store" }),
          );
          return body.ticket;
        },
      },

      files: {
        upload: async (docId, file) => {
          const form = new FormData();
          form.append("documentId", docId);
          form.append("file", file);
          const response = await fetch("/api/upload", { method: "POST", body: form });
          if (!response.ok) {
            const problem: unknown = await response.json().catch(() => ({}));
            const message = (problem as { error?: unknown }).error;
            throw new Error(
              typeof message === "string" ? message : `올리지 못했습니다 (${response.status})`,
            );
          }
          const body = (await response.json()) as { url?: unknown };
          if (typeof body.url !== "string") throw new Error("서버가 준 주소가 이상합니다");
          return body.url;
        },
      },

      database: {
        load: async (collectionId) => {
          const response = await fetch(`/api/collection/${encodeURIComponent(collectionId)}`, {
            cache: "no-store",
          });
          if (response.status === 404) return null;
          return json<DatabaseView>(response);
        },
        create: async (docId, name) => (await createInlineDatabaseAction(docId, name)).collectionId,
        setView: async (collectionId, view) =>
          void (await updateCollectionAction(collectionId, { view })),
        addRow: async (collectionId, title) => void (await addRowAction(collectionId, title)),
        removeRow: removeRowAction,
        moveRow: moveRowAction,
        setValue: setValueAction,
        setSelectValue: setSelectValueAction,
        addProperty: addPropertyAction,
        updateProperty: updatePropertyAction,
        deleteProperty: deletePropertyAction,
      },

      mentions: {
        search: async (query) => {
          const body = await json<{ documents: DocumentRef[] }>(
            await fetch(`/api/mentions?q=${encodeURIComponent(query)}`, { cache: "no-store" }),
          );
          return body.documents;
        },
      },

      ai: { run: (input) => streamAi(input) },

      comments:
        documentId === undefined || userId === undefined
          ? null
          : {
              load: async (docId) =>
                json<CommentsLoad>(
                  await fetch(`/api/comments?doc=${encodeURIComponent(docId)}`, {
                    cache: "no-store",
                  }),
                ),
              start: async (docId, blockId, body) => {
                const made = await json<{ thread: CommentThread }>(
                  await post({ op: "start", documentId: docId, blockId, body }),
                );
                return made.thread;
              },
              reply: async (threadId, body) => {
                const made = await json<{ comment: { id: string; createdAt: string } }>(
                  await post({ op: "reply", threadId, body }),
                );
                return {
                  id: made.comment.id,
                  body,
                  authorId: userId,
                  createdAt: made.comment.createdAt,
                  updatedAt: null,
                };
              },
              edit: async (commentId, body) =>
                void (await json(await post({ op: "edit", commentId, body }))),
              remove: async (commentId) =>
                void (await json(await post({ op: "remove", commentId }))),
              setResolved: async (threadId, resolved) =>
                void (await json(await post({ op: "resolve", threadId, resolved }))),
            },
    }),
    [router, documentId, userId],
  );
}

export function DocumentEditor({
  documentId,
  user,
  onSyncStateChange,
  editable,
}: {
  documentId: string;
  user: { id: string; name: string; color: string };
  onSyncStateChange?: (state: SyncState) => void;
  editable: boolean;
}) {
  const ports = useEditorPorts({ documentId, userId: user.id });

  return (
    <NyanotionEditor
      documentId={documentId}
      user={user}
      ports={ports}
      editable={editable}
      onSyncStateChange={onSyncStateChange}
    />
  );
}

function post(body: unknown): Promise<Response> {
  return fetch("/api/comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** `/api/ai/complete` 의 SSE 를 조각으로 풀어 준다. 프로토콜을 아는 곳은 여기 하나다. */
async function* streamAi(input: {
  task: AiTask;
  documentId: string;
  selection: string;
  context?: string;
  signal: AbortSignal;
}): AsyncGenerator<{ text?: string; busy?: { kind: "gaming" | "unreachable"; message?: string } }> {
  const response = await fetch("/api/ai/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      task: input.task,
      documentId: input.documentId,
      selection: input.selection,
      context: input.context,
    }),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`냥이를 부르지 못했습니다 (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const lines = frame.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "chunk";
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (dataLine === undefined) continue;

      let payload: unknown;
      try {
        payload = JSON.parse(dataLine.slice(5).trim());
      } catch {
        continue;
      }

      if (event === "chunk") {
        const piece = (payload as { text?: unknown }).text;
        if (typeof piece === "string") yield { text: piece };
      } else if (event === "busy") {
        const info = payload as { kind?: unknown; message?: unknown };
        yield {
          busy: {
            kind: info.kind === "gaming" ? "gaming" : "unreachable",
            message: typeof info.message === "string" ? info.message : undefined,
          },
        };
        return;
      } else if (event === "done") {
        return;
      }
    }
  }
}
