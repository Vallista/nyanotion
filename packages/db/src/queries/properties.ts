import { positionAfterLast, positionBetween } from "@nyanotion/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import {
  collection,
  collectionItem,
  document,
  property,
  propertyValue,
  PROPERTY_TYPES,
  type PropertyType,
} from "../schema/index";

/**
 * 모음의 속성과 값. 노션의 "데이터베이스"에 해당한다.
 *
 * **문서의 자리는 여전히 트리 하나뿐이다.** 모음에 담긴다는 건 그 표에 줄로 나온다는 뜻이고,
 * 한 문서가 여러 표에 나올 수 있다.
 */

export type PropertyDef = {
  id: string;
  name: string;
  type: PropertyType;
  config: Record<string, unknown>;
  position: number;
};

export type SelectOption = { id: string; name: string; color: string | null };

function asType(value: unknown): PropertyType {
  return typeof value === "string" && (PROPERTY_TYPES as readonly string[]).includes(value)
    ? (value as PropertyType)
    : "text";
}

function asConfig(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** select 속성의 선택지. jsonb 라 모양을 믿지 않고 읽는다. */
export function selectOptions(config: Record<string, unknown>): SelectOption[] {
  const raw = config.options;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      name: typeof item.name === "string" ? item.name : "",
      color: typeof item.color === "string" ? item.color : null,
    }))
    .filter((item) => item.id !== "" && item.name !== "");
}

export async function listProperties(collectionId: string): Promise<PropertyDef[]> {
  const rows = await db
    .select()
    .from(property)
    .where(eq(property.collectionId, collectionId))
    .orderBy(asc(property.position), asc(property.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: asType(row.type),
    config: asConfig(row.config),
    position: row.position,
  }));
}

export async function addProperty(input: {
  collectionId: string;
  name: string;
  type: PropertyType;
  config?: Record<string, unknown>;
}): Promise<string> {
  const existing = await db
    .select({ max: sql<number>`coalesce(max(${property.position}), -1)::int` })
    .from(property)
    .where(eq(property.collectionId, input.collectionId));
  const id = newId();
  await db.insert(property).values({
    id,
    collectionId: input.collectionId,
    name: input.name.trim().slice(0, 40) || "속성",
    type: input.type,
    config: input.config ?? {},
    position: (existing[0]?.max ?? -1) + 1,
  });
  return id;
}

export async function updateProperty(
  id: string,
  collectionId: string,
  patch: { name?: string; type?: PropertyType; config?: Record<string, unknown> },
): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim().slice(0, 40);
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.config !== undefined) values.config = patch.config;
  if (Object.keys(values).length === 0) return;
  await db
    .update(property)
    .set(values)
    .where(and(eq(property.id, id), eq(property.collectionId, collectionId)));
}

/** 속성을 지우면 그 값들도 함께 사라진다 (cascade). 문서는 그대로다. */
export async function deleteProperty(id: string, collectionId: string): Promise<void> {
  await db
    .delete(property)
    .where(and(eq(property.id, id), eq(property.collectionId, collectionId)));
}

/** select 속성에 선택지 하나 더하기. 같은 이름이 있으면 그걸 쓴다. */
export async function ensureSelectOption(
  propertyId: string,
  collectionId: string,
  name: string,
): Promise<string> {
  const clean = name.trim().slice(0, 40);
  if (clean === "") throw new Error("선택지 이름이 비었습니다.");

  const rows = await db
    .select({ config: property.config })
    .from(property)
    .where(and(eq(property.id, propertyId), eq(property.collectionId, collectionId)))
    .limit(1);
  const config = asConfig(rows[0]?.config);
  const options = selectOptions(config);
  const found = options.find((item) => item.name === clean);
  if (found !== undefined) return found.id;

  const id = newId().slice(0, 10);
  const next = [...options, { id, name: clean, color: null }];
  await db
    .update(property)
    .set({ config: { ...config, options: next } })
    .where(eq(property.id, propertyId));
  return id;
}

/* ------------------------------------------------------------------- 값 */

/** 문서 여러 개의 속성 값을 한 번에. 표를 그릴 때 N+1 을 만들지 않기 위해. */
export async function valuesForDocuments(
  documentIds: readonly string[],
  propertyIds: readonly string[],
): Promise<Map<string, Map<string, unknown>>> {
  const out = new Map<string, Map<string, unknown>>();
  if (documentIds.length === 0 || propertyIds.length === 0) return out;

  const rows = await db
    .select({
      documentId: propertyValue.documentId,
      propertyId: propertyValue.propertyId,
      value: propertyValue.value,
    })
    .from(propertyValue)
    .where(
      and(
        inArray(propertyValue.documentId, [...documentIds]),
        inArray(propertyValue.propertyId, [...propertyIds]),
      ),
    );

  for (const row of rows) {
    const byProperty = out.get(row.documentId) ?? new Map<string, unknown>();
    byProperty.set(row.propertyId, row.value);
    out.set(row.documentId, byProperty);
  }
  return out;
}

/** 값 하나 쓰기. null 이면 지운다 — 빈 칸과 "값이 없음"을 같게 둔다. */
export async function setPropertyValue(
  documentId: string,
  propertyId: string,
  value: unknown,
): Promise<void> {
  if (value === null || value === undefined || value === "") {
    await db
      .delete(propertyValue)
      .where(
        and(eq(propertyValue.documentId, documentId), eq(propertyValue.propertyId, propertyId)),
      );
    return;
  }
  await db
    .insert(propertyValue)
    .values({ documentId, propertyId, value })
    .onConflictDoUpdate({
      target: [propertyValue.documentId, propertyValue.propertyId],
      set: { value, updatedAt: new Date() },
    });
}

/** 이 속성이 어느 모음의 것인지 — 권한 확인에 쓴다. */
export async function collectionOfProperty(propertyId: string): Promise<string | null> {
  const rows = await db
    .select({ collectionId: property.collectionId })
    .from(property)
    .where(eq(property.id, propertyId))
    .limit(1);
  return rows[0]?.collectionId ?? null;
}

/* --------------------------------------------------------- 손으로 담는 줄 */

export async function listCollectionItems(
  collectionId: string,
): Promise<{ documentId: string; position: string }[]> {
  return db
    .select({ documentId: collectionItem.documentId, position: collectionItem.position })
    .from(collectionItem)
    .innerJoin(document, eq(document.id, collectionItem.documentId))
    .where(and(eq(collectionItem.collectionId, collectionId), sql`${document.archivedAt} is null`))
    .orderBy(asc(collectionItem.position));
}

export async function addToCollection(collectionId: string, documentId: string): Promise<void> {
  const rows = await db
    .select({ position: collectionItem.position })
    .from(collectionItem)
    .where(eq(collectionItem.collectionId, collectionId))
    .orderBy(asc(collectionItem.position));
  const last = rows[rows.length - 1]?.position ?? null;
  await db
    .insert(collectionItem)
    .values({ collectionId, documentId, position: positionAfterLast(last) })
    .onConflictDoNothing();
}

/** 표에서 빼는 것일 뿐 문서는 그대로 남는다. */
export async function removeFromCollection(
  collectionId: string,
  documentId: string,
): Promise<void> {
  await db
    .delete(collectionItem)
    .where(
      and(
        eq(collectionItem.collectionId, collectionId),
        eq(collectionItem.documentId, documentId),
      ),
    );
}

export async function moveInCollection(
  collectionId: string,
  documentId: string,
  afterDocumentId: string | null,
): Promise<void> {
  const rows = await db
    .select({ documentId: collectionItem.documentId, position: collectionItem.position })
    .from(collectionItem)
    .where(eq(collectionItem.collectionId, collectionId))
    .orderBy(asc(collectionItem.position));
  const others = rows.filter((row) => row.documentId !== documentId);
  const index =
    afterDocumentId === null ? -1 : others.findIndex((row) => row.documentId === afterDocumentId);
  const before = index >= 0 ? (others[index]?.position ?? null) : null;
  const after = others[index + 1]?.position ?? null;
  await db
    .update(collectionItem)
    .set({ position: positionBetween(before, after) })
    .where(
      and(
        eq(collectionItem.collectionId, collectionId),
        eq(collectionItem.documentId, documentId),
      ),
    );
}

/** 이 모음이 손으로 담는 것인지. */
export async function collectionSource(collectionId: string): Promise<"filter" | "manual"> {
  const rows = await db
    .select({ source: collection.source })
    .from(collection)
    .where(eq(collection.id, collectionId))
    .limit(1);
  return rows[0]?.source === "manual" ? "manual" : "filter";
}
