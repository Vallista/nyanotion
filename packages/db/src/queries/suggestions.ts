import { eq } from "drizzle-orm";
import { db } from "../client";
import { document } from "../schema/document";
import { documentSuggestion } from "../schema/suggestion";
import { attachTag, ensureTag } from "./tagging";

export type SuggestionRow = {
  documentId: string;
  title: string;
  tags: string[];
  model: string;
  createdAt: Date;
};

/** 새 제안이 옛 제안을 덮는다 — 문서 하나에 기다리는 제안은 하나뿐이다. */
export async function putSuggestion(
  documentId: string,
  suggestion: { title: string; tags: readonly string[] },
  model: string,
): Promise<void> {
  await db
    .insert(documentSuggestion)
    .values({
      documentId,
      title: suggestion.title,
      tags: [...suggestion.tags],
      model,
    })
    .onConflictDoUpdate({
      target: documentSuggestion.documentId,
      set: { title: suggestion.title, tags: [...suggestion.tags], model, createdAt: new Date() },
    });
}

export async function getSuggestion(documentId: string): Promise<SuggestionRow | null> {
  const rows = await db
    .select()
    .from(documentSuggestion)
    .where(eq(documentSuggestion.documentId, documentId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    documentId: row.documentId,
    title: row.title,
    tags: row.tags,
    model: row.model,
    createdAt: row.createdAt,
  };
}

export async function dismissSuggestion(documentId: string): Promise<void> {
  await db.delete(documentSuggestion).where(eq(documentSuggestion.documentId, documentId));
}

export type Accepted = { title: string | null; tags: string[] };

/**
 * 제안을 반영한다. **사람이 고른 것만** 반영한다 — 제목만 받고 태그는 버릴 수 있다.
 * 반영하든 안 하든 제안은 사라진다 (다음 편집이 새 제안을 만든다).
 */
export async function acceptSuggestion(
  documentId: string,
  spaceId: string,
  userId: string,
  take: { title: boolean; tags: boolean },
): Promise<Accepted> {
  const suggestion = await getSuggestion(documentId);
  if (suggestion === null) return { title: null, tags: [] };

  let title: string | null = null;
  if (take.title && suggestion.title !== "") {
    await db
      .update(document)
      .set({ title: suggestion.title, updatedBy: userId, updatedAt: new Date() })
      .where(eq(document.id, documentId));
    title = suggestion.title;
  }

  const tags: string[] = [];
  if (take.tags) {
    for (const name of suggestion.tags) {
      const tagId = await ensureTag(spaceId, name);
      await attachTag(documentId, tagId);
      tags.push(name);
    }
  }

  await dismissSuggestion(documentId);
  return { title, tags };
}
