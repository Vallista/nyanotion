import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import {
  CALLOUT_BLOCK_TYPE,
  DATABASE_BLOCK_TYPE,
  EQUATION_BLOCK_TYPE,
  MENTION_TYPE,
} from "@nyanotion/editor-schema";
import { calloutReactSpec } from "./blocks/callout";
import { databaseReactSpec } from "./blocks/database";
import { equationReactSpec } from "./blocks/equation";
import { mentionReactSpec } from "./inline/mention";

/**
 * 브라우저에서 쓰는 스키마. 종류는 `@nyanotion/editor-schema` 와 **똑같아야 한다** —
 * 거기가 collab 서버와 공유하는 원본이고, 여기는 그리는 방법만 더한 것이다.
 */
export const editorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    [DATABASE_BLOCK_TYPE]: databaseReactSpec,
    [CALLOUT_BLOCK_TYPE]: calloutReactSpec,
    [EQUATION_BLOCK_TYPE]: equationReactSpec,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [MENTION_TYPE]: mentionReactSpec,
  },
});

export type NyanotionEditorInstance = typeof editorSchema.BlockNoteEditor;
