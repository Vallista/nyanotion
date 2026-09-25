import { db, document, documentShare, member, organization, space } from "@nyanotion/db";
import {
  familyRoleToDocumentRole,
  roleAllows,
  strongerRole,
  type DocumentRole,
  type FamilyRole,
  type SpaceKind,
} from "@nyanotion/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/**
 * **문서 권한을 판정하는 유일한 곳.** 라우트·쿼리에 조건을 손으로 짜 넣지 말 것 —
 * 한 곳에만 있어야 어긋나지 않는다. ARCHITECTURE.md §6.
 *
 * 실효 권한 = 다음 중 가장 강한 것
 *   1. 이 문서에 나(user)를 대상으로 한 공유
 *   2. 이 문서에 내가 속한 가족(org)을 대상으로 한 공유
 *   3. 조상 문서들에 대해 1·2 를 반복한 것 (트리를 따라 상속)
 *   4. space 기본 권한 (개인 space 는 소유자만, 가족 space 는 멤버 역할에 따라)
 */

export type SpaceAccess = {
  id: string;
  name: string;
  kind: SpaceKind;
  organizationId: string | null;
  organizationName: string | null;
  /** 가족 space 일 때 내 가족 역할. 개인 space 면 null. */
  familyRole: FamilyRole | null;
  /** 이 space 안 문서에 기본으로 갖는 권한. */
  baseRole: DocumentRole;
};

function asFamilyRole(value: string): FamilyRole {
  switch (value) {
    case "owner":
    case "admin":
    case "member":
    case "guest":
      return value;
    default:
      return "member";
  }
}

function asDocumentRole(value: string): DocumentRole | null {
  switch (value) {
    case "viewer":
    case "commenter":
    case "editor":
    case "owner":
      return value;
    default:
      return null;
  }
}

/** 내가 속한 가족들. 문서 공유의 'org' 대상이 여기에 걸린다. */
export async function organizationIdsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId));
  return rows.map((row) => row.organizationId);
}

/**
 * 내가 들어갈 수 있는 space 들 — 개인 space 하나와 내가 속한 가족들의 space.
 * 사이드바가 "내 문서"와 "가족 문서"를 나눠 그리는 근거다.
 */
export async function spacesForUser(userId: string): Promise<SpaceAccess[]> {
  const personal = await db
    .select({ id: space.id, name: space.name })
    .from(space)
    .where(and(eq(space.kind, "personal"), eq(space.ownerUserId, userId)));

  const org = await db
    .select({
      id: space.id,
      name: space.name,
      organizationId: space.organizationId,
      organizationName: organization.name,
      role: member.role,
    })
    .from(space)
    .innerJoin(organization, eq(organization.id, space.organizationId))
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, userId)),
    )
    .where(eq(space.kind, "org"));

  const result: SpaceAccess[] = personal.map((row) => ({
    id: row.id,
    name: row.name,
    kind: "personal" as const,
    organizationId: null,
    organizationName: null,
    familyRole: null,
    baseRole: "owner" as const,
  }));

  for (const row of org) {
    const familyRole = asFamilyRole(row.role);
    const baseRole = familyRoleToDocumentRole(familyRole);
    // guest 는 space 전체 권한이 없다 — 개별 공유로만 들어온다.
    if (baseRole === null) continue;
    result.push({
      id: row.id,
      name: row.name,
      kind: "org",
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      familyRole,
      baseRole,
    });
  }
  return result;
}

/** 이 space 에서 내가 기본으로 갖는 권한. 들어갈 수 없으면 null. */
export async function spaceBaseRole(userId: string, spaceId: string): Promise<DocumentRole | null> {
  const spaces = await spacesForUser(userId);
  return spaces.find((item) => item.id === spaceId)?.baseRole ?? null;
}

/**
 * 문서 하나에 대한 실효 권한. 없으면 null.
 * 조상 사슬을 한 번의 재귀 CTE 로 올라가며 공유를 모은다.
 */
export async function effectiveRole(
  userId: string,
  documentId: string,
): Promise<DocumentRole | null> {
  const orgIds = await organizationIdsOf(userId);
  // in () 이 비면 SQL 이 깨지므로 절대 맞지 않는 값을 하나 넣는다.
  const orgList = orgIds.length > 0 ? orgIds : ["-"];

  const rows = await db.execute<{ space_id: string | null; role: string | null }>(sql`
    with recursive chain as (
      select d.id, d.parent_id, d.space_id, d.archived_at
        from ${document} d
       where d.id = ${documentId}
      union all
      select p.id, p.parent_id, p.space_id, p.archived_at
        from ${document} p
        join chain c on p.id = c.parent_id
    )
    select (select space_id from chain where id = ${documentId}) as space_id,
           s.role as role
      from chain
      left join ${documentShare} s
        on s.document_id = chain.id
       and (
            (s.subject_type = 'user' and s.subject_id = ${userId})
         or (s.subject_type = 'org' and s.subject_id in ${orgList})
       )
  `);

  const list = Array.from(rows);
  if (list.length === 0) return null; // 문서가 없다

  const spaceId = list[0]?.space_id ?? null;
  let role: DocumentRole | null = spaceId === null ? null : await spaceBaseRole(userId, spaceId);

  for (const row of list) {
    if (row.role === null) continue;
    role = strongerRole(role, asDocumentRole(row.role));
  }
  return role;
}

export async function canRead(userId: string, documentId: string): Promise<boolean> {
  return roleAllows(await effectiveRole(userId, documentId), "viewer");
}

export async function canWrite(userId: string, documentId: string): Promise<boolean> {
  return roleAllows(await effectiveRole(userId, documentId), "editor");
}

/**
 * **읽을 수 있는 문서 id 전부.** 목록·검색·나중의 RAG 가 전부 이걸 먼저 통과한다.
 *
 * 두 갈래를 합친다:
 *   1. 내가 들어갈 수 있는 space 안의 모든 문서
 *   2. 개별 공유로 받은 문서와 **그 하위 트리** (다른 space 의 문서일 수 있다)
 */
export async function readableDocumentIds(userId: string): Promise<Set<string>> {
  const spaces = await spacesForUser(userId);
  const spaceIds = spaces.map((item) => item.id);
  const orgIds = await organizationIdsOf(userId);
  const orgList = orgIds.length > 0 ? orgIds : ["-"];

  const result = new Set<string>();

  if (spaceIds.length > 0) {
    const rows = await db
      .select({ id: document.id })
      .from(document)
      .where(and(inArray(document.spaceId, spaceIds), isNull(document.archivedAt)));
    for (const row of rows) result.add(row.id);
  }

  const shared = await db.execute<{ id: string }>(sql`
    with recursive roots as (
      select s.document_id as id
        from ${documentShare} s
       where (s.subject_type = 'user' and s.subject_id = ${userId})
          or (s.subject_type = 'org' and s.subject_id in ${orgList})
    ),
    down as (
      select d.id, d.archived_at from ${document} d join roots r on d.id = r.id
      union all
      select c.id, c.archived_at
        from ${document} c join down on c.parent_id = down.id
    )
    select id from down where archived_at is null
  `);
  for (const row of Array.from(shared)) result.add(row.id);

  return result;
}
