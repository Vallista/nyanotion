import {
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  defaultBlockSpecs,
} from "@blocknote/core";

/**
 * 에디터의 블록 스키마. **브라우저와 collab 서버가 같은 것을 써야 한다.**
 *
 * collab 서버는 Yjs 문서를 블록 트리로 풀어 `content_json`·`text_plain` 을 만든다
 * (apps/collab/src/index.ts). 브라우저에만 있는 블록 종류가 생기면 서버가 그 노드를 모르고,
 * 변환이 깨지거나 내용이 조용히 사라진다. 그래서 종류 정의(이름·속성·내용 유무)는 여기 한 곳에 둔다.
 *
 * 화면에 **어떻게 그리는지**는 여기 있지 않다 —
 *   브라우저: apps/web/src/components/blocks/* 가 React 로 그린다
 *   서버: 아래 최소 구현이 빈 자리만 만든다 (서버는 그림을 그리지 않는다)
 */

/** 줄 안에 끼우는 데이터베이스. 표의 실체는 `collection` 이고 블록은 그 id 만 들고 있다. */
export const DATABASE_BLOCK_TYPE = "database";

export const databaseBlockConfig = createBlockConfig(
  () =>
    ({
      type: DATABASE_BLOCK_TYPE,
      propSchema: {
        /** collection.id. 빈 문자열이면 아직 표를 고르지 않은 블록이다. */
        collectionId: { default: "" as string },
        /** 'table' 만 쓴다. 나중에 보드·달력을 붙일 자리. */
        view: { default: "table" as string },
      },
      /** 블록 안에 글을 쓰지 않는다 — 표를 통째로 끼우는 자리다. */
      content: "none",
    }) as const,
);

/**
 * 서버용 구현. DOM 을 만들 일이 없지만 ProseMirror 노드를 세우려면 render 가 있어야 한다.
 * 비어 있는 div 하나면 충분하다 — 서버는 이 블록에서 글자를 뽑지 않는다.
 */
export const databaseBlockSpec = createBlockSpec(databaseBlockConfig, {
  render: () => {
    const dom = document.createElement("div");
    dom.setAttribute("data-database-block", "");
    return { dom };
  },
})();

/** collab 서버가 Yjs → 블록 변환에 쓰는 스키마. */
export const serverSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, [DATABASE_BLOCK_TYPE]: databaseBlockSpec },
});
