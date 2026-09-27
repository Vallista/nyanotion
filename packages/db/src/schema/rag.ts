import { relations, sql } from "drizzle-orm";
import { index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { document } from "./document";

/**
 * 문서에 질문하기(M6)를 받치는 두 표.
 *
 * **왜 큐가 필요한가** — 임베딩은 GPU 를 쓴다. 그런데 이 집의 GPU 는 게임도 돌린다
 * (`ARCHITECTURE.md` §9). 저장할 때 그 자리에서 임베딩하면 타자가 멈추고, 게임 중에는
 * 저장 자체가 실패한다. 그래서 저장은 **할 일만 적어 두고** 끝내고, 워커가 한가할 때 가져간다.
 */

/** queued 만이 대기다. running 은 워커가 들고 있는 것, done/failed 는 흔적. */
export const AI_JOB_STATES = ["queued", "running", "done", "failed"] as const;
export type AiJobState = (typeof AI_JOB_STATES)[number];

/**
 *  index    본문을 토막내어 임베딩한다 (검색·질의의 재료)
 *  suggest  태그·제목을 추천한다 — **사람이 수락해야 반영된다**
 */
export const AI_JOB_KINDS = ["index", "suggest"] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

export const aiJob = pgTable(
  "ai_job",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    /**
     * 이때까지는 건드리지 않는다. 타자를 치는 동안 저장이 여러 번 일어나므로,
     * 새 저장이 올 때마다 이 시각을 미뤄서 **편집이 멈춘 뒤에** 한 번만 돌게 한다.
     */
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * **한 문서에 대기 중인 같은 종류의 일은 하나뿐이다.** 이것이 디바운스의 핵심 —
     * 스무 번 저장해도 줄은 하나고, `run_after` 만 계속 밀린다.
     * 부분 인덱스라 running/done/failed 는 여러 줄이어도 괜찮다.
     */
    uniqueIndex("ai_job_pending_idx")
      .on(t.kind, t.documentId)
      .where(sql`${t.state} = 'queued'`),
    index("ai_job_claim_idx").on(t.runAfter).where(sql`${t.state} = 'queued'`),
  ],
);

/**
 * 문서 한 토막과 그 임베딩.
 *
 * **`embedding` 은 `real[]` 이다.** pgvector 로 두지 않은 이유가 있다 — `vector` 확장은
 * 슈퍼유저만 켤 수 있어서, 새 컴퓨터·CI·백업 복구에서는 없을 수 있다. 그때도 문서 질의가
 * 돌아야 하므로 원본은 확장 없이 저장하고, 확장이 있으면 `embedding_v vector(1024)` 칼럼과
 * HNSW 색인을 **덧붙여** 빠르게 쓴다 (`syncVectorColumn()`). 원본은 언제나 이 칼럼이다.
 */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** 문서 안 순서. `(document_id, chunk_index)` 가 토막의 신원이다. */
    chunkIndex: integer("chunk_index").notNull(),
    /** 근거로 점프할 블록. 빈 문자열이면 문서 맨 위로. */
    blockId: text("block_id").notNull().default(""),
    /** 이 토막이 속한 마지막 제목 — 답변에 맥락을 준다. */
    heading: text("heading").notNull().default(""),
    text: text("text").notNull(),
    /** 글이 안 바뀐 토막은 다시 임베딩하지 않는다. GPU 를 아끼는 유일한 수단. */
    contentHash: text("content_hash").notNull(),
    embedding: real("embedding").array(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("document_chunk_slot_idx").on(t.documentId, t.chunkIndex),
    index("document_chunk_doc_idx").on(t.documentId),
  ],
);

export const aiJobRelations = relations(aiJob, ({ one }) => ({
  document: one(document, { fields: [aiJob.documentId], references: [document.id] }),
}));

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(document, { fields: [documentChunk.documentId], references: [document.id] }),
}));

export type AiJob = typeof aiJob.$inferSelect;
export type DocumentChunkRow = typeof documentChunk.$inferSelect;
