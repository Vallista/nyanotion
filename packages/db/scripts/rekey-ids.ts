/**
 * 손으로 넣은 id(`row0000001`, `prop0001`, `colldemo0001` …)를 앱이 만드는 24자 cuid2 로 바꾼다.
 *
 * 앱은 id 를 언제나 `newId()` 로 만든다(src/id.ts). 그런데 예전에 데모용으로 SQL 로 직접 넣은
 * 줄이 남아 있었고, 그 id 가 주소(`/d/row0000001`)에 그대로 드러났다 — 순번이라 다른 문서 주소를
 * 짐작하게 만든다. 권한은 막지만 "있다"는 걸 흘리지 않는 게 이 서버의 원칙이다(권한 없으면 404).
 *
 * 하는 일 (표마다 한 트랜잭션):
 *   1. 그 표를 가리키는 외래 키를 잠시 내린다 (ON UPDATE CASCADE 가 없어서 id 를 못 바꾼다)
 *   2. id 와 가리키는 칼럼을 새 값으로 바꾼다
 *   3. 외래 키를 원래 정의 그대로 다시 건다
 *   4. 외래 키가 아닌 참조 — jsonb 안의 `"옛 id"`(모음의 조건·보기, 속성 값 등)와
 *      audit_event.subject_id — 도 바꾼다
 *
 * Yjs 상태(ydoc_state) 안에 옛 id 가 있으면(멘션 등) 바꾸지 못하므로 그 줄은 건너뛰고 알린다.
 *
 *   NYANOTION_ENV=beta npx tsx packages/db/scripts/rekey-ids.ts          # 보기만
 *   NYANOTION_ENV=beta npx tsx packages/db/scripts/rekey-ids.ts --yes    # 바꾸기
 *
 * **beta 에서 먼저.** 바꾼 뒤엔 옛 주소가 404 가 된다(북마크·공유한 링크).
 */
import { sql } from "../src/client.ts";
import { currentEnv } from "../src/env.ts";
import { newId } from "../src/id.ts";

const apply = process.argv.includes("--yes");
/** 주소에 드러나거나 다른 줄이 가리키는, 앱이 newId() 로 만드는 표들. */
const TABLES = ["document", "collection", "property", "tag"] as const;
const CUID = "^[a-z0-9]{24}$";

type Fk = { name: string; table: string; column: string; def: string };

async function main(): Promise<void> {
  console.log(`환경: ${currentEnv()}${apply ? "" : " (보기만 — 바꾸려면 --yes)"}`);

  const jsonbColumns = await sql<{ table_name: string; column_name: string }[]>`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type = 'jsonb'`;

  let total = 0;
  for (const table of TABLES) {
    const rows = await sql<{ id: string }[]>`
      select id from ${sql(table)} where id !~ ${CUID} order by id`;
    if (rows.length === 0) continue;

    const plan: { from: string; to: string }[] = [];
    for (const { id } of rows) {
      // 멘션은 문서 id 를, 인라인 표 블록은 모음 id 를 본문 안에 들고 있다.
      const [hit] = await sql<{ n: number }[]>`
        select count(*)::int as n from document
        where position(convert_to(${id}, 'UTF8') in coalesce(ydoc_state, ''::bytea)) > 0`;
      if ((hit?.n ?? 0) > 0) {
        console.log(`  건너뜀 ${table} ${id} — Yjs 본문 안에서 가리키고 있다 (손으로 고칠 것)`);
        continue;
      }
      plan.push({ from: id, to: newId() });
    }
    for (const p of plan) console.log(`  ${table}: ${p.from} → ${p.to}`);
    total += plan.length;
    if (!apply || plan.length === 0) continue;

    await sql.begin(async (tx) => {
      const fks = await tx<Fk[]>`
        select c.conname as name, c.conrelid::regclass::text as table,
               a.attname as column, pg_get_constraintdef(c.oid) as def
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.confrelid = ${table}::regclass and array_length(c.conkey, 1) = 1`;

      for (const fk of fks) await tx.unsafe(`alter table ${fk.table} drop constraint "${fk.name}"`);

      for (const { from, to } of plan) {
        await tx`update ${tx(table)} set id = ${to} where id = ${from}`;
        for (const fk of fks) {
          await tx.unsafe(`update ${fk.table} set "${fk.column}" = $1 where "${fk.column}" = $2`, [to, from]);
        }
        await tx`update audit_event set subject_id = ${to} where subject_id = ${from}`;
        // jsonb 안의 참조 — 따옴표째 맞춰야 다른 값의 일부를 바꾸지 않는다.
        for (const col of jsonbColumns) {
          await tx.unsafe(
            `update "${col.table_name}" set "${col.column_name}" = replace("${col.column_name}"::text, $1, $2)::jsonb
             where "${col.column_name}"::text like $3`,
            [`"${from}"`, `"${to}"`, `%"${from}"%`],
          );
        }
      }

      for (const fk of fks) {
        await tx.unsafe(`alter table ${fk.table} add constraint "${fk.name}" ${fk.def}`);
      }
    });
    console.log(`  ${table} ${plan.length}개 바꿈`);
  }

  console.log(total === 0 ? "바꿀 것이 없습니다." : apply ? `모두 ${total}개 바꿨습니다.` : `바꿀 것 ${total}개.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
