/**
 * M3 데이터 계층 점검 — 태그·츄르·검색. 실제 DB 에 만들고 확인한 뒤 전부 지운다.
 *   pnpm --filter @nyanotion/db smoke:search
 */
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/client.ts";
import {
  attachTag,
  deleteTag,
  detachTag,
  documentsWithTag,
  ensureTag,
  listFavorites,
  listTags,
  tagsForDocuments,
  toggleFavorite,
} from "../src/queries/tagging.ts";
import { createDocument, setContent } from "../src/queries/documents.ts";
import { searchDocuments } from "../src/queries/search.ts";
import { document, space, tag, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const paragraph = (text: string) => ({
  id: `b-${Math.random().toString(36).slice(2, 10)}`,
  type: "paragraph",
  props: {},
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

async function main(): Promise<void> {
  const owner = (await db.select({ id: user.id }).from(user).limit(1))[0];
  if (owner === undefined) throw new Error("계정이 없습니다.");
  const mySpace = (
    await db
      .select({ id: space.id })
      .from(space)
      .where(and(eq(space.kind, "personal"), eq(space.ownerUserId, owner.id)))
      .limit(1)
  )[0];
  if (mySpace === undefined) throw new Error("개인 space 가 없습니다.");
  const spaceId = mySpace.id;
  const userId = owner.id;

  try {
    console.log("문서 준비");
    const a = await createDocument({ spaceId, userId, title: "SRCH 주말 장보기" });
    const b = await createDocument({ spaceId, userId, title: "SRCH 관리비 정리" });
    await setContent(a, [paragraph("쌀 10kg 과 고양이 모래 사기"), paragraph("마트는 10시 전이 한가하다")], userId);
    await setContent(b, [paragraph("수도요금과 전기요금 납부일 정리")], userId);
    console.log("  문서 2개");

    console.log("\n태그");
    const chore = await ensureTag(spaceId, "SRCH살림");
    const again = await ensureTag(spaceId, "SRCH살림");
    check("같은 이름이면 같은 태그를 쓴다", chore === again, { chore, again });
    const money = await ensureTag(spaceId, "SRCH돈");

    await attachTag(a, chore);
    await attachTag(b, chore);
    await attachTag(b, money);
    await attachTag(b, money); // 두 번 달아도 한 번
    const withChore = await documentsWithTag([spaceId], chore);
    check("태그로 문서를 찾는다", withChore.length === 2, withChore.map((d) => d.title));

    const tagMap = await tagsForDocuments([a, b]);
    check("문서별 태그를 한 번에 가져온다", (tagMap.get(b)?.length ?? 0) === 2, tagMap.get(b));

    const counts = await listTags([spaceId]);
    const choreCount = counts.find((t) => t.id === chore)?.count;
    check("태그별 문서 수가 맞는다", choreCount === 2, choreCount);

    await detachTag(b, money);
    const afterDetach = await tagsForDocuments([b]);
    check("태그를 뗀다", (afterDetach.get(b)?.length ?? 0) === 1, afterDetach.get(b));

    console.log("\n츄르 (즐겨찾기)");
    check("처음엔 꺼져 있다 → 켠다", (await toggleFavorite(userId, a)) === true);
    const favs = await listFavorites(userId, [spaceId]);
    check("즐겨찾기 목록에 뜬다", favs.some((f) => f.id === a), favs.map((f) => f.title));
    check("다시 누르면 꺼진다", (await toggleFavorite(userId, a)) === false);
    check(
      "목록에서 빠진다",
      !(await listFavorites(userId, [spaceId])).some((f) => f.id === a),
    );

    console.log("\n검색");
    const byTitle = await searchDocuments([spaceId], "장보기");
    check("제목으로 찾는다", byTitle.some((h) => h.id === a), byTitle.map((h) => h.title));

    const byBody = await searchDocuments([spaceId], "고양이 모래");
    check("본문으로 찾는다", byBody.some((h) => h.id === a), byBody.map((h) => h.title));

    // 한국어는 형태소 분석기가 없어 tsvector 만으로는 부분 단어를 못 잡는다 → trigram 이 받아야 한다.
    const partial = await searchDocuments([spaceId], "장보");
    check("부분 단어도 찾는다 (trigram)", partial.some((h) => h.id === a), partial.map((h) => h.title));

    const scoped = await searchDocuments([spaceId], "정리", { tagIds: [chore] });
    check("태그로 좁혀서 찾는다", scoped.every((h) => h.id !== a), scoped.map((h) => h.title));

    const hit = byBody.find((h) => h.id === a);
    check("찾은 말 주변을 잘라 준다", (hit?.snippet.length ?? 0) > 0 && hit!.snippet.includes("고양이"), hit?.snippet);

    const nothing = await searchDocuments([spaceId], "존재하지않는말XYZ");
    check("없는 말은 아무것도 안 나온다", nothing.length === 0, nothing.length);

    const browse = await searchDocuments([spaceId], "");
    check("검색어가 없으면 최근 문서를 준다", browse.length > 0, browse.length);

    console.log("\n태그 지우기");
    await deleteTag(money, spaceId);
    const left = await listTags([spaceId]);
    check("태그가 사라진다", !left.some((t) => t.id === money));
    const docStillThere = await db.select({ id: document.id }).from(document).where(eq(document.id, b));
    check("문서는 남는다", docStillThere.length === 1);
  } finally {
    const removedDocs = await db
      .delete(document)
      .where(and(eq(document.spaceId, spaceId), like(document.title, "SRCH%")))
      .returning({ id: document.id });
    const removedTags = await db
      .delete(tag)
      .where(and(eq(tag.spaceId, spaceId), like(tag.name, "SRCH%")))
      .returning({ id: tag.id });
    console.log(`\n치웠습니다 — 문서 ${removedDocs.length}개, 태그 ${removedTags.length}개`);
  }

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
