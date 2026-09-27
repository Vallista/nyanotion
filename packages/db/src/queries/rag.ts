import { eq, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { aiJob, documentChunk, type AiJobKind } from "../schema/rag";
import { document } from "../schema/document";
import { EMBEDDING_DIMENSIONS, hasVector } from "../vector";

/* ------------------------------------------------------------------ 큐 */

/**
 * 할 일을 적어 둔다. **이미 대기 중이면 시각만 미룬다** — 타자를 치는 동안 저장이
 * 스무 번 일어나도 줄은 하나고, 편집이 멈춘 뒤에 한 번만 돈다 (`ai_job_pending_idx`).
 */
export async function enqueueJob(
  kind: AiJobKind,
  documentId: string,
  delayMs = 20_000,
): Promise<void> {
  // 날 것 SQL 에서는 Date 를 그대로 넣을 수 없다 — 드라이버가 칼럼 타입을 모른다.
  const at = new Date(Date.now() + Math.max(0, delayMs)).toISOString();
  await db.execute(sql`
    insert into ${aiJob} (id, kind, document_id, state, run_after)
    values (${newId()}, ${kind}, ${documentId}, 'queued', ${at}::timestamptz)
    on conflict (kind, document_id) where state = 'queued'
      do update set run_after = ${at}::timestamptz, updated_at = now()
  `);
}

/**
 * 제목·태그 추천은 **쓸모가 있을 때만** 줄에 세운다.
 *
 * 저장마다 모델을 부르면 GPU 가 종일 돌고, 이미 제목과 태그가 있는 문서에는 추천이 방해다.
 * 그래서 조건을 SQL 안에 둔다 — 제목이 없거나 태그가 하나도 없고, 본문이 어느 정도 있을 때만.
 */
export async function enqueueSuggestIfUseful(
  documentId: string,
  delayMs = 180_000,
): Promise<void> {
  const at = new Date(Date.now() + Math.max(0, delayMs)).toISOString();
  await db.execute(sql`
    insert into ${aiJob} (id, kind, document_id, state, run_after)
    select ${newId()}, 'suggest', d.id, 'queued', ${at}::timestamptz
      from ${document} d
     where d.id = ${documentId}
       and d.archived_at is null
       and length(d.text_plain) >= 200
       and (
         d.title = ''
         or not exists (select 1 from document_tag dt where dt.document_id = d.id)
       )
    on conflict (kind, document_id) where state = 'queued'
      do update set run_after = ${at}::timestamptz, updated_at = now()
  `);
}

export type ClaimedJob = {
  id: string;
  kind: AiJobKind;
  documentId: string;
  attempts: number;
};

/**
 * 일 하나를 집어 온다. `for update skip locked` 라서 워커를 여럿 띄워도 같은 일을 두 번
 * 하지 않는다 (지금은 하나지만, 그것에 기대는 코드를 쓰지 않는다).
 */
export async function claimJob(kinds: readonly AiJobKind[]): Promise<ClaimedJob | null> {
  if (kinds.length === 0) return null;
  const rows = await db.execute<{
    id: string;
    kind: AiJobKind;
    document_id: string;
    attempts: number;
  }>(sql`
    with picked as (
      select j.id from ${aiJob} j
       where j.state = 'queued'
         and j.kind in ${[...kinds]}
         and j.run_after <= now()
       order by j.run_after
       limit 1
       for update skip locked
    )
    update ${aiJob} j
       set state = 'running', attempts = j.attempts + 1, updated_at = now()
      from picked
     where j.id = picked.id
    returning j.id, j.kind, j.document_id, j.attempts
  `);
  const row = Array.from(rows)[0];
  if (row === undefined) return null;
  return { id: row.id, kind: row.kind, documentId: row.document_id, attempts: row.attempts };
}

export async function finishJob(id: string): Promise<void> {
  await db
    .update(aiJob)
    .set({ state: "done", lastError: "", updatedAt: new Date() })
    .where(eq(aiJob.id, id));
}

/**
 * 실패. 세 번까지는 잠시 뒤 다시 줄에 세우고, 그 뒤로는 포기하고 이유를 남긴다.
 * **포기한 일을 조용히 지우지 않는다** — 왜 색인이 안 됐는지 사람이 볼 수 있어야 한다.
 */
export async function failJob(id: string, reason: string, maxAttempts = 3): Promise<void> {
  const trimmed = reason.slice(0, 500);
  await db.execute(sql`
    update ${aiJob}
       set state = case when attempts >= ${maxAttempts} then 'failed' else 'queued' end,
           run_after = now() + interval '2 minutes',
           last_error = ${trimmed},
           updated_at = now()
     where id = ${id}
  `);
}

/**
 * **이 일의 잘못이 아닐 때** 줄로 되돌린다 — 게임 중이거나 모델이 안 떠 있는 경우.
 * 시도 횟수를 늘리지 않으므로 포기하지 않는다. 문서는 그대로 있으니 나중에 하면 된다.
 */
export async function requeueJob(id: string, delayMs: number, note: string): Promise<void> {
  const runAfter = new Date(Date.now() + Math.max(0, delayMs));
  await db
    .update(aiJob)
    .set({
      state: "queued",
      attempts: 0,
      runAfter,
      lastError: note.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(aiJob.id, id));
}

/** 끝난 일은 며칠 뒤 치운다. 실패는 남긴다 — 사람이 봐야 하는 흔적이다. */
export async function pruneJobs(olderThanDays = 3): Promise<number> {
  const rows = await db.execute<{ gone: number }>(sql`
    with removed as (
      delete from ${aiJob}
       where state = 'done'
         and updated_at < now() - make_interval(days => ${olderThanDays})
      returning 1
    ) select count(*)::int as gone from removed
  `);
  return Array.from(rows)[0]?.gone ?? 0;
}

export type QueueDepth = { queued: number; running: number; failed: number };

export async function queueDepth(): Promise<QueueDepth> {
  const rows = await db.execute<{ state: string; n: number }>(sql`
    select state, count(*)::int as n from ${aiJob} group by state
  `);
  const counts: QueueDepth = { queued: 0, running: 0, failed: 0 };
  for (const row of Array.from(rows)) {
    if (row.state === "queued") counts.queued = row.n;
    else if (row.state === "running") counts.running = row.n;
    else if (row.state === "failed") counts.failed = row.n;
  }
  return counts;
}

/** 아직 한 번도 색인하지 않은 문서에 일감을 깔아 둔다 (첫 실행·모델 교체 뒤). */
export async function enqueueUnindexed(limit = 200): Promise<number> {
  const rows = await db.execute<{ added: number }>(sql`
    with missing as (
      select d.id from ${document} d
       where d.archived_at is null
         and d.text_plain <> ''
         and not exists (select 1 from ${documentChunk} c where c.document_id = d.id)
         and not exists (
           select 1 from ${aiJob} j
            where j.document_id = d.id and j.kind = 'index' and j.state in ('queued', 'running')
         )
       limit ${limit}
    ),
    added as (
      insert into ${aiJob} (id, kind, document_id, state, run_after)
      select md5(random()::text || m.id), 'index', m.id, 'queued', now()
        from missing m
      on conflict (kind, document_id) where state = 'queued' do nothing
      returning 1
    ) select count(*)::int as added from added
  `);
  return Array.from(rows)[0]?.added ?? 0;
}

/* --------------------------------------------------------------- 토막 */

/**
 * 숫자 배열을 Postgres 배열 리터럴로. **드리즐의 `sql` 템플릿은 JS 배열을 파라미터 목록으로
 * 펼친다** (`in ${ids}` 가 그렇게 동작한다) — 그래서 임베딩을 그냥 넣으면 record 가 되어
 * `real[]` 칼럼에 안 들어간다. 글로 만들어 넣고 캐스트한다.
 */
function realArrayLiteral(values: readonly number[]): string {
  return `{${values.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}}`;
}

export type StoredChunk = {
  chunkIndex: number;
  contentHash: string;
  hasEmbedding: boolean;
};

/** 이미 색인된 토막들의 지문. 안 바뀐 것은 다시 임베딩하지 않는다. */
export async function storedChunks(documentId: string): Promise<StoredChunk[]> {
  const rows = await db
    .select({
      chunkIndex: documentChunk.chunkIndex,
      contentHash: documentChunk.contentHash,
      embedding: documentChunk.embedding,
    })
    .from(documentChunk)
    .where(eq(documentChunk.documentId, documentId));
  return rows.map((row) => ({
    chunkIndex: row.chunkIndex,
    contentHash: row.contentHash,
    hasEmbedding: row.embedding !== null && row.embedding.length > 0,
  }));
}

export type ChunkWrite = {
  chunkIndex: number;
  blockId: string;
  heading: string;
  text: string;
  contentHash: string;
  /** null 이면 임베딩은 건드리지 않는다 (글이 안 바뀐 토막). */
  embedding: readonly number[] | null;
};

/**
 * 토막 하나를 제자리에 쓴다. `(document_id, chunk_index)` 가 자리이므로 문서를 고쳐도
 * 줄이 늘어나지 않는다. pgvector 가 켜져 있으면 벡터 칼럼까지 같이 맞춘다.
 */
export async function upsertChunk(documentId: string, chunk: ChunkWrite): Promise<void> {
  const embedding = chunk.embedding === null ? null : [...chunk.embedding];
  if (embedding !== null && embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `임베딩 차원이 ${embedding.length} 입니다 — ${EMBEDDING_DIMENSIONS} 이어야 합니다.`,
    );
  }

  // `embedding` 이 null 이면 기존 값을 지우지 않는다 (글이 안 바뀐 토막).
  await db.execute(sql`
    insert into ${documentChunk}
      (id, document_id, chunk_index, block_id, heading, text, content_hash, embedding, indexed_at)
    values (${newId()}, ${documentId}, ${chunk.chunkIndex}, ${chunk.blockId}, ${chunk.heading},
            ${chunk.text}, ${chunk.contentHash},
            ${embedding === null ? null : realArrayLiteral(embedding)}::real[], now())
    on conflict (document_id, chunk_index) do update
      set block_id = excluded.block_id,
          heading = excluded.heading,
          text = excluded.text,
          content_hash = excluded.content_hash,
          embedding = coalesce(excluded.embedding, document_chunk.embedding),
          indexed_at = now()
  `);

  if (await hasVector()) {
    await db.execute(sql`
      update ${documentChunk}
         set embedding_v = embedding::vector(${sql.raw(String(EMBEDDING_DIMENSIONS))})
       where document_id = ${documentId}
         and chunk_index = ${chunk.chunkIndex}
         and embedding is not null
    `);
  }
}

/** 문서가 짧아져 남은 뒷토막들을 치운다. */
export async function trimChunks(documentId: string, keepCount: number): Promise<number> {
  const rows = await db.execute<{ gone: number }>(sql`
    with removed as (
      delete from ${documentChunk}
       where document_id = ${documentId} and chunk_index >= ${keepCount}
      returning 1
    ) select count(*)::int as gone from removed
  `);
  return Array.from(rows)[0]?.gone ?? 0;
}

export async function chunkCount(documentId: string): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from ${documentChunk} where document_id = ${documentId}
  `);
  return Array.from(rows)[0]?.n ?? 0;
}

/* ------------------------------------------------------ 하이브리드 검색 */

export type Passage = {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  blockId: string;
  heading: string;
  text: string;
  /** 합친 점수 (RRF). 절대값에는 뜻이 없고 순서에만 뜻이 있다. */
  score: number;
  /** 어느 길로 들어왔는지 — 화면과 캐내기(디버깅)에 쓴다. */
  lexicalRank: number | null;
  semanticRank: number | null;
};

export type RetrieveOptions = {
  /** **읽을 수 있는 문서만.** 비어 있으면 아무것도 돌려주지 않는다 (열린 기본값 금지). */
  documentIds: readonly string[];
  query: string;
  /** 질문의 임베딩. 없으면 어휘 검색만 한다 (GPU 가 게임 중일 때). */
  queryEmbedding?: readonly number[] | null;
  limit?: number;
  /** 각 길에서 몇 개까지 볼지. */
  candidates?: number;
};

/** 벡터 리터럴. pgvector 는 매개변수로 배열을 못 받으니 글로 만들어 넣는다. */
function vectorLiteral(values: readonly number[]): string {
  const safe = values.map((value) => (Number.isFinite(value) ? value : 0));
  return `[${safe.join(",")}]`;
}

/**
 * 어휘 검색과 벡터 검색을 **각각의 순위로** 뽑아 RRF 로 합친다.
 *
 * 왜 점수를 더하지 않고 순위를 쓰는가 — tsvector 의 rank 와 코사인 거리는 단위가 다르다.
 * 가중치를 손으로 맞추면 문서가 늘 때마다 다시 맞춰야 한다. RRF(`1/(k+순위)`) 는
 * 단위를 버리고 순위만 보므로 손볼 것이 없다.
 *
 * **권한은 여기서 끝난다** — `documentIds` 밖의 문서는 어느 길로도 들어오지 못한다.
 */
export async function retrievePassages(options: RetrieveOptions): Promise<Passage[]> {
  const allowed = [...new Set(options.documentIds)];
  if (allowed.length === 0) return [];

  const query = options.query.trim();
  const limit = Math.max(1, Math.min(options.limit ?? 8, 50));
  const candidates = Math.max(limit, Math.min(options.candidates ?? 40, 200));
  const embedding =
    options.queryEmbedding === undefined || options.queryEmbedding === null
      ? null
      : [...options.queryEmbedding];
  if (query === "" && embedding === null) return [];

  const rrfK = 60; // RRF 의 상수. 60 이 관례고, 이 규모에서는 값에 둔감하다.
  const useVectorColumn = embedding === null ? false : await hasVector();
  const pattern = `%${query}%`;
  const nothing = sql`select null::text as id, 0::int as rank where false`;

  /**
   * **한국어에는 형태소 분석기가 없다.** `to_tsvector('simple', ...)` 은 띄어쓰기로만 쪼개므로
   * "배추 절이는 시간" 으로는 "배추를 … 6시간" 을 못 찾는다 (조사가 붙어 토큰이 다르다).
   * 그래서 낱말마다 부분 일치를 보고, **몇 낱말이 들어 있는지**를 첫 번째 순위로 쓴다.
   * `search.ts` 가 문서 단위에서 쓰는 것과 같은 논리다.
   */
  const words = [...new Set(query.split(/\s+/).filter((word) => word.length >= 2))].slice(0, 6);
  const wordHit = (word: string) => sql`c.text ilike ${`%${word}%`}`;
  const anyWord =
    words.length === 0
      ? sql`c.text ilike ${pattern}`
      : sql.join([...words.map(wordHit), sql`c.text ilike ${pattern}`], sql` or `);
  const hitCount =
    words.length === 0
      ? sql`0`
      : sql.join(
          words.map((word) => sql`(case when ${wordHit(word)} then 1 else 0 end)`),
          sql` + `,
        );

  const lexical =
    query === ""
      ? nothing
      : sql`
          select c.id,
                 row_number() over (
                   order by (${hitCount}) desc,
                            ts_rank(to_tsvector('simple', c.text),
                                    plainto_tsquery('simple', ${query})) desc,
                            similarity(c.text, ${query}) desc
                 )::int as rank
            from ${documentChunk} c
            join ${document} d on d.id = c.document_id
           where c.document_id in ${allowed}
             and d.archived_at is null
             and (
               to_tsvector('simple', c.text) @@ plainto_tsquery('simple', ${query})
               or ${anyWord}
             )
           limit ${candidates}
        `;

  let semantic = nothing;
  if (embedding !== null && useVectorColumn) {
    const dims = sql.raw(String(EMBEDDING_DIMENSIONS));
    semantic = sql`
      select c.id,
             row_number() over (
               order by c.embedding_v <=> ${vectorLiteral(embedding)}::vector(${dims})
             )::int as rank
        from ${documentChunk} c
        join ${document} d on d.id = c.document_id
       where c.document_id in ${allowed}
         and d.archived_at is null
         and c.embedding_v is not null
       limit ${candidates}
    `;
  } else if (embedding !== null) {
    semantic = sql`
      select c.id,
             row_number() over (
               order by nyan_cosine_distance(c.embedding, ${realArrayLiteral(embedding)}::real[])
             )::int as rank
        from ${documentChunk} c
        join ${document} d on d.id = c.document_id
       where c.document_id in ${allowed}
         and d.archived_at is null
         and c.embedding is not null
       limit ${candidates}
    `;
  }

  const rows = await db.execute<{
    document_id: string;
    title: string;
    chunk_index: number;
    block_id: string;
    heading: string;
    text: string;
    score: unknown;
    lexical_rank: number | null;
    semantic_rank: number | null;
  }>(sql`
    with lexical as (${lexical}),
         semantic as (${semantic}),
         fused as (
           select coalesce(l.id, s.id) as id,
                  l.rank as lexical_rank,
                  s.rank as semantic_rank,
                  coalesce(1.0 / (${rrfK} + l.rank), 0)
                    + coalesce(1.0 / (${rrfK} + s.rank), 0) as score
             from lexical l full outer join semantic s on s.id = l.id
         )
    select c.document_id, d.title, c.chunk_index, c.block_id, c.heading, c.text,
           f.score::float8 as score, f.lexical_rank, f.semantic_rank
      from fused f
      join ${documentChunk} c on c.id = f.id
      join ${document} d on d.id = c.document_id
     order by f.score desc, c.document_id, c.chunk_index
     limit ${limit}
  `);

  return Array.from(rows).map((row) => ({
    documentId: row.document_id,
    documentTitle: row.title,
    chunkIndex: row.chunk_index,
    blockId: row.block_id,
    heading: row.heading,
    text: row.text,
    score: Number(row.score) || 0,
    lexicalRank: row.lexical_rank,
    semanticRank: row.semantic_rank,
  }));
}
