/**
 * 점검 스크립트가 남긴 것을 치운다. 무엇을 지울지 먼저 보여 주고, --yes 가 있어야 지운다.
 *   pnpm --filter @nyanotion/db tsx scripts/cleanup-test-data.ts [--yes]
 */
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db } from "../src/client.ts";
import { attachment, collection, document } from "../src/schema/index.ts";

const apply = process.argv.includes("--yes");

const docIds = process.argv.filter((a) => /^[a-z0-9]{20,30}$/.test(a));

async function main(): Promise<void> {
  // 1) 이름으로 알아보는 임시 모음 — 인라인 표가 만드는 기본 이름이 "표" 다.
  const collections = await db
    .select({ id: collection.id, name: collection.name })
    .from(collection)
    .where(and(eq(collection.name, "표"), eq(collection.source, "manual")));

  // 2) 지정한 문서와, 그 문서에 붙은 첨부
  const docs =
    docIds.length === 0
      ? []
      : await db
          .select({ id: document.id, title: document.title })
          .from(document)
          .where(inArray(document.id, docIds));

  const files =
    docIds.length === 0
      ? []
      : await db
          .select({ id: attachment.id, filename: attachment.filename })
          .from(attachment)
          .where(inArray(attachment.documentId, docIds));

  console.log("지울 것:");
  console.log(`  모음 ${collections.length}개 — ${collections.map((c) => c.name).join(", ") || "없음"}`);
  console.log(`  문서 ${docs.length}개 — ${docs.map((d) => d.title).join(", ") || "없음"}`);
  console.log(`  첨부 ${files.length}개 — ${files.map((f) => f.filename).join(", ") || "없음"}`);

  if (!apply) {
    console.log("\n--yes 를 붙이면 실제로 지웁니다.");
    return;
  }

  if (collections.length > 0) {
    await db.delete(collection).where(
      inArray(
        collection.id,
        collections.map((c) => c.id),
      ),
    );
  }
  if (docs.length > 0) {
    // 문서를 지우면 첨부 줄도 cascade 로 사라진다.
    await db.delete(document).where(
      inArray(
        document.id,
        docs.map((d) => d.id),
      ),
    );
  }
  console.log("\n치웠습니다.");
}

await main();
process.exit(0);
