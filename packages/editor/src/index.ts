/**
 * `@nyanotion/editor` — 문서 편집 화면 한 벌.
 *
 * 이 패키지는 **서버를 모른다.** 어디에 저장하고 누가 볼 수 있는지는 전부 `EditorPorts` 로
 * 들어온다 (`ports.ts`). 그래서 Next 앱 말고 다른 껍데기에 얹어도 그대로 돈다.
 *
 * 쓰는 쪽:
 *   import { NyanotionEditor } from "@nyanotion/editor";
 *   import "@nyanotion/editor/styles.css";   // 번들러가 CSS 를 따로 다룰 때만
 */
export { NyanotionEditor, type SyncState } from "./editor";
export { editorSchema } from "./schema";
export { InlineDatabase } from "./database/inline-database";
export { DatabaseTable } from "./database/table";
export { DatabaseBoard } from "./database/board";
export { DatabaseCalendar } from "./database/calendar";
export { PortsProvider, usePorts, displayTitle, UNTITLED } from "./context";
export {
  DATABASE_VIEWS,
  PROPERTY_TYPES,
  type AiPort,
  type CollabPort,
  type Column,
  type CommentAuthor,
  type CommentItem,
  type CommentThread,
  type CommentsLoad,
  type CommentsPort,
  type DatabasePort,
  type DatabaseView,
  type DatabaseViewKind,
  type DocumentRef,
  type EditorPorts,
  type FilePort,
  type LinkComponent,
  type MentionPort,
  type PropertyType,
  type Row,
} from "./ports";
