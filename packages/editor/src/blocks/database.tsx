"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { databaseBlockConfig } from "@nyanotion/editor-schema";
import { InlineDatabase } from "../database/inline-database";

/**
 * `database` 블록의 **그림**. 종류 정의(이름·속성)는 `@nyanotion/editor-schema` 에 있고
 * collab 서버도 같은 것을 쓴다 — 한쪽만 알면 변환에서 내용이 사라진다.
 *
 * 블록이 들고 있는 것은 `collectionId` 뿐이다. 보는 방식(표·보드·달력)은 **표 쪽에** 저장한다 —
 * 블록 속성으로 두면 뷰를 바꿀 때마다 문서에 트랜잭션이 생기고, 그 바람에 제안 메뉴가
 * `/` 를 먹는 버그가 났다. `view` 속성은 옛 문서 호환으로 스키마에만 남겨 둔다.
 */
export const databaseReactSpec = createReactBlockSpec(databaseBlockConfig, {
  render: ({ block, editor }) => (
    <InlineDatabase collectionId={block.props.collectionId} editable={editor.isEditable} />
  ),
})();
