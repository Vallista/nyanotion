/**
 * 점검·e2e 스크립트가 남긴 것을 치운다.
 *
 * 두 가지 방식이 있고, **둘 다 먼저 보여 주고 `--yes` 가 있어야 지운다.**
 *
 *   # 문서 id 를 집어서 지우기 (e2e 가 끝에 알려 준다)
 *   npx tsx packages/db/scripts/cleanup-test-data.ts --yes <문서id> [...]
 *
 *   # 남길 것만 적고 나머지를 지우기 — 시험을 여러 번 돌린 뒤 한 번에 치울 때
 *   npx tsx packages/db/scripts/cleanup-test-data.ts --keep <문서id> [...] --yes
 *
 * `--keep` 은 **적지 않은 문서를 전부 지운다.** 반드시 먼저 `--yes` 없이 돌려 목록을 볼 것.
 * 이름이 "표" 인 손으로 담는 모음은 인라인 표의 기본 이름이라 어느 방식에서나 함께 지운다.
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../src/client.ts";
import { attachment, collection, document } from "../src/schema/index.ts";

const args = process.argv.slice(2);
const apply = args.includes("--yes");
const keepMode = args.includes("--keep");
const ids = args.filter((a) => /^[a-z0-9]{8,30}$/.test(a));

async function main(): Promise<void> {
  if (ids.length === 0) {
    console.log("문서 id 를 하나 이상 주세요. (--keep 이면 '남길' 문서 id)");
    return;
  }

  const docs = keepMode
    ? await db
        .select({ id: document.id, title: document.title })
        .from(document)
        .where(notInArray(document.id, ids))
    : await db
        .select({ id: document.id, title: document.title })
        .from(document)
        .where(inArray(document.id, ids));

  // 인라인 표의 기본 이름. 사람이 이름을 바꾼 표는 건드리지 않는다.
  const collections = await db
    .select({ id: collection.id, name: collection.name })
    .from(collection)
    .where(and(eq(collection.name, "표"), eq(collection.source, "manual")));

  const docIds = docs.map((d) => d.id);
  const files =
    docIds.length === 0
      ? []
      : await db
          .select({ id: attachment.id, filename: attachment.filename })
          .from(attachment)
          .where(inArray(attachment.documentId, docIds));

  console.log(keepMode ? `남길 문서 ${ids.length}개를 뺀 나머지를 지웁니다.` : "지웁니다.");
  console.log(`  문서 ${docs.length}개 — ${docs.map((d) => JSON.stringify(d.title)).join(", ") || "없음"}`);
  console.log(`  모음 ${collections.length}개 (이름이 "표" 인 것)`);
  console.log(`  첨부 ${files.length}개 — ${files.map((f) => f.filename).join(", ") || "없음"}`);
  console.log("  (디스크의 파일은 남습니다 — UPLOAD_DIR 에서 직접 지우세요)");

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
    // 문서를 지우면 첨부·댓글 줄도 cascade 로 사라진다.
    await db.delete(document).where(inArray(document.id, docIds));
  }
  console.log("\n치웠습니다.");
}

await main();
process.exit(0);
