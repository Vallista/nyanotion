import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { document, documentTag, favorite, tag } from "../schema/index";

/* ------------------------------------------------------------------ 태그 */

export type TagWithCount = { id: string; name: string; color: string | null; count: number };

/** space 의 태그와 각각 달린 문서 수. 모래상자에 있는 문서는 세지 않는다. */
export async function listTags(spaceId: string): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: tag.id,
      name: tag.name,
      color: tag.color,
      count: sql<number>`count(${documentTag.documentId}) filter (where ${document.archivedAt} is null)::int`,
    })
    .from(tag)
    .leftJoin(documentTag, eq(documentTag.tagId, tag.id))
    .leftJoin(document, eq(document.id, documentTag.documentId))
    .where(eq(tag.spaceId, spaceId))
    .groupBy(tag.id, tag.name, tag.color)
    .orderBy(asc(tag.name));
  return rows;
}

/** 같은 이름이 있으면 그걸 쓴다 — 태그가 조용히 둘로 갈리지 않게. */
export async function ensureTag(
  spaceId: string,
  name: string,
  color?: string | null,
): Promise<string> {
  const clean = name.trim().slice(0, 40);
  if (clean === "") throw new Error("태그 이름이 비었습니다.");

  const existing = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.spaceId, spaceId), eq(tag.name, clean)))
    .limit(1);
  const found = existing[0];
  if (found !== undefined) return found.id;

  const id = newId();
  await db.insert(tag).values({ id, spaceId, name: clean, color: color ?? null });
  return id;
}

export async function renameTag(id: string, spaceId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (clean === "") return;
  await db
    .update(tag)
    .set({ name: clean })
    .where(and(eq(tag.id, id), eq(tag.spaceId, spaceId)));
}

/** 태그를 지우면 문서에서 떨어질 뿐 문서는 남는다 (document_tag 는 cascade). */
export async function deleteTag(id: string, spaceId: string): Promise<void> {
  await db.delete(tag).where(and(eq(tag.id, id), eq(tag.spaceId, spaceId)));
}

export async function attachTag(documentId: string, tagId: string): Promise<void> {
  await db.insert(documentTag).values({ documentId, tagId }).onConflictDoNothing();
}

export async function detachTag(documentId: string, tagId: string): Promise<void> {
  await db
    .delete(documentTag)
    .where(and(eq(documentTag.documentId, documentId), eq(documentTag.tagId, tagId)));
}

/** 문서 여러 개의 태그를 한 번에. 목록 화면에서 N+1 을 만들지 않기 위해. */
export async function tagsForDocuments(
  documentIds: readonly string[],
): Promise<Map<string, { id: string; name: string; color: string | null }[]>> {
  const result = new Map<string, { id: string; name: string; color: string | null }[]>();
  if (documentIds.length === 0) return result;

  const rows = await db
    .select({
      documentId: documentTag.documentId,
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })
    .from(documentTag)
    .innerJoin(tag, eq(tag.id, documentTag.tagId))
    .where(inArray(documentTag.documentId, [...documentIds]))
    .orderBy(asc(tag.name));

  for (const row of rows) {
    const list = result.get(row.documentId);
    const entry = { id: row.id, name: row.name, color: row.color };
    if (list === undefined) result.set(row.documentId, [entry]);
    else list.push(entry);
  }
  return result;
}

/** 이 태그가 달린 살아 있는 문서들. */
export async function documentsWithTag(
  spaceId: string,
  tagId: string,
): Promise<{ id: string; title: string; updatedAt: Date }[]> {
  return db
    .select({ id: document.id, title: document.title, updatedAt: document.updatedAt })
    .from(document)
    .innerJoin(documentTag, eq(documentTag.documentId, document.id))
    .where(
      and(eq(document.spaceId, spaceId), eq(documentTag.tagId, tagId), isNull(document.archivedAt)),
    )
    .orderBy(desc(document.updatedAt));
}

/* ------------------------------------------------------- 츄르 (즐겨찾기) */

export async function listFavorites(
  userId: string,
  spaceId: string,
): Promise<{ id: string; title: string; icon: string | null }[]> {
  return db
    .select({ id: document.id, title: document.title, icon: document.icon })
    .from(favorite)
    .innerJoin(document, eq(document.id, favorite.documentId))
    .where(
      and(eq(favorite.userId, userId), eq(document.spaceId, spaceId), isNull(document.archivedAt)),
    )
    .orderBy(asc(favorite.position), asc(favorite.createdAt));
}

export async function isFavorite(userId: string, documentId: string): Promise<boolean> {
  const rows = await db
    .select({ documentId: favorite.documentId })
    .from(favorite)
    .where(and(eq(favorite.userId, userId), eq(favorite.documentId, documentId)))
    .limit(1);
  return rows.length > 0;
}

/** 켜고 끈다. 돌려주는 값은 **바뀐 뒤** 상태. */
export async function toggleFavorite(userId: string, documentId: string): Promise<boolean> {
  if (await isFavorite(userId, documentId)) {
    await db
      .delete(favorite)
      .where(and(eq(favorite.userId, userId), eq(favorite.documentId, documentId)));
    return false;
  }
  const next = await db
    .select({ max: sql<number>`coalesce(max(${favorite.position}), -1)::int` })
    .from(favorite)
    .where(eq(favorite.userId, userId));
  await db
    .insert(favorite)
    .values({ userId, documentId, position: (next[0]?.max ?? -1) + 1 })
    .onConflictDoNothing();
  return true;
}
