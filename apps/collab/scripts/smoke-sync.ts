/**
 * M2 동기화 점검. 실제 WebSocket 으로 붙어 문서를 고치고, 서버에 남는지·다른 기기가 받는지 본다.
 *   pnpm --filter @nyanotion/collab smoke
 * 앞서 `pnpm dev`(표 발급용)와 `pnpm dev:collab` 이 떠 있어야 한다.
 */
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  createDocument,
  db,
  document,
  getDocument,
  loadEnv,
  personalSpaceOf,
  user,
} from "@nyanotion/db";
import { signCollabTicket } from "@nyanotion/shared";
import { eq } from "drizzle-orm";
import * as Y from "yjs";

loadEnv();

const WEB = process.env.SMOKE_WEB_URL ?? "http://localhost:3000";
const WS =
  process.env.NEXT_PUBLIC_COLLAB_URL !== undefined && process.env.NEXT_PUBLIC_COLLAB_URL !== ""
    ? process.env.NEXT_PUBLIC_COLLAB_URL
    : `ws://127.0.0.1:${process.env.COLLAB_PORT ?? "1234"}`;
const EMAIL = process.env.SMOKE_EMAIL ?? "mgh950714@gmail.com";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "nyanotion-first";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const converter = ServerBlockNoteEditor.create();

function paragraph(text: string) {
  return { type: "paragraph" as const, content: [{ type: "text" as const, text, styles: {} }] };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function waitFor(predicate: () => boolean, ms: number, label: string): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - started > ms) {
        console.log(`  (${label}: ${ms}ms 안에 안 됨)`);
        return resolve(false);
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

/** 표를 HTTP 로 받는다 — 라우트까지 함께 검증하기 위해. */
async function ticketOverHttp(documentId: string): Promise<{ status: number; ticket?: string }> {
  const signIn = await fetch(`${WEB}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: WEB },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!signIn.ok) throw new Error(`로그인 실패 ${signIn.status}`);
  const cookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

  const response = await fetch(`${WEB}/api/collab/ticket?doc=${documentId}`, {
    headers: { cookie },
  });
  if (!response.ok) return { status: response.status };
  const body = (await response.json()) as { ticket?: string };
  return { status: response.status, ticket: body.ticket };
}

function connect(documentId: string, token: string, ydoc: Y.Doc): HocuspocusProvider {
  return new HocuspocusProvider({
    url: WS,
    name: documentId,
    document: ydoc,
    token,
    WebSocketPolyfill: WebSocket,
    onAuthenticationFailed: () => {},
  });
}

async function main(): Promise<void> {
  const owner = (await db.select({ id: user.id }).from(user).limit(1))[0];
  if (owner === undefined) throw new Error("계정이 없습니다.");
  const space = await personalSpaceOf(owner.id);
  if (space === null) throw new Error("개인 space 가 없습니다.");

  const docId = await createDocument({ spaceId: space.id, userId: owner.id, title: "SYNC SMOKE" });
  const otherId = await createDocument({ spaceId: space.id, userId: owner.id, title: "SYNC OTHER" });
  console.log(`문서 ${docId}\n`);

  try {
    console.log("표 발급 (HTTP)");
    const issued = await ticketOverHttp(docId);
    check("표를 받았다", typeof issued.ticket === "string", issued);
    const token = issued.ticket ?? "";

    console.log("\n기기 A — 붙어서 글을 쓴다");
    const docA = new Y.Doc();
    const a = connect(docId, token, docA);
    check("기기 A 가 붙었다", await waitFor(() => a.isSynced, 10_000, "A 동기화"));

    // 편집을 흉내 낸다: 블록으로 만든 Y.Doc 의 상태를 로컬 문서에 합친다.
    const seeded = converter.blocksToYDoc([
      paragraph("비행기 모드에서 쓴 줄"),
      paragraph("두 번째 줄"),
    ]);
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(seeded));

    console.log("\n서버에 남는지 (debounce 뒤)");
    await sleep(4000);
    const saved = await getDocument(docId, space.id);
    check(
      "ydoc_state 가 채워졌다",
      (saved?.ydocState?.byteLength ?? 0) > 0,
      saved?.ydocState?.byteLength,
    );
    check(
      "text_plain 파생값이 만들어졌다",
      saved?.textPlain.includes("비행기 모드에서 쓴 줄") === true,
      saved?.textPlain,
    );
    check("content_json 파생값이 배열이다", Array.isArray(saved?.contentJson));
    check("제목은 건드리지 않았다", saved?.title === "SYNC SMOKE", saved?.title);

    console.log("\n기기 B — 빈 상태로 붙으면 내용을 받는다");
    const docB = new Y.Doc();
    const issuedB = await ticketOverHttp(docId);
    const b = connect(docId, issuedB.ticket ?? "", docB);
    const bSynced = await waitFor(() => b.isSynced, 10_000, "B 동기화");
    const textB = JSON.stringify(converter.yDocToBlocks(docB));
    check("기기 B 가 붙었다", bSynced);
    check("기기 B 가 같은 내용을 받았다", textB.includes("비행기 모드에서 쓴 줄"), textB.slice(0, 160));

    a.destroy();
    b.destroy();

    console.log("\n거절되어야 하는 경우");
    const badDoc = new Y.Doc();
    const bad = connect(docId, "not-a-real-ticket", badDoc);
    let rejected = false;
    bad.on("authenticationFailed", () => {
      rejected = true;
    });
    check("엉터리 표는 거절된다", await waitFor(() => rejected, 8000, "엉터리 표"));
    bad.destroy();

    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    const wrongScope = await signCollabTicket(secret, { userId: owner.id, documentId: otherId });
    const wrongDoc = new Y.Doc();
    const wrong = connect(docId, wrongScope, wrongDoc);
    let wrongRejected = false;
    wrong.on("authenticationFailed", () => {
      wrongRejected = true;
    });
    check(
      "다른 문서의 표로는 못 붙는다",
      await waitFor(() => wrongRejected, 8000, "다른 문서 표"),
    );
    wrong.destroy();

    const expired = await signCollabTicket(secret, {
      userId: owner.id,
      documentId: docId,
      ttlMs: -1000,
    });
    const expiredDoc = new Y.Doc();
    const stale = connect(docId, expired, expiredDoc);
    let staleRejected = false;
    stale.on("authenticationFailed", () => {
      staleRejected = true;
    });
    check("만료된 표는 거절된다", await waitFor(() => staleRejected, 8000, "만료 표"));
    stale.destroy();
  } finally {
    await db.delete(document).where(eq(document.id, docId));
    await db.delete(document).where(eq(document.id, otherId));
    console.log("\n치웠습니다");
  }

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
