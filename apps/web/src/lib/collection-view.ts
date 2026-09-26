import {
  familyMembers,
  getCollection,
  getDocumentById,
  listCollectionItems,
  listProperties,
  selectOptions,
  valuesForDocuments,
} from "@nyanotion/db";
import type { Column, Row } from "@/components/database-table";
import type { Viewer } from "./session";

export type DatabaseView = {
  collectionId: string;
  name: string;
  columns: Column[];
  rows: Row[];
  people: { id: string; name: string }[];
  canWrite: boolean;
};

/**
 * 손으로 담는 모음(=노션의 데이터베이스) 하나를 화면에 필요한 모양으로 모은다.
 *
 * 모음 페이지와 본문에 끼운 표가 **같은 값을 보게** 하려고 한 곳에 둔다.
 * 권한은 space 소속으로 판정한다 — 볼 수 없는 space 의 모음이면 null.
 */
export async function loadDatabaseView(
  collectionId: string,
  viewer: Viewer,
): Promise<DatabaseView | null> {
  const saved = await getCollection(collectionId, viewer.spaceIds);
  if (saved === null || saved.source !== "manual") return null;

  const space = viewer.spaces.find((item) => item.id === saved.spaceId);
  const canWrite = space !== undefined && (space.baseRole === "owner" || space.baseRole === "editor");

  const [properties, items] = await Promise.all([
    listProperties(collectionId),
    listCollectionItems(collectionId),
  ]);

  const docs = await Promise.all(items.map((item) => getDocumentById(item.documentId)));
  const present = docs.filter((doc): doc is NonNullable<typeof doc> => doc !== null);
  const valueMap = await valuesForDocuments(
    present.map((doc) => doc.id),
    properties.map((prop) => prop.id),
  );

  // 사람 속성에 쓸 목록 — 가족이면 구성원, 개인 공간이면 나 혼자.
  const people =
    space?.organizationId != null
      ? (await familyMembers(space.organizationId)).map((m) => ({ id: m.userId, name: m.name }))
      : [{ id: viewer.userId, name: viewer.name }];

  return {
    collectionId: saved.id,
    name: saved.name,
    canWrite,
    people,
    columns: properties.map((prop) => ({
      id: prop.id,
      name: prop.name,
      type: prop.type,
      options: selectOptions(prop.config).map((o) => ({ id: o.id, name: o.name })),
    })),
    rows: present.map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      values: Object.fromEntries(valueMap.get(doc.id) ?? new Map()),
    })) satisfies Row[],
  };
}
