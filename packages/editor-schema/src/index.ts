import {
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";

/**
 * 에디터의 스키마. **브라우저와 collab 서버가 같은 것을 써야 한다.**
 *
 * collab 서버는 Yjs 문서를 블록 트리로 풀어 `content_json`·`text_plain` 을 만든다
 * (apps/collab/src/index.ts). 브라우저에만 있는 종류가 생기면 서버가 그 노드를 모르고,
 * 변환이 깨지거나 내용이 조용히 사라진다. 그래서 종류 정의(이름·속성·내용 유무)는 여기 한 곳에 둔다.
 *
 * 화면에 **어떻게 그리는지**는 여기 있지 않다 —
 *   브라우저: `packages/editor` 가 React 로 그린다
 *   서버: 아래 최소 구현이 빈 자리만 만든다 (서버는 그림을 그리지 않는다)
 *
 * **속성을 지우거나 이름을 바꾸면 이미 저장된 문서가 깨진다.** 더하는 것만 안전하다.
 */

/* ------------------------------------------------------------ 데이터베이스 */

/** 줄 안에 끼우는 데이터베이스. 표의 실체는 `collection` 이고 블록은 그 id 만 들고 있다. */
export const DATABASE_BLOCK_TYPE = "database";

export const databaseBlockConfig = createBlockConfig(
  () =>
    ({
      type: DATABASE_BLOCK_TYPE,
      propSchema: {
        /** collection.id. 빈 문자열이면 아직 표를 고르지 않은 블록이다. */
        collectionId: { default: "" as string },
        /** 'table' | 'board' | 'calendar' — 보는 방식만 다르고 데이터는 한 벌이다. */
        view: { default: "table" as string },
      },
      /** 블록 안에 글을 쓰지 않는다 — 표를 통째로 끼우는 자리다. */
      content: "none",
    }) as const,
);

/* ------------------------------------------------------------------ 콜아웃 */

export const CALLOUT_BLOCK_TYPE = "callout";

/** 콜아웃의 결. 색이 아니라 **뜻**으로 고른다 — 색만 다르면 나중에 구분이 안 된다. */
export const CALLOUT_TONES = ["note", "tip", "warn"] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const calloutBlockConfig = createBlockConfig(
  () =>
    ({
      type: CALLOUT_BLOCK_TYPE,
      propSchema: {
        tone: { default: "note" as string },
        /** 앞에 붙는 그림글자. 비우면 결에 맞는 기본값을 쓴다. */
        emoji: { default: "" as string },
      },
      content: "inline",
    }) as const,
);

/* ------------------------------------------------------------------- 수식 */

export const EQUATION_BLOCK_TYPE = "equation";

export const equationBlockConfig = createBlockConfig(
  () =>
    ({
      type: EQUATION_BLOCK_TYPE,
      propSchema: {
        /** LaTeX 원본. 렌더는 브라우저에서 KaTeX 가 한다. */
        latex: { default: "" as string },
      },
      content: "none",
    }) as const,
);

/* ------------------------------------------------------------------- 멘션 */

/**
 * 다른 문서를 본문 안에서 가리킨다 (`@`).
 *
 * **제목을 함께 저장한다.** 링크만 두면 문서 제목이 바뀔 때마다 본문을 고쳐야 하고,
 * 볼 수 없는 문서를 가리킬 때 빈 칸이 된다. 저장해 둔 제목은 그 시점의 이름이고,
 * 화면은 열 수 있으면 최신 제목으로 덮어 그린다.
 */
export const MENTION_TYPE = "mention";

export const mentionInlineConfig = {
  type: MENTION_TYPE,
  propSchema: {
    documentId: { default: "" as string },
    title: { default: "" as string },
  },
  content: "none",
} as const;

/* --------------------------------------------------------------- 서버 구현 */

/** 서버에서는 DOM 을 만들 일이 없지만 노드를 세우려면 render 가 있어야 한다. */
function emptyDiv(mark: string) {
  return () => {
    const dom = document.createElement("div");
    dom.setAttribute(mark, "");
    return { dom };
  };
}

export const databaseBlockSpec = createBlockSpec(databaseBlockConfig, {
  render: emptyDiv("data-database-block"),
})();

export const calloutBlockSpec = createBlockSpec(calloutBlockConfig, {
  render: () => {
    const dom = document.createElement("div");
    dom.setAttribute("data-callout-block", "");
    const contentDOM = document.createElement("div");
    dom.appendChild(contentDOM);
    return { dom, contentDOM };
  },
})();

export const equationBlockSpec = createBlockSpec(equationBlockConfig, {
  render: emptyDiv("data-equation-block"),
})();

export const mentionInlineSpec = createInlineContentSpec(mentionInlineConfig, {
  render: (inlineContent) => {
    const dom = document.createElement("span");
    dom.setAttribute("data-mention", "");
    // 서버가 text_plain 을 만들 때 제목이 글자로 잡히도록 넣어 둔다.
    dom.textContent = `@${inlineContent.props.title}`;
    return { dom };
  },
});

/** collab 서버가 Yjs → 블록 변환에 쓰는 스키마. */
export const serverSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    [DATABASE_BLOCK_TYPE]: databaseBlockSpec,
    [CALLOUT_BLOCK_TYPE]: calloutBlockSpec,
    [EQUATION_BLOCK_TYPE]: equationBlockSpec,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [MENTION_TYPE]: mentionInlineSpec,
  },
});
