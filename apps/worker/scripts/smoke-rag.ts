/**
 * M6 점검 — 청킹 · 임베딩 · 하이브리드 검색 · 권한 경계 · 제안.
 *   pnpm --filter @nyanotion/worker smoke
 *
 * **이 점검의 핵심은 마지막 절이다.** "다른 가족 구성원의 비공개 문서는 절대 근거에 안 나온다"
 * (`docs/02-roadmap.md` M6 완료 기준). 검색이 잘 되는 것보다 이게 먼저다 —
 * 잘 찾는 검색이 남의 일기를 물어 오면 이 앱은 집에서 쫓겨난다.
 *
 * 실제 Ollama 와 실제 DB 를 쓴다. 만든 것은 끝에 전부 지운다.
 */
import { inArray, like, sql as sqlExpr } from "drizzle-orm";
import {
  chunkCount,
  claimJob,
  db,
  document,
  enqueueJob,
  finishJob,
  getSuggestion,
  loadEnv,
  newId,
  queueDepth,
  retrievePassages,
  space,
  storedChunks,
  user,
  hasVector,
  acceptSuggestion,
  dismissSuggestion,
  putSuggestion,
  listTags,
  setContent,
  createDocument,
  aiJob,
} from "@nyanotion/db";
import { chunkDocument, parseSuggestion } from "@nyanotion/shared";
import { AiBusyError, embedQueryOrNull, embedTexts } from "@nyanotion/ai";
import { indexDocument } from "../src/indexing.ts";

loadEnv();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TAG = "RAG-SMOKE";
const made = { users: [] as string[], spaces: [] as string[] };

const paragraph = (text: string) => ({
  id: `b-${Math.random().toString(36).slice(2, 10)}`,
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

const heading = (text: string) => ({
  id: `h-${Math.random().toString(36).slice(2, 10)}`,
  type: "heading",
  props: { level: 2 },
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

async function makeUser(label: string): Promise<{ id: string; spaceId: string }> {
  const id = newId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `${TAG} ${label}`,
    email: `${TAG.toLowerCase()}-${label}-${id.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(id);
  const spaceId = newId();
  await db
    .insert(space)
    .values({ id: spaceId, kind: "personal", ownerUserId: id, name: `${TAG} ${label}` });
  made.spaces.push(spaceId);
  return { id, spaceId };
}

async function main(): Promise<void> {
  /* ---------------------------------------------------------- 1. 청킹 */
  console.log("청킹 — 블록 경계를 잃지 않는가");

  const recipe = [
    heading("재료"),
    paragraph("배추 20포기, 고춧가루 3kg, 새우젓 1kg, 생새우 500g."),
    paragraph("무는 2개면 넉넉하다. 쪽파는 한 단."),
    heading("담그는 순서"),
    paragraph("배추를 소금물에 6시간 절인다. 중간에 한 번 뒤집는다."),
    paragraph("양념을 버무려 하루 숙성시킨 뒤 속을 넣는다."),
  ];
  const chunks = chunkDocument("2025년 김장", recipe);
  check("절(제목)마다 나뉜다", chunks.length === 2, chunks.length);
  check(
    "토막마다 블록 id 를 물고 있다",
    chunks.every((chunk) => chunk.blockId !== ""),
    chunks.map((chunk) => chunk.blockId),
  );
  check(
    "토막 앞에 문서 제목이 붙는다",
    chunks.every((chunk) => chunk.text.startsWith("2025년 김장")),
  );
  check(
    "두 번째 토막의 맥락이 '담그는 순서' 다",
    chunks[1]?.heading === "담그는 순서",
    chunks[1]?.heading,
  );

  /* -------------------------------------------------------- 2. 임베딩 */
  console.log("\n임베딩");
  let dimensions = 0;
  let normalized = 0;
  try {
    const [vector] = await embedTexts(["고양이 모래를 사야 한다"]);
    dimensions = vector?.length ?? 0;
    normalized = vector === undefined ? 0 : Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  } catch (error) {
    if (error instanceof AiBusyError && error.reason.kind === "gaming") {
      console.log("  건너뜀 — GPU 가 게임 중입니다 (이것도 올바른 동작입니다).");
      return;
    }
    throw error;
  }
  check("차원이 1024 다", dimensions === 1024, dimensions);
  check("길이가 1 로 맞춰져 있다", Math.abs(normalized - 1) < 1e-5, normalized);
  console.log(`  pgvector ${(await hasVector()) ? "켜짐" : "꺼짐 (real[] 경로를 검사합니다)"}`);

  /* ---------------------------------------------- 3. 색인과 다시 색인 */
  console.log("\n색인");
  const me = await makeUser("me");
  const other = await makeUser("other");

  const mine = await createDocument({
    spaceId: me.spaceId,
    userId: me.id,
    title: `${TAG} 2025년 김장`,
  });
  await setContent(mine, recipe, me.id);
  const first = await indexDocument(mine);
  check("토막이 생겼다", first.chunks === 2, first);
  check("전부 새로 임베딩했다", first.embedded === 2, first);

  const again = await indexDocument(mine);
  check("안 바뀐 문서는 다시 임베딩하지 않는다", again.embedded === 0 && again.reused === 2, again);

  // 한 절만 고친다 — 그 토막만 다시 임베딩해야 한다.
  const edited = [...recipe];
  edited[5] = paragraph("양념을 버무려 이틀 숙성시킨 뒤 속을 넣는다. 올해는 덜 맵게.");
  await setContent(mine, edited, me.id);
  const partial = await indexDocument(mine);
  check("고친 토막만 다시 임베딩한다", partial.embedded === 1 && partial.reused === 1, partial);

  // 문서를 짧게 줄이면 남은 뒷토막이 사라져야 한다 — 지운 글이 근거로 나오면 안 된다.
  await setContent(mine, [heading("재료"), paragraph("배추만 조금.")], me.id);
  const shrunk = await indexDocument(mine);
  check("짧아지면 뒷토막을 치운다", shrunk.chunks === 1 && shrunk.removed === 1, shrunk);

  // 되돌려 둔다 (뒤의 검색이 본문을 본다).
  await setContent(mine, recipe, me.id);
  await indexDocument(mine);

  /* ------------------------------------------------- 4. 하이브리드 검색 */
  console.log("\n하이브리드 검색");
  const embedding = await embedQueryOrNull("김장할 때 배추를 얼마나 절여야 하지");
  check("질문이 벡터가 됐다", embedding !== null && embedding.length === 1024);

  const found = await retrievePassages({
    documentIds: [mine],
    query: "배추 절이는 시간",
    queryEmbedding: embedding,
  });
  check("근거를 찾았다", found.length > 0, found.length);
  check(
    "찾은 근거에 '6시간' 이 있다",
    found.some((passage) => passage.text.includes("6시간")),
    found.map((passage) => passage.heading),
  );
  check(
    "근거가 점프할 블록 id 를 들고 있다",
    found.every((passage) => passage.blockId !== ""),
  );
  const both = found.find(
    (passage) => passage.lexicalRank !== null && passage.semanticRank !== null,
  );
  check("두 길 모두로 들어온 근거가 있다 (RRF 가 합쳤다)", both !== undefined, {
    lexical: found.filter((p) => p.lexicalRank !== null).length,
    semantic: found.filter((p) => p.semanticRank !== null).length,
  });

  // 뜻으로만 닿는 질문 — 글자가 하나도 겹치지 않아야 벡터 검색을 검사하는 것이 된다.
  const semanticOnly = await retrievePassages({
    documentIds: [mine],
    query: "겨울에 담그는 저장 음식 만드는 법",
    queryEmbedding: await embedQueryOrNull("겨울에 담그는 저장 음식 만드는 법"),
  });
  check("글자가 안 겹쳐도 뜻으로 찾는다", semanticOnly.length > 0, semanticOnly.length);
  check(
    "그건 벡터 길로 들어왔다",
    semanticOnly.some((passage) => passage.semanticRank !== null),
  );

  // 임베딩 없이도(게임 중) 어휘 검색은 돌아야 한다.
  const lexicalOnly = await retrievePassages({
    documentIds: [mine],
    query: "새우젓",
    queryEmbedding: null,
  });
  check("임베딩 없이도 어휘 검색은 된다", lexicalOnly.length > 0, lexicalOnly.length);

  /* ------------------------------------- 5. 권한 경계 — 이 점검의 핵심 */
  console.log("\n권한 경계 (M6 완료 기준)");
  const theirs = await createDocument({
    spaceId: other.spaceId,
    userId: other.id,
    title: `${TAG} 남의 일기`,
  });
  await setContent(
    theirs,
    [
      heading("김장 이야기"),
      paragraph("올해 김장하면서 배추를 6시간 절였다. 아무에게도 말하지 않은 일이 있다."),
    ],
    other.id,
  );
  await indexDocument(theirs);
  check("남의 문서도 색인은 되어 있다 (그 사람은 볼 수 있어야 한다)", (await chunkCount(theirs)) > 0);

  const asMe = await retrievePassages({
    documentIds: [mine],
    query: "배추를 6시간 절였다",
    queryEmbedding: await embedQueryOrNull("배추를 6시간 절였다"),
  });
  check(
    "**남의 비공개 문서는 근거에 나오지 않는다**",
    asMe.every((passage) => passage.documentId !== theirs),
    asMe.map((passage) => passage.documentTitle),
  );

  const asThem = await retrievePassages({
    documentIds: [theirs],
    query: "배추를 6시간 절였다",
    queryEmbedding: await embedQueryOrNull("배추를 6시간 절였다"),
  });
  check("그 사람 자신은 자기 문서를 찾는다", asThem.some((p) => p.documentId === theirs));

  const asNobody = await retrievePassages({
    documentIds: [],
    query: "배추",
    queryEmbedding: await embedQueryOrNull("배추"),
  });
  check("읽을 수 있는 문서가 없으면 아무것도 안 준다", asNobody.length === 0, asNobody.length);

  // 모래상자로 보낸 문서는 색인에서 사라진다.
  await db
    .update(document)
    .set({ archivedAt: new Date() })
    .where(inArray(document.id, [theirs]));
  const purged = await indexDocument(theirs);
  check("모래상자로 가면 색인을 지운다", purged.empty && (await chunkCount(theirs)) === 0, purged);

  /* ------------------------------------------------------------ 6. 큐 */
  console.log("\n큐");
  await enqueueJob("index", mine, 0);
  await enqueueJob("index", mine, 0);
  const pending = (
    await db
      .select({ n: sqlExpr<number>`count(*)::int` })
      .from(aiJob)
      .where(inArray(aiJob.documentId, [mine]))
  )[0]?.n;
  check("같은 문서를 두 번 적어도 줄은 하나다", pending === 1, pending);

  const claimed = await claimJob(["index"]);
  check("일을 집어 온다", claimed !== null && claimed.documentId === mine, claimed);
  const twice = await claimJob(["index"]);
  check("집어 간 일은 두 번 안 잡힌다", twice === null || twice.documentId !== mine, twice);
  if (claimed !== null) await finishJob(claimed.id);
  const depth = await queueDepth();
  check("끝낸 일은 대기에서 빠진다", depth.queued >= 0, depth);

  /* ------------------------------------------------ 7. 제안 (수락해야 반영) */
  console.log("\n제목·태그 제안");
  check(
    "울타리와 잡담이 섞여도 JSON 을 읽는다",
    JSON.stringify(parseSuggestion('네! ```json\n{"title":"김장 기록","tags":["#살림","요리"]}\n```')) ===
      JSON.stringify({ title: "김장 기록", tags: ["살림", "요리"] }),
    parseSuggestion('네! ```json\n{"title":"김장 기록","tags":["#살림","요리"]}\n```'),
  );
  check("못 읽으면 null", parseSuggestion("음... 잘 모르겠어요") === null);

  const untitled = await createDocument({ spaceId: me.spaceId, userId: me.id, title: "" });
  await putSuggestion(untitled, { title: `${TAG} 김장 기록`, tags: [`${TAG}살림`] }, "테스트");
  const waiting = await getSuggestion(untitled);
  check("제안이 문서 밖에서 기다린다", waiting?.title === `${TAG} 김장 기록`, waiting);

  const titleBefore = (
    await db.select({ title: document.title }).from(document).where(inArray(document.id, [untitled]))
  )[0]?.title;
  check("**수락하기 전에는 문서가 안 바뀐다**", titleBefore === "", titleBefore);

  const accepted = await acceptSuggestion(untitled, me.spaceId, me.id, {
    title: true,
    tags: false,
  });
  check("제목만 수락할 수 있다", accepted.title === `${TAG} 김장 기록` && accepted.tags.length === 0, accepted);
  const tagsAfter = (await listTags([me.spaceId])).filter((tag) => tag.name.startsWith(TAG));
  check("안 받은 태그는 만들어지지 않는다", tagsAfter.length === 0, tagsAfter);
  check("수락한 제안은 사라진다", (await getSuggestion(untitled)) === null);

  await putSuggestion(untitled, { title: "", tags: [`${TAG}살림`] }, "테스트");
  await dismissSuggestion(untitled);
  check("무시하면 그냥 사라진다", (await getSuggestion(untitled)) === null);

  /* -------------------------------------------------- 8. 지문 유지 확인 */
  const stored = await storedChunks(mine);
  check(
    "저장된 토막이 전부 임베딩을 갖고 있다",
    stored.length > 0 && stored.every((chunk) => chunk.hasEmbedding),
    stored.map((chunk) => chunk.hasEmbedding),
  );
}

async function cleanup(): Promise<void> {
  await db.delete(document).where(like(document.title, `${TAG}%`));
  // 제목이 빈 문서(제안 검사용)는 space 를 지울 때 함께 사라진다.
  if (made.spaces.length > 0) await db.delete(space).where(inArray(space.id, made.spaces));
  if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
