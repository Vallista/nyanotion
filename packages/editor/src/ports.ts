import type { ComponentType, ReactNode } from "react";
import type { AiTask } from "@nyanotion/shared";

/**
 * 호스트가 채워 주는 구멍.
 *
 * 이 패키지는 **화면만** 안다. 서버가 어디 있는지, 권한을 어떻게 보는지, 저장이 어떻게 되는지는
 * 전부 호스트(지금은 `apps/web`)가 준다. 그래서 이 파일에 Next.js·DB·서버 액션이 들어오면 안 된다 —
 * 들어오는 순간 패키지가 그 앱에 묶이고, 분리한 뜻이 없어진다.
 *
 * 규칙:
 *   - 여기 있는 함수는 전부 **비동기이고 실패할 수 있다.** 화면은 실패를 그려야 한다.
 *   - 권한 판정을 여기서 하지 않는다. 호스트가 이미 판정한 결과(`editable`)만 받는다.
 *     서버는 호출마다 다시 판정한다 — 이 값은 화면을 꾸미는 용도일 뿐이다.
 */

/* ------------------------------------------------------------------ 표 */

export const PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "date",
  "checkbox",
  "url",
  "person",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export type Column = {
  id: string;
  name: string;
  type: PropertyType;
  options: { id: string; name: string }[];
};

export type Row = {
  documentId: string;
  title: string;
  values: Record<string, unknown>;
};

/** 표 하나를 그리는 데 필요한 전부. 호스트가 서버에서 모아서 준다. */
export type DatabaseView = {
  collectionId: string;
  name: string;
  /**
   * 보는 방식. **블록이 아니라 표(모음)에 저장한다.**
   * 블록 속성으로 두면 뷰를 바꿀 때마다 ProseMirror 트랜잭션이 돌아 에디터 상태가 흔들린다
   * (실제로 제안 메뉴가 `/` 를 먹는 버그가 났다). 표가 어떻게 보이는지는 표의 성질이기도 하다.
   */
  view: DatabaseViewKind;
  columns: Column[];
  rows: Row[];
  people: { id: string; name: string }[];
  canWrite: boolean;
};

/** 표를 어떻게 보여 줄지. 노션의 뷰와 같은 개념이다. */
export const DATABASE_VIEWS = ["table", "board", "calendar"] as const;
export type DatabaseViewKind = (typeof DATABASE_VIEWS)[number];

export type DatabasePort = {
  load(collectionId: string): Promise<DatabaseView | null>;
  /** 새 표를 만들고 collectionId 를 돌려준다. 블록이 그 id 를 속성에 적는다. */
  create(documentId: string, name: string): Promise<string>;
  /** 보는 방식을 바꾼다. 표에 저장되므로 모두에게 같게 보인다. */
  setView(collectionId: string, view: DatabaseViewKind): Promise<void>;

  addRow(collectionId: string, title: string): Promise<void>;
  removeRow(collectionId: string, documentId: string): Promise<void>;
  /** afterId 가 null 이면 맨 앞으로. */
  moveRow(collectionId: string, documentId: string, afterId: string | null): Promise<void>;

  setValue(
    collectionId: string,
    documentId: string,
    propertyId: string,
    value: unknown,
  ): Promise<void>;
  /** 선택 속성은 이름으로 넣는다 — 없으면 서버가 선택지를 만든다. */
  setSelectValue(
    collectionId: string,
    documentId: string,
    propertyId: string,
    name: string,
  ): Promise<void>;

  addProperty(collectionId: string, name: string, type: PropertyType): Promise<void>;
  updateProperty(
    collectionId: string,
    propertyId: string,
    patch: { name?: string; type?: PropertyType },
  ): Promise<void>;
  deleteProperty(collectionId: string, propertyId: string): Promise<void>;
};

/* ------------------------------------------------ 멘션·링크·파일·동기화 */

export type DocumentRef = { id: string; title: string; breadcrumb?: string };

export type MentionPort = {
  /** `@` 뒤에 친 글로 문서를 찾는다. 권한은 서버가 좁힌다. */
  search(query: string): Promise<DocumentRef[]>;
  /** 새 하위 문서를 만들고 그 참조를 돌려준다. 노션의 "새 하위 페이지". */
  createChild?(title: string): Promise<DocumentRef>;
};

export type FilePort = {
  /** 올리고 **화면에서 쓸 주소**를 돌려준다. */
  upload(documentId: string, file: File): Promise<string>;
};

export type CollabPort = {
  /** ws:// 또는 wss:// 주소. 호스트가 지금 페이지 주소에서 만든다. */
  url(): string;
  /** 문서 하나·수십 초짜리 표. 붙을 때마다 새로 받는다. */
  fetchTicket(documentId: string): Promise<string>;
};

/* -------------------------------------------------------------- 냥이(AI) */

export type AiPort = {
  /**
   * 고른 글을 손봐서 **조각으로 흘려 준다**. 화면은 오는 대로 그린다.
   * 던지거나 `{ busy }` 를 주면 화면이 그에 맞게 바뀐다.
   */
  run(input: {
    task: AiTask;
    documentId: string;
    selection: string;
    context?: string;
    signal: AbortSignal;
  }): AsyncIterable<{ text?: string; busy?: { kind: "gaming" | "unreachable"; message?: string } }>;
};

/* ------------------------------------------------------------------ 댓글 */

export type CommentAuthor = { id: string; name: string; color: string };

export type CommentItem = {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  updatedAt: string | null;
};

export type CommentThread = {
  id: string;
  blockId: string | null;
  resolved: boolean;
  comments: CommentItem[];
};

export type CommentsLoad = {
  threads: CommentThread[];
  people: CommentAuthor[];
  /** 이 사람이 말을 걸 수 있는가. 서버가 판정한 결과다 — 화면은 이것만 본다. */
  canComment: boolean;
};

export type CommentsPort = {
  /** 실타래와 사람 이름을 **한 번에** 가져온다 — 화면을 열 때마다 두 번 다녀올 이유가 없다. */
  load(documentId: string): Promise<CommentsLoad>;
  /** 새 실타래. 고른 글이 있으면 blockId 가 붙는다. */
  start(documentId: string, blockId: string | null, body: string): Promise<CommentThread>;
  reply(threadId: string, body: string): Promise<CommentItem>;
  edit(commentId: string, body: string): Promise<void>;
  remove(commentId: string): Promise<void>;
  setResolved(threadId: string, resolved: boolean): Promise<void>;
};

/* ------------------------------------------------------------------ 전체 */

/** 문서로 가는 링크. Next 의 `<Link>` 처럼 화면을 통째로 다시 불러오지 않는 것을 받는다. */
export type LinkComponent = ComponentType<{
  href: string;
  children: ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}>;

export type EditorPorts = {
  collab: CollabPort;
  files: FilePort;
  database: DatabasePort;
  mentions: MentionPort;
  /** 없으면 냥이 항목이 아예 안 뜬다. */
  ai: AiPort | null;
  /** 없으면 댓글 UI 가 아예 안 뜬다. */
  comments: CommentsPort | null;
  /** 문서 주소를 만든다 (`/d/<id>`). 멘션·표의 줄이 쓴다. */
  hrefForDocument(documentId: string): string;
  /** 모음 주소를 만든다 (`/c/<id>`). 끼운 표의 제목이 쓴다. */
  hrefForCollection(collectionId: string): string;
  Link: LinkComponent;
  /** 서버 데이터가 바뀌었다 — 호스트가 화면을 다시 그리게 한다 (Next 면 router.refresh). */
  onDataChanged?(): void;
};
