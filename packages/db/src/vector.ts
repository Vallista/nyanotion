import { sql } from "drizzle-orm";
import { db } from "./client";

/**
 * pgvector 는 **있으면 쓰고 없으면 없이 돈다.**
 *
 * `CREATE EXTENSION vector` 는 슈퍼유저만 할 수 있다. 그래서 새 컴퓨터, CI, 백업 복구 직후에는
 * 없을 수 있다 — 그때 문서 질의가 아예 안 되면 안 된다. 그래서 임베딩 원본은 `real[]` 로
 * 저장하고(마이그레이션 0013), 확장이 **켜져 있을 때만** 같은 값을 `vector(1024)` 칼럼에
 * 복사해 HNSW 색인을 붙인다.
 *
 * 이 파일이 마이그레이션이 아니라 코드인 이유: 확장은 마이그레이션보다 **나중에** 켜질 수 있다.
 * 이미 적용된 마이그레이션은 다시 돌지 않으니, 멱등한 코드로 두고 `db:migrate` 와
 * `scripts/enable-vector.ps1` 양쪽에서 부른다.
 */

/** bge-m3 의 출력 차원. 모델을 바꾸면 이 값과 색인을 함께 바꿔야 한다. */
export const EMBEDDING_DIMENSIONS = 1024;

let cached: boolean | null = null;

/** 이 데이터베이스가 pgvector 를 쓸 수 있는가. 한 번 보고 기억한다. */
export async function hasVector(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const rows = await db.execute<{ ok: boolean }>(sql`
      select exists (
        select 1 from pg_extension e
          join pg_attribute a on a.attrelid = 'document_chunk'::regclass and a.attname = 'embedding_v'
         where e.extname = 'vector' and a.attnum > 0 and not a.attisdropped
      ) as ok
    `);
    cached = Array.from(rows)[0]?.ok === true;
  } catch {
    cached = false;
  }
  return cached;
}

/** 다음 `hasVector()` 가 다시 보게 한다 — 확장을 켠 직후에 부른다. */
export function forgetVectorSupport(): void {
  cached = null;
}

export type VectorSync = {
  extension: boolean;
  column: boolean;
  index: boolean;
  backfilled: number;
};

/**
 * 확장이 있으면 칼럼·색인·채워넣기를 맞춘다. 없으면 아무것도 하지 않고 그렇다고 알린다.
 * 여러 번 불러도 안전하다.
 */
export async function syncVectorColumn(): Promise<VectorSync> {
  const extension = await db
    .execute<{ ok: boolean }>(
      sql`select exists (select 1 from pg_extension where extname = 'vector') as ok`,
    )
    .then((rows) => Array.from(rows)[0]?.ok === true)
    .catch(() => false);

  if (!extension) return { extension: false, column: false, index: false, backfilled: 0 };

  // 동적 SQL 로 돈다 — `vector` 타입은 확장이 켜진 뒤에야 파싱된다.
  await db.execute(
    sql.raw(
      `alter table document_chunk add column if not exists embedding_v vector(${EMBEDDING_DIMENSIONS})`,
    ),
  );
  // HNSW: 색인을 만드는 데 시간이 걸리지만 가족 규모에서는 순식간이고, 찾기가 훨씬 빠르다.
  await db.execute(
    sql.raw(
      `create index if not exists document_chunk_vector_idx
         on document_chunk using hnsw (embedding_v vector_cosine_ops)`,
    ),
  );

  // 확장을 늦게 켠 경우 — 이미 있는 임베딩을 옮겨 준다. 다시 임베딩할 필요가 없다.
  const moved = await db.execute<{ moved: number }>(
    sql.raw(`with promoted as (
        update document_chunk
           set embedding_v = embedding::vector(${EMBEDDING_DIMENSIONS})
         where embedding is not null
           and embedding_v is null
           and array_length(embedding, 1) = ${EMBEDDING_DIMENSIONS}
        returning 1
      ) select count(*)::int as moved from promoted`),
  );

  forgetVectorSupport();
  return {
    extension: true,
    column: true,
    index: true,
    backfilled: Array.from(moved)[0]?.moved ?? 0,
  };
}
