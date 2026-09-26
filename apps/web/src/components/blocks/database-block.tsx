"use client";

import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { DATABASE_BLOCK_TYPE, databaseBlockConfig } from "@nyanotion/editor-schema";
import { InlineDatabase } from "../inline-database";

/**
 * `database` 블록의 **그림**. 종류 정의(이름·속성)는 `@nyanotion/editor-schema` 에 있고
 * collab 서버도 같은 것을 쓴다 — 한쪽만 알면 변환에서 내용이 사라진다.
 */
export const databaseReactSpec = createReactBlockSpec(databaseBlockConfig, {
  render: ({ block, editor }) => (
    <InlineDatabase collectionId={block.props.collectionId} editable={editor.isEditable} />
  ),
})();

/** 브라우저에서 쓰는 스키마. 기본 블록에 `database` 하나를 더한 것. */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, [DATABASE_BLOCK_TYPE]: databaseReactSpec },
});
