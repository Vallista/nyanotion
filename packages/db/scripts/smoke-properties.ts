/**
 * 노션식 데이터베이스 점검 — 모음의 속성, 값, 손으로 담는 줄.
 *   pnpm --filter @nyanotion/db smoke:props
 */
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/client.ts";
import { createCollection, deleteCollection, getCollection } from "../src/queries/collections.ts";
import { createDocument } from "../src/queries/documents.ts";
import {
  addProperty,
  addToCollection,
  collectionOfProperty,
  collectionSource,
  deleteProperty,
  ensureSelectOption,
  listCollectionItems,
  listProperties,
  moveInCollection,
  removeFromCollection,
  selectOptions,
  setPropertyValue,
  updateProperty,
  valuesForDocuments,
} from "../src/queries/properties.ts";
import { collection, document, space, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TAG = "PROP";

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

  let collectionId = "";
  try {
    console.log("손으로 담는 모음 만들기");
    collectionId = await createCollection({
      spaceId,
      userId,
      name: `${TAG} 살 것`,
      filter: { tagIds: [], query: "" },
      view: "table",
      source: "manual",
    });
    check("source 가 manual 이다", (await collectionSource(collectionId)) === "manual");
    const saved = await getCollection(collectionId, [spaceId]);
    check("읽어도 manual 이다", saved?.source === "manual", saved?.source);

    console.log("\n속성 달기");
    const price = await addProperty({ collectionId, name: `${TAG}가격`, type: "number" });
    const when = await addProperty({ collectionId, name: `${TAG}구매일`, type: "date" });
    const state = await addProperty({ collectionId, name: `${TAG}상태`, type: "select" });
    const link = await addProperty({ collectionId, name: `${TAG}링크`, type: "url" });

    const props = await listProperties(collectionId);
    check("속성 4개가 순서대로 나온다", props.length === 4, props.map((p) => p.name));
    check("첫 속성이 가격이다", props[0]?.id === price, props[0]?.name);
    check("종류가 지켜진다", props[1]?.type === "date" && props[3]?.type === "url");
    check("속성이 어느 모음 것인지 안다", (await collectionOfProperty(price)) === collectionId);

    console.log("\n선택지");
    const todo = await ensureSelectOption(state, collectionId, "살 것");
    const again = await ensureSelectOption(state, collectionId, "살 것");
    check("같은 이름이면 같은 선택지", todo === again, { todo, again });
    const done = await ensureSelectOption(state, collectionId, "샀음");
    const after = await listProperties(collectionId);
    const options = selectOptions(after.find((p) => p.id === state)?.config ?? {});
    check("선택지가 2개다", options.length === 2, options.map((o) => o.name));
    check("선택지 이름이 맞다", options.some((o) => o.name === "샀음"));

    console.log("\n줄 담기");
    const rice = await createDocument({ spaceId, userId, title: `${TAG} 쌀 10kg` });
    const litter = await createDocument({ spaceId, userId, title: `${TAG} 고양이 모래` });
    const other = await createDocument({ spaceId, userId, title: `${TAG} 표 밖의 문서` });
    await addToCollection(collectionId, rice);
    await addToCollection(collectionId, litter);
    await addToCollection(collectionId, rice); // 두 번 담아도 한 줄

    let items = await listCollectionItems(collectionId);
    check("줄이 2개다", items.length === 2, items.length);
    check("담지 않은 문서는 없다", !items.some((i) => i.documentId === other));
    check("담은 순서대로다", items[0]?.documentId === rice, items[0]?.documentId);

    console.log("\n값 쓰기");
    await setPropertyValue(rice, price, 32900);
    await setPropertyValue(rice, state, todo);
    await setPropertyValue(rice, when, "2026-10-03");
    await setPropertyValue(litter, price, 18500);
    await setPropertyValue(litter, state, done);

    const values = await valuesForDocuments([rice, litter], [price, when, state, link]);
    check("쌀 가격이 숫자로 남는다", values.get(rice)?.get(price) === 32900, values.get(rice)?.get(price));
    check("날짜가 문자열로 남는다", values.get(rice)?.get(when) === "2026-10-03");
    check("선택지 id 가 남는다", values.get(litter)?.get(state) === done);
    check("안 쓴 값은 없다", values.get(rice)?.get(link) === undefined);

    console.log("\n값 지우기");
    await setPropertyValue(rice, price, null);
    const afterClear = await valuesForDocuments([rice], [price]);
    check("빈 값은 줄이 사라진다", afterClear.get(rice)?.get(price) === undefined);

    console.log("\n순서 바꾸기");
    await moveInCollection(collectionId, litter, null); // 맨 앞으로
    items = await listCollectionItems(collectionId);
    check("모래가 맨 앞으로 왔다", items[0]?.documentId === litter, items.map((i) => i.documentId));

    console.log("\n표에서 빼기");
    await removeFromCollection(collectionId, litter);
    items = await listCollectionItems(collectionId);
    check("줄이 1개로 준다", items.length === 1, items.length);
    const stillThere = await db.select({ id: document.id }).from(document).where(eq(document.id, litter));
    check("**문서는 그대로 남는다**", stillThere.length === 1);

    console.log("\n속성 바꾸고 지우기");
    await updateProperty(link, collectionId, { name: `${TAG}주소` });
    const renamed = await listProperties(collectionId);
    check("이름이 바뀐다", renamed.some((p) => p.name === `${TAG}주소`));

    await deleteProperty(link, collectionId);
    check("속성이 사라진다", (await listProperties(collectionId)).length === 3);
    const afterDelete = await db.select({ id: document.id }).from(document).where(eq(document.id, rice));
    check("속성을 지워도 문서는 남는다", afterDelete.length === 1);

    console.log("\n모음을 지우면");
    await deleteCollection(collectionId, [spaceId]);
    check("속성도 함께 사라진다", (await listProperties(collectionId)).length === 0);
    check("줄도 함께 사라진다", (await listCollectionItems(collectionId)).length === 0);
    const docsLeft = await db
      .select({ id: document.id })
      .from(document)
      .where(like(document.title, `${TAG}%`));
    check("**문서는 셋 다 남는다**", docsLeft.length === 3, docsLeft.length);
    collectionId = "";
  } finally {
    if (collectionId !== "") await db.delete(collection).where(eq(collection.id, collectionId));
    const removed = await db
      .delete(document)
      .where(and(eq(document.spaceId, spaceId), like(document.title, `${TAG}%`)))
      .returning({ id: document.id });
    await db.delete(collection).where(like(collection.name, `${TAG}%`));
    console.log(`\n치웠습니다 — 문서 ${removed.length}개`);
  }

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
