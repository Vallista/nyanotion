import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { Server } from "@hocuspocus/server";
import { canWrite } from "@nyanotion/auth";
import { getDocumentById, loadEnv, saveYdoc, type Document } from "@nyanotion/db";
import { blocksToPlainText, guessTitle, verifyCollabTicket } from "@nyanotion/shared";
import * as Y from "yjs";

loadEnv();

/**
 * Yjs 동기화 서버.
 *
 * 클라이언트는 문서를 IndexedDB 에 들고 편집하고, 연결이 살아 있으면 여기로 업데이트를 보낸다.
 * 집 서버가 꺼져 있어도 편집이 되고, 돌아오면 CRDT 가 합친다 — ARCHITECTURE.md §4.
 *
 * **여기가 `document.ydoc_state` 를 쓰는 유일한 곳이다.** 저장할 때마다 파생값
 * (`content_json`·`text_plain`)을 같이 갱신해서, 검색·렌더·API·LLM 이 CRDT 를 모르게 유지한다.
 */

const PORT = Number(process.env.COLLAB_PORT ?? 1234);
/** 이 시간 동안 조용하면 한 번 저장한다. 타이핑마다 쓰지 않기 위해. */
const DEBOUNCE_MS = Number(process.env.COLLAB_DEBOUNCE_MS ?? 2000);
/** 조용해지지 않아도 이 간격으로는 반드시 저장한다. */
const MAX_DEBOUNCE_MS = Number(process.env.COLLAB_MAX_DEBOUNCE_MS ?? 10000);

const converter = ServerBlockNoteEditor.create();

const secret = process.env.BETTER_AUTH_SECRET;
if (secret === undefined || secret === "") {
  throw new Error("BETTER_AUTH_SECRET 이 없습니다 — 표를 검증할 수 없습니다.");
}

/**
 * 브라우저가 보낸 Origin 이 우리 주소인지. 표가 이미 범위를 좁히고 있으므로 이건 겹겹의 두 번째 문.
 * Origin 헤더가 없는 클라이언트(스크립트·테스트)는 막지 않는다.
 */
const trustedOrigins = new Set(
  [process.env.BETTER_AUTH_URL, ...(process.env.TRUSTED_ORIGINS ?? "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value !== ""),
);

function originAllowed(origin: string | null): boolean {
  if (origin === null || origin === "") return true;
  return trustedOrigins.has(origin);
}

/** onAuthenticate 가 만들어 onLoadDocument·onStoreDocument 로 넘기는 값. */
type Context = { userId: string; doc: Document };

function isContext(value: unknown): value is Context {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { userId?: unknown }).userId === "string"
  );
}

const server = new Server<Context>({
  port: PORT,
  timeout: 30_000,
  debounce: DEBOUNCE_MS,
  maxDebounce: MAX_DEBOUNCE_MS,
  quiet: true,

  /**
   * WebSocket 은 Next 의 세션 미들웨어를 거치지 않는다 — 토큰과 소유권을 직접 확인한다.
   * 던지면 연결이 거부된다.
   */
  async onAuthenticate({ token, documentName, requestHeaders }) {
    if (!originAllowed(requestHeaders.get("origin"))) {
      throw new Error("허용되지 않은 출처입니다.");
    }

    const ticket = await verifyCollabTicket(secret, token);
    if (ticket === null) throw new Error("표가 유효하지 않습니다.");
    // 표는 문서 하나에만 쓴다 — 다른 문서로 돌려쓰지 못하게.
    if (ticket.documentId !== documentName) throw new Error("표가 이 문서의 것이 아닙니다.");

    // 표가 있어도 권한은 여기서 다시 판정한다 (그 사이 공유가 끊겼을 수 있다).
    // **access.ts 가 유일한 판정자다** — 여기서 조건을 손으로 짜지 말 것.
    if (!(await canWrite(ticket.userId, documentName))) {
      // 없는 문서와 권한 없는 문서를 구분하지 않는다 — 존재 여부를 알려주지 않기 위해.
      throw new Error("문서를 열 수 없습니다.");
    }
    const doc = await getDocumentById(documentName);
    if (doc === null || doc.archivedAt !== null) throw new Error("문서를 열 수 없습니다.");

    return { userId: ticket.userId, doc };
  },

  /**
   * 저장된 Yjs 상태를 올린다. 없으면 M1 에 쌓인 `content_json` 에서 한 번 만들어 넣는다
   * (원본이 content_json → ydoc_state 로 넘어가는 지점).
   */
  async onLoadDocument({ context, document: ydoc }) {
    const doc = context.doc;

    if (doc.ydocState !== null && doc.ydocState.byteLength > 0) {
      Y.applyUpdate(ydoc, doc.ydocState);
      return ydoc;
    }

    if (Array.isArray(doc.contentJson) && doc.contentJson.length > 0) {
      const seeded = converter.blocksToYDoc(doc.contentJson as never);
      Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(seeded));
      console.log(`[collab] ${doc.id}: content_json 에서 Yjs 문서를 만들었습니다`);
    }
    return ydoc;
  },

  /** 원본은 ydoc_state, 파생값은 같이 갱신. 제목이 비어 있으면 첫 줄에서 짐작한다. */
  async onStoreDocument({ document: ydoc, documentName, lastContext }) {
    if (!isContext(lastContext)) {
      console.warn(`[collab] ${documentName}: context 가 없어 저장을 건너뜁니다`);
      return;
    }

    const blocks = converter.yDocToBlocks(ydoc);
    const textPlain = blocksToPlainText(blocks);
    const existing = lastContext.doc.title;
    const title = existing.trim() === "" ? guessTitle(blocks) : existing;

    await saveYdoc({
      documentId: documentName,
      ydocState: Y.encodeStateAsUpdate(ydoc),
      contentJson: blocks,
      textPlain,
      title,
      userId: lastContext.userId,
    });
    // 다음 저장 때 제목을 또 짐작하지 않도록 기억한다.
    lastContext.doc.title = title;
  },
});

await server.listen();
console.log(`[collab] ws://127.0.0.1:${PORT} 에서 대기 (debounce ${DEBOUNCE_MS}ms)`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[collab] ${signal} — 남은 문서를 저장하고 종료합니다`);
    void server.destroy().then(() => process.exit(0));
  });
}
