/**
 * M1 데이터 계층 점검. 실제 DB 에 문서를 만들고 옮기고 버려 본 뒤 전부 지운다.
 *   node --experimental-strip-types packages/db/scripts/smoke-documents.ts
 */
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/client.ts";
import {
  archiveDocument,
  countArchived,
  createDocument,
  getDocument,
  listArchived,
  listTree,
  moveDocument,
  restoreDocument,
  setContent,
} from "../src/queries/documents.ts";
import { document, space, user } from "../src/schema/index.ts";

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
  const users = await db.select({ id: user.id }).from(user).limit(1);
  const owner = users[0];
  if (owner === undefined) throw new Error("계정이 없습니다. 먼저 첫 가입을 하세요.");

  const spaces = await db
    .select({ id: space.id })
    .from(space)
    .where(and(eq(space.kind, "personal"), eq(space.ownerUserId, owner.id)))
    .limit(1);
  const mySpace = spaces[0];
  if (mySpace === undefined) throw new Error("개인 space 가 없습니다.");

  const spaceId = mySpace.id;
  const userId = owner.id;
  console.log(`space=${spaceId} user=${userId}\n`);

  console.log("만들기와 트리");
  const a = await createDocument({ spaceId, userId, title: "SMOKE 살림" });
  const b = await createDocument({ spaceId, userId, title: "SMOKE 여행" });
  const a1 = await createDocument({ spaceId, userId, parentId: a, title: "SMOKE 장보기" });
  const a2 = await createDocument({ spaceId, userId, parentId: a, title: "SMOKE 공과금" });

  let tree = await listTree(spaceId);
  const mine = () => tree.filter((n) => n.title.startsWith("SMOKE"));
  check("문서 4개가 보인다", mine().length === 4, mine().length);
  check(
    "자식 2개의 부모가 a 다",
    mine().filter((n) => n.parentId === a).length === 2,
  );

  const positions = mine()
    .filter((n) => n.parentId === a)
    .map((n) => n.position);
  check("형제 정렬 키가 서로 다르고 오름차순이다", positions.length === 2 && positions[0]! < positions[1]!, positions);

  console.log("\n본문 저장과 파생값");
  await setContent(
    a1,
    spaceId,
    [paragraph("쌀 10kg 사기"), paragraph("고양이 모래 2포")],
    userId,
  );
  const saved = await getDocument(a1, spaceId);
  check("text_plain 이 두 줄로 만들어졌다", saved?.textPlain === "쌀 10kg 사기\n고양이 모래 2포", saved?.textPlain);
  check("content_json 이 배열로 들어갔다", Array.isArray(saved?.contentJson));

  console.log("\n제목이 비면 첫 줄에서 짐작한다");
  const untitled = await createDocument({ spaceId, userId });
  await setContent(untitled, spaceId, [paragraph("SMOKE 제목 없이 쓴 메모")], userId);
  const guessed = await getDocument(untitled, spaceId);
  check("제목이 채워졌다", guessed?.title === "SMOKE 제목 없이 쓴 메모", guessed?.title);

  console.log("\n옮기기");
  const moved = await moveDocument({ id: a2, spaceId, parentId: b, afterId: null });
  check("a2 를 b 아래로 옮겼다", moved.ok);
  tree = await listTree(spaceId);
  check("a2 의 부모가 b 다", tree.find((n) => n.id === a2)?.parentId === b);

  const reorder = await moveDocument({ id: a1, spaceId, parentId: a, afterId: null });
  check("같은 부모 안에서 맨 앞으로 옮긴다", reorder.ok);

  console.log("\n순환 막기");
  const cycle = await moveDocument({ id: a, spaceId, parentId: a1, afterId: null });
  check("자기 자식 아래로는 못 옮긴다", !cycle.ok && cycle.reason === "cycle", cycle);
  const self = await moveDocument({ id: a, spaceId, parentId: a, afterId: null });
  check("자기 자신 아래로도 못 옮긴다", !self.ok && self.reason === "cycle", self);
  tree = await listTree(spaceId);
  check("실패한 이동이 트리를 바꾸지 않았다", tree.find((n) => n.id === a)?.parentId === null);

  console.log("\n모래상자");
  await archiveDocument(a, spaceId);
  tree = await listTree(spaceId);
  check("a 와 하위가 트리에서 사라졌다", !tree.some((n) => n.id === a || n.id === a1));
  check("b 는 남아 있다", tree.some((n) => n.id === b));

  const archived = await listArchived(spaceId);
  check("모래상자에 a 만 뜬다 (하위는 접힌다)", archived.some((n) => n.id === a) && !archived.some((n) => n.id === a1), archived.map((n) => n.title));
  check("버려진 개수는 2 다 (a + a1)", (await countArchived(spaceId)) === 2);

  await restoreDocument(a, spaceId);
  tree = await listTree(spaceId);
  check("되돌리면 하위까지 함께 살아난다", tree.some((n) => n.id === a) && tree.some((n) => n.id === a1));

  console.log("\n치우기");
  const removed = await db
    .delete(document)
    .where(and(eq(document.spaceId, spaceId), like(document.title, "SMOKE%")))
    .returning({ id: document.id });
  console.log(`  지운 문서 ${removed.length}개`);
  const leftover = (await listTree(spaceId)).filter((n) => n.title.startsWith("SMOKE"));
  check("SMOKE 문서가 남지 않았다", leftover.length === 0, leftover.map((n) => n.title));

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
