import { blocksToPlainText, guessTitle, positionAfterLast, positionBetween } from "@nyanotion/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { document, space, type Document } from "../schema/index";

/** 사이드바 트리에 필요한 것만. `content_json` 은 넣지 않는다 — 무겁다. */
export type TreeNode = {
  id: string;
  parentId: string | null;
  position: string;
  title: string;
  icon: string | null;
  type: string;
};

const treeColumns = {
  id: document.id,
  parentId: document.parentId,
  position: document.position,
  title: document.title,
  icon: document.icon,
  type: document.type,
};

/** 이 사용자의 개인 space. 가입 훅이 하나 만들어 두었다. */
export async function personalSpaceOf(userId: string): Promise<{ id: string; name: string } | null> {
  const rows = await db
    .select({ id: space.id, name: space.name })
    .from(space)
    .where(and(eq(space.kind, "personal"), eq(space.ownerUserId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 살아 있는 문서 전체 (모래상자 제외). 트리 조립은 호출자가 한다. */
export async function listTree(spaceId: string): Promise<TreeNode[]> {
  return db
    .select(treeColumns)
    .from(document)
    .where(and(eq(document.spaceId, spaceId), isNull(document.archivedAt)))
    .orderBy(asc(document.position));
}

/** 캣타워(홈)의 "최근 고친 문서". 본문은 안 들고 온다. */
export async function listRecent(
  spaceId: string,
  limit = 12,
): Promise<(TreeNode & { updatedAt: Date })[]> {
  return db
    .select({ ...treeColumns, updatedAt: document.updatedAt })
    .from(document)
    .where(and(eq(document.spaceId, spaceId), isNull(document.archivedAt)))
    .orderBy(desc(document.updatedAt))
    .limit(limit);
}

export async function getDocument(id: string, spaceId: string): Promise<Document | null> {
  const rows = await db
    .select()
    .from(document)
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)))
    .limit(1);
  return rows[0] ?? null;
}

/** 같은 부모 아래 형제들의 정렬 키만, 순서대로. */
async function siblingPositions(spaceId: string, parentId: string | null): Promise<string[]> {
  const rows = await db
    .select({ position: document.position })
    .from(document)
    .where(
      and(
        eq(document.spaceId, spaceId),
        parentId === null ? isNull(document.parentId) : eq(document.parentId, parentId),
        isNull(document.archivedAt),
      ),
    )
    .orderBy(asc(document.position));
  return rows.map((r) => r.position);
}

export async function createDocument(input: {
  spaceId: string;
  userId: string;
  parentId?: string | null;
  title?: string;
}): Promise<string> {
  const parentId = input.parentId ?? null;
  const positions = await siblingPositions(input.spaceId, parentId);
  const id = newId();
  await db.insert(document).values({
    id,
    spaceId: input.spaceId,
    parentId,
    position: positionAfterLast(positions.at(-1) ?? null),
    title: input.title ?? "",
    createdBy: input.userId,
    updatedBy: input.userId,
  });
  return id;
}

export async function renameDocument(
  id: string,
  spaceId: string,
  title: string,
  userId: string,
): Promise<void> {
  await db
    .update(document)
    .set({ title, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)));
}

export async function setIcon(
  id: string,
  spaceId: string,
  icon: string | null,
  userId: string,
): Promise<void> {
  await db
    .update(document)
    .set({ icon, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)));
}

/**
 * 본문 저장. `text_plain` 을 여기서 같이 만든다 — 파생값을 만드는 경로는 이 함수뿐이어야 한다.
 * 제목이 비어 있으면 첫 줄에서 짐작해 채운다 (노션과 같은 동작).
 */
export async function setContent(
  id: string,
  spaceId: string,
  contentJson: unknown,
  userId: string,
): Promise<{ title: string }> {
  const textPlain = blocksToPlainText(contentJson);
  const current = await db
    .select({ title: document.title })
    .from(document)
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)))
    .limit(1);
  const existing = current[0]?.title ?? "";
  const title = existing.trim() === "" ? guessTitle(contentJson) : existing;

  await db
    .update(document)
    .set({ contentJson, textPlain, title, updatedBy: userId, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)));
  return { title };
}

/** `id` 의 조상들. 자기 자신은 포함하지 않는다. */
async function ancestorIds(id: string, spaceId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    with recursive up as (
      select d.id, d.parent_id
        from ${document} d
       where d.id = ${id} and d.space_id = ${spaceId}
      union all
      select p.id, p.parent_id
        from ${document} p join up on p.id = up.parent_id
    )
    select id from up where id <> ${id}
  `);
  return Array.from(rows).map((r) => r.id);
}

/**
 * 문서를 옮긴다. `afterId` 는 그 형제 **뒤**로 놓겠다는 뜻이고, null 이면 맨 앞.
 * 정렬 키는 서버가 계산한다 — 클라이언트가 보낸 키를 믿지 않는다.
 */
export async function moveDocument(input: {
  id: string;
  spaceId: string;
  parentId: string | null;
  afterId: string | null;
}): Promise<{ ok: true } | { ok: false; reason: "cycle" | "not-found" }> {
  const { id, spaceId } = input;
  const target = await getDocument(id, spaceId);
  if (target === null) return { ok: false, reason: "not-found" };

  // 자기 자신이나 자기 하위로는 못 옮긴다 — 트리가 끊긴다.
  if (input.parentId === id) return { ok: false, reason: "cycle" };
  if (input.parentId !== null) {
    const parentAncestors = await ancestorIds(input.parentId, spaceId);
    if (parentAncestors.includes(id)) return { ok: false, reason: "cycle" };
  }

  const siblings = await db
    .select({ id: document.id, position: document.position })
    .from(document)
    .where(
      and(
        eq(document.spaceId, spaceId),
        input.parentId === null ? isNull(document.parentId) : eq(document.parentId, input.parentId),
        isNull(document.archivedAt),
      ),
    )
    .orderBy(asc(document.position));

  const others = siblings.filter((s) => s.id !== id);
  const afterIndex = input.afterId === null ? -1 : others.findIndex((s) => s.id === input.afterId);
  const before = afterIndex >= 0 ? (others[afterIndex]?.position ?? null) : null;
  const after = others[afterIndex + 1]?.position ?? null;

  await db
    .update(document)
    .set({ parentId: input.parentId, position: positionBetween(before, after) })
    .where(and(eq(document.id, id), eq(document.spaceId, spaceId)));
  return { ok: true };
}

/** 모래상자로. 삭제는 이것으로만 한다. 하위 트리도 같이 내려간다. */
export async function archiveDocument(id: string, spaceId: string): Promise<void> {
  await db.execute(sql`
    with recursive down as (
      select d.id
        from ${document} d
       where d.id = ${id} and d.space_id = ${spaceId}
      union all
      select c.id from ${document} c join down on c.parent_id = down.id
    )
    update ${document} set archived_at = now()
     where id in (select id from down) and archived_at is null
  `);
}

export async function restoreDocument(id: string, spaceId: string): Promise<void> {
  await db.execute(sql`
    with recursive down as (
      select d.id
        from ${document} d
       where d.id = ${id} and d.space_id = ${spaceId}
      union all
      select c.id from ${document} c join down on c.parent_id = down.id
    )
    update ${document} set archived_at = null where id in (select id from down)
  `);
}

/** 모래상자 목록 — 직접 버려진 것만 (하위는 부모와 함께 복원된다). */
export async function listArchived(spaceId: string): Promise<(TreeNode & { archivedAt: Date })[]> {
  const rows = await db
    .select({ ...treeColumns, archivedAt: document.archivedAt })
    .from(document)
    .where(and(eq(document.spaceId, spaceId), sql`${document.archivedAt} is not null`))
    .orderBy(asc(document.archivedAt));
  const archived = rows.filter(
    (r): r is TreeNode & { archivedAt: Date } => r.archivedAt !== null,
  );
  // 부모도 같이 버려졌다면 목록에 따로 띄우지 않는다.
  return archived.filter((r) => r.parentId === null || !archived.some((o) => o.id === r.parentId));
}

export async function countArchived(spaceId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(document)
    .where(and(eq(document.spaceId, spaceId), sql`${document.archivedAt} is not null`));
  return rows[0]?.n ?? 0;
}

/** 모래상자 비우기 — 여기서만 하드 삭제한다. 하위는 FK cascade 로 함께 사라진다. */
export async function emptyTrash(spaceId: string): Promise<void> {
  await db
    .delete(document)
    .where(and(eq(document.spaceId, spaceId), sql`${document.archivedAt} is not null`));
}
