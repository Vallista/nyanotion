import { createHash } from "node:crypto";
import { chunkDocument, type DocumentChunk } from "@nyanotion/shared";
import { embedTexts } from "@nyanotion/ai";
import { eq } from "drizzle-orm";
import {
  chunkCount,
  db,
  document,
  storedChunks,
  trimChunks,
  upsertChunk,
} from "@nyanotion/db";

/**
 * 문서 하나를 색인한다. **안 바뀐 토막은 다시 임베딩하지 않는다** — 그것이 이 파일의 전부다.
 *
 * 한 글자 고칠 때마다 문서 전체를 다시 임베딩하면 GPU 가 종일 돈다. 그래서 토막마다
 * 글의 지문(sha256)을 두고, 자리(`chunk_index`)와 지문이 둘 다 같은 토막은 건너뛴다.
 * 자리만 같고 글이 다르면 새로 임베딩하고, 문서가 짧아져 남은 뒷토막은 지운다.
 */

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}

export type IndexResult = {
  documentId: string;
  chunks: number;
  embedded: number;
  reused: number;
  removed: number;
  /** 본문이 비어 색인할 것이 없었다. */
  empty: boolean;
};

export async function indexDocument(documentId: string): Promise<IndexResult> {
  const rows = await db
    .select({
      title: document.title,
      contentJson: document.contentJson,
      archivedAt: document.archivedAt,
    })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);
  const row = rows[0];

  // 문서가 사라졌거나 모래상자로 갔으면 색인도 치운다 — 지운 글이 근거로 나오면 안 된다.
  if (row === undefined || row.archivedAt !== null) {
    const removed = await trimChunks(documentId, 0);
    return { documentId, chunks: 0, embedded: 0, reused: 0, removed, empty: true };
  }

  const chunks: DocumentChunk[] = chunkDocument(row.title, row.contentJson);
  if (chunks.length === 0) {
    const removed = await trimChunks(documentId, 0);
    return { documentId, chunks: 0, embedded: 0, reused: 0, removed, empty: true };
  }

  const known = new Map(
    (await storedChunks(documentId)).map((stored) => [stored.chunkIndex, stored]),
  );

  const hashes = chunks.map((chunk) => hashText(chunk.text));
  const stale: number[] = [];
  for (const [at, chunk] of chunks.entries()) {
    const stored = known.get(chunk.index);
    const same = stored !== undefined && stored.contentHash === hashes[at] && stored.hasEmbedding;
    if (!same) stale.push(at);
  }

  // 바뀐 토막만 한 번에 임베딩한다. 게임 중이면 여기서 AiBusyError 가 나고,
  // 부르는 쪽(워커)이 일을 큐에 되돌린다 — 반쯤 색인된 상태로 남지 않는다.
  const vectors =
    stale.length === 0
      ? []
      : await embedTexts(stale.map((at) => chunks[at]?.text ?? ""));

  const fresh = new Map<number, number[]>();
  for (const [slot, at] of stale.entries()) {
    const vector = vectors[slot];
    if (vector !== undefined) fresh.set(at, vector);
  }

  for (const [at, chunk] of chunks.entries()) {
    await upsertChunk(documentId, {
      chunkIndex: chunk.index,
      blockId: chunk.blockId,
      heading: chunk.heading,
      text: chunk.text,
      contentHash: hashes[at] ?? "",
      embedding: fresh.get(at) ?? null,
    });
  }

  const removed = await trimChunks(documentId, chunks.length);
  return {
    documentId,
    chunks: await chunkCount(documentId),
    embedded: fresh.size,
    reused: chunks.length - fresh.size,
    removed,
    empty: false,
  };
}
