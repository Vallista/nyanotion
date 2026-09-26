"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";
// 반드시 위 두 줄 **다음**에. BlockNote 는 변수를 `.bn-root` 에 두므로 특이도가 같고,
// 같으면 나중에 로드된 쪽이 이긴다.
import "./styles.css";
import "katex/dist/katex.min.css";

import { BlockNoteView } from "@blocknote/ariakit";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { ko } from "@blocknote/core/locales";
import { withCollaboration } from "@blocknote/core/yjs";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  CALLOUT_BLOCK_TYPE,
  DATABASE_BLOCK_TYPE,
  EQUATION_BLOCK_TYPE,
  MENTION_TYPE,
} from "@nyanotion/editor-schema";
import { TASK_LABELS, blocksToPlainText, type AiTask } from "@nyanotion/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { NyanSuggestion, type NyanState } from "./ai/suggestion";
import { CatMark } from "./cat-mark";
import { CommentsPanel } from "./comments/panel";
import { PortsProvider } from "./context";
import { CalloutIcon, MathIcon, PageIcon, TableIcon } from "./icons";
import type { EditorPorts } from "./ports";
import { editorSchema } from "./schema";

/**
 * BlockNote 는 브라우저 DOM(ProseMirror) 위에서만 돈다 — 이 파일은 항상 클라이언트다.
 *
 * 편집의 원본은 이 브라우저의 **로컬 Y.Doc** 이다. IndexedDB 에 곧바로 남고, 연결이 살아 있을 때만
 * 서버로 흘러간다 — ARCHITECTURE.md §4.
 *
 * 서버가 어디 있는지, 권한이 어떤지는 **이 패키지가 모른다.** 전부 `ports` 로 들어온다 (ports.ts).
 */

/** 화면에 보여 줄 동기화 상태. 색이 아니라 점의 모양으로 구분한다 — 시안 09. */
export type SyncState =
  "opening" | "connecting" | "synced" | "offline" | "denied";

/** `@blocknote/server-util` 의 기본 fragment 이름과 같아야 한다. */
const FRAGMENT = "prosemirror";

/**
 * 한국어 기본 문구가 길어서 폰 폭(358px)에서 두 줄로 접힌다. 노션처럼 한 줄로 끝나게 줄인다.
 * 나머지 번역은 @blocknote/core 의 ko 를 그대로 쓴다.
 */
const dictionary = {
  ...ko,
  placeholders: {
    ...ko.placeholders,
    default: "글을 쓰거나 / 를 누르세요",
  },
};

export function NyanotionEditor({
  documentId,
  user,
  ports,
  onSyncStateChange,
  editable = true,
}: {
  documentId: string;
  user: { id: string; name: string; color: string };
  ports: EditorPorts;
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
      url: ports.collab.url(),
      name: documentId,
      document: ydoc,
      token: () => ports.collab.fetchTicket(documentId),
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
  }, [documentId, ydoc, onSyncStateChange, ports]);

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: editorSchema,
      dictionary,
      trailingBlock: true,
      collaboration: {
        fragment: ydoc.getXmlFragment(FRAGMENT),
        user: { name: user.name, color: user.color },
      },
      uploadFile: (file: File) => ports.files.upload(documentId, file),
    }),
    [ydoc, documentId, ports],
  );

  /* ------------------------------------------------------------- 냥이(AI) */

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
      const ai = ports.ai;
      if (ai === null) return;

      const picked = source ?? pickSource();
      if (picked.text.trim() === "") {
        setNyan({
          task,
          blockIds: [],
          text: "",
          status: "empty",
          source: picked,
        });
        return;
      }

      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setNyan({
        task,
        blockIds: picked.blockIds,
        text: "",
        status: "streaming",
        source: picked,
      });

      try {
        let text = "";
        for await (const chunk of ai.run({
          task,
          documentId,
          selection: picked.text,
          context:
            task === "continue"
              ? blocksToPlainText(editor.document)
              : undefined,
          signal: controller.signal,
        })) {
          if (chunk.busy !== undefined) {
            setNyan((prev) =>
              prev === null
                ? prev
                : {
                    ...prev,
                    status: chunk.busy!.kind === "gaming" ? "gaming" : "failed",
                    message: chunk.busy!.message,
                  },
            );
            return;
          }
          if (typeof chunk.text === "string") {
            text += chunk.text;
            setNyan((prev) => (prev === null ? prev : { ...prev, text }));
          }
        }
        setNyan((prev) =>
          prev === null ? prev : { ...prev, status: "ready" },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setNyan((prev) =>
          prev === null
            ? prev
            : { ...prev, status: "failed", message: "냥이를 부르지 못했어요." },
        );
      }
    },
    [documentId, editor, pickSource, ports.ai],
  );

  useEffect(() => () => abort.current?.abort(), []);

  /* -------------------------------------------------------- 슬래시 메뉴 항목 */

  /**
   * 지금 블록을 다른 블록으로 바꾸고, **그 아래에 쓸 줄을 만들어 준다.**
   *
   * 표·수식처럼 글을 못 쓰는 블록이 문서의 마지막이면 더 쓸 자리가 사라진다.
   * `trailingBlock` 이 이 경우를 잡아 주지 않아서 직접 만든다 — 노션도 늘 한 줄을 남겨 둔다.
   */
  const replaceCurrent = useCallback(
    (
      block: { type: string; props?: Record<string, string> },
      keepCursor = false,
    ) => {
      const current = editor.getTextCursorPosition().block;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 블록 종류가 스키마에 따라 달라진다
      const { insertedBlocks } = editor.replaceBlocks(
        [current],
        [block as any],
      );
      const made = insertedBlocks[0];
      if (made === undefined) return;

      const last = editor.document[editor.document.length - 1];
      if (last !== undefined && last.id === made.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [paragraph] = editor.insertBlocks(
          [{ type: "paragraph" } as any],
          made,
          "after",
        );
        // 수식처럼 제 입력칸을 여는 블록은 커서를 뺏으면 안 된다.
        if (paragraph !== undefined && !keepCursor)
          editor.setTextCursorPosition(paragraph, "start");
      }
    },
    [editor],
  );

  /**
   * 표를 하나 새로 만들고 지금 블록을 그 표로 바꾼다.
   * 표의 실체는 모음이고 블록은 id 만 들고 있다 — 노션과 같은 구조다.
   */
  const insertDatabase = useCallback(async () => {
    try {
      const collectionId = await ports.database.create(documentId, "표");
      replaceCurrent({
        type: DATABASE_BLOCK_TYPE,
        props: { collectionId, view: "table" },
      });
    } catch {
      // 표를 만들지 못하면 블록을 건드리지 않는다 — 빈 자리가 남는 것보다 낫다.
    }
  }, [documentId, ports.database, replaceCurrent]);

  const ownItems: DefaultReactSuggestionItem[] = useMemo(
    () => [
      {
        title: "데이터베이스",
        subtext: "표·보드·달력으로 정리하는 목록. 줄 하나가 문서가 됩니다",
        group: "기본 블록",
        aliases: [
          "db",
          "database",
          "표",
          "데이터베이스",
          "table",
          "보드",
          "달력",
        ],
        icon: <TableIcon size={18} />,
        onItemClick: () => void insertDatabase(),
      },
      {
        title: "콜아웃",
        subtext: "눈에 띄게 떼어 두는 한 문단",
        group: "기본 블록",
        aliases: ["callout", "콜아웃", "강조", "노트", "주의"],
        icon: <CalloutIcon size={18} />,
        onItemClick: () =>
          replaceCurrent({ type: CALLOUT_BLOCK_TYPE, props: { tone: "note" } }),
      },
      {
        title: "수식",
        subtext: "LaTeX 로 쓰는 수식",
        group: "기본 블록",
        aliases: ["math", "equation", "수식", "latex", "tex"],
        icon: <MathIcon size={18} />,
        onItemClick: () =>
          replaceCurrent(
            { type: EQUATION_BLOCK_TYPE, props: { latex: "" } },
            true,
          ),
      },
    ],
    [insertDatabase, replaceCurrent],
  );

  const aiItems: DefaultReactSuggestionItem[] = useMemo(
    () =>
      ports.ai === null
        ? []
        : (Object.keys(TASK_LABELS) as AiTask[]).map((task) => ({
            title: `냥이 — ${TASK_LABELS[task]}`,
            subtext: "고른 글을 냥이가 손봅니다",
            group: "냥이",
            aliases: ["ai", "nyan", "냥이", TASK_LABELS[task]],
            icon: <CatMark size={16} color="currentColor" />,
            onItemClick: () => void run(task),
          })),
    [run, ports.ai],
  );

  /* ------------------------------------------------------------- @ 멘션 */

  const mentionItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      let found: Awaited<ReturnType<typeof ports.mentions.search>>;
      try {
        found = await ports.mentions.search(query);
      } catch {
        return [];
      }
      // 제안 메뉴는 **제목으로 항목을 구분한다** — 같은 제목이 둘이면 React key 가 겹친다.
      // 경로를 붙여 갈라 주고, 그래도 같으면 번호를 붙인다.
      const seen = new Map<string, number>();
      return found.map((doc) => {
        const base = doc.title.trim() === "" ? "제목 없음" : doc.title;
        const count = (seen.get(base) ?? 0) + 1;
        seen.set(base, count);
        const title =
          count === 1
            ? base
            : doc.breadcrumb !== undefined && doc.breadcrumb !== ""
              ? `${base} — ${doc.breadcrumb}`
              : `${base} (${count})`;

        return {
          title,
          subtext: doc.breadcrumb,
          icon: <PageIcon size={16} />,
          onItemClick: () => {
            editor.insertInlineContent([
              {
                type: MENTION_TYPE,
                props: { documentId: doc.id, title: doc.title },
              },
              // 멘션 뒤에 공백 하나 — 바로 이어 쓸 수 있게.
              " ",
            ]);
          },
        };
      });
    },
    [editor, ports.mentions],
  );

  /* --------------------------------------------------------------- 화면 */

  // IndexedDB 를 읽기 전에 그리면 빈 문서가 잠깐 보이고, 그 빈 상태가 서버로 갈 수 있다.
  if (!localReady) {
    return (
      <p style={{ fontSize: 14, color: "var(--ink-4)", padding: "4px 2px" }}>
        문서를 여는 중…
      </p>
    );
  }

  return (
    <PortsProvider ports={ports}>
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
                ? [
                    ...insertIntoGroup(
                      getDefaultReactSlashMenuItems(editor),
                      ownItems,
                    ),
                    ...aiItems,
                  ]
                : getDefaultReactSlashMenuItems(editor),
              query,
            )
          }
        />
        {editable && (
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={mentionItems}
          />
        )}
      </BlockNoteView>

      {ports.comments !== null && (
        <CommentsPanel
          documentId={documentId}
          editor={editor}
          userId={user.id}
        />
      )}

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
              .map((id: string) => editor.getBlock(id))
              .filter(
                (block): block is NonNullable<typeof block> =>
                  block !== undefined,
              );
            if (blocks[0] === undefined) return;
            editor.replaceBlocks(blocks, toBlocks(nyan.text));
            setNyan(null);
          }}
          onAppend={() => {
            const last = nyan.blockIds[nyan.blockIds.length - 1];
            const anchor =
              last === undefined ? undefined : editor.getBlock(last);
            if (anchor === undefined) return;
            editor.insertBlocks(toBlocks(nyan.text), anchor, "after");
            setNyan(null);
          }}
        />
      )}
    </PortsProvider>
  );
}

/**
 * 항목을 **같은 그룹끼리 붙여** 놓는다.
 *
 * 제안 메뉴는 앞 항목과 그룹이 달라질 때마다 소제목을 새로 그린다. 그래서 기존 "기본 블록"
 * 무리 뒤에 다른 그룹이 끼고 나서 다시 "기본 블록" 항목을 붙이면 소제목이 두 번 나온다.
 */
function insertIntoGroup(
  items: DefaultReactSuggestionItem[],
  extra: DefaultReactSuggestionItem[],
): DefaultReactSuggestionItem[] {
  let result = items;
  for (const item of extra) {
    let last = -1;
    for (let i = 0; i < result.length; i += 1)
      if (result[i]?.group === item.group) last = i;
    result =
      last < 0
        ? [...result, item]
        : [...result.slice(0, last + 1), item, ...result.slice(last + 1)];
  }
  return result;
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
