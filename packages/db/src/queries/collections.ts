import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { collection, type Collection } from "../schema/index";

/**
 * 모음 — 저장된 필터. **문서를 소유하지 않는다.** 조건에 맞는 문서를 보여 줄 뿐이고,
 * 문서의 자리는 언제나 트리 하나다. 그래서 모음을 지워도 문서는 아무 영향이 없다.
 */

export type CollectionFilter = { tagIds: string[]; query: string };
export type CollectionView = "list" | "table";

export type CollectionSummary = {
  id: string;
  name: string;
  view: CollectionView;
  filter: CollectionFilter;
};

/** jsonb 는 무엇이든 들어 있을 수 있다 — 읽을 때마다 모양을 확인한다. */
function readFilter(value: unknown): CollectionFilter {
  if (typeof value !== "object" || value === null) return { tagIds: [], query: "" };
  const raw = value as { tagIds?: unknown; query?: unknown };
  return {
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds.filter((id): id is string => typeof id === "string") : [],
    query: typeof raw.query === "string" ? raw.query : "",
  };
}

function readView(value: unknown): CollectionView {
  return value === "table" ? "table" : "list";
}

function toSummary(row: Collection): CollectionSummary {
  return {
    id: row.id,
    name: row.name,
    view: readView(row.view),
    filter: readFilter(row.filterJson),
  };
}

export async function listCollections(
  spaceIds: readonly string[],
): Promise<CollectionSummary[]> {
  if (spaceIds.length === 0) return [];
  const rows = await db
    .select()
    .from(collection)
    .where(inArray(collection.spaceId, [...spaceIds]))
    .orderBy(asc(collection.createdAt));
  return rows.map(toSummary);
}

export async function getCollection(
  id: string,
  spaceIds: readonly string[],
): Promise<CollectionSummary | null> {
  if (spaceIds.length === 0) return null;
  const rows = await db
    .select()
    .from(collection)
    .where(and(eq(collection.id, id), inArray(collection.spaceId, [...spaceIds])))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toSummary(row);
}

export async function createCollection(input: {
  spaceId: string;
  userId: string;
  name: string;
  filter: CollectionFilter;
  view?: CollectionView;
}): Promise<string> {
  const id = newId();
  await db.insert(collection).values({
    id,
    spaceId: input.spaceId,
    name: input.name.trim().slice(0, 60) || "새 모음",
    filterJson: input.filter,
    sortJson: { field: "updatedAt", direction: "desc" },
    view: input.view ?? "list",
    createdBy: input.userId,
  });
  return id;
}

export async function updateCollection(
  id: string,
  spaceIds: readonly string[],
  patch: { name?: string; filter?: CollectionFilter; view?: CollectionView },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim().slice(0, 60);
  if (patch.filter !== undefined) values.filterJson = patch.filter;
  if (patch.view !== undefined) values.view = patch.view;
  if (Object.keys(values).length === 0) return;
  await db
    .update(collection)
    .set(values)
    .where(and(eq(collection.id, id), inArray(collection.spaceId, [...spaceIds])));
}

/** 모음만 사라진다 — 문서는 건드리지 않는다. */
export async function deleteCollection(id: string, spaceIds: readonly string[]): Promise<void> {
  if (spaceIds.length === 0) return;
  await db
    .delete(collection)
    .where(and(eq(collection.id, id), inArray(collection.spaceId, [...spaceIds])));
}
