import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { document, documentShare, publicLink } from "../schema/index";

/**
 * 문서 공유. **누가 볼 수 있는지 판정하는 건 `packages/auth/access.ts` 다** —
 * 이 파일은 공유 기록을 넣고 빼는 것만 한다.
 */

export type ShareRow = {
  id: string;
  subjectType: string;
  subjectId: string;
  role: string;
  createdAt: Date;
};

export async function listShares(documentId: string): Promise<ShareRow[]> {
  return db
    .select({
      id: documentShare.id,
      subjectType: documentShare.subjectType,
      subjectId: documentShare.subjectId,
      role: documentShare.role,
      createdAt: documentShare.createdAt,
    })
    .from(documentShare)
    .where(eq(documentShare.documentId, documentId))
    .orderBy(asc(documentShare.createdAt));
}

/** 같은 대상에 다시 공유하면 역할만 바뀐다 — 줄이 두 개 생기지 않게. */
export async function upsertShare(input: {
  documentId: string;
  subjectType: "user" | "org";
  subjectId: string;
  role: string;
  createdBy: string;
}): Promise<void> {
  await db
    .insert(documentShare)
    .values({
      id: newId(),
      documentId: input.documentId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      role: input.role,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [documentShare.documentId, documentShare.subjectType, documentShare.subjectId],
      set: { role: input.role },
    });
}

export async function removeShare(id: string, documentId: string): Promise<void> {
  await db
    .delete(documentShare)
    .where(and(eq(documentShare.id, id), eq(documentShare.documentId, documentId)));
}

/* ----------------------------------------------------------- 공개 링크 */

export type PublicLinkRow = {
  id: string;
  token: string;
  role: string;
  hasPassword: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

export async function listPublicLinks(documentId: string): Promise<PublicLinkRow[]> {
  const rows = await db
    .select()
    .from(publicLink)
    .where(eq(publicLink.documentId, documentId))
    .orderBy(asc(publicLink.createdAt));
  return rows.map((row) => ({
    id: row.id,
    token: row.token,
    role: row.role,
    hasPassword: row.passwordHash !== null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}

export async function createPublicLink(input: {
  documentId: string;
  createdBy: string;
  role?: string;
  passwordHash?: string | null;
  expiresAt?: Date | null;
}): Promise<string> {
  const id = newId();
  // 토큰은 id 와 따로 만든다 — 주소에서 내부 id 를 읽어 낼 수 없게.
  const token = `${newId()}${newId()}`;
  await db.insert(publicLink).values({
    id,
    documentId: input.documentId,
    token,
    role: input.role ?? "viewer",
    passwordHash: input.passwordHash ?? null,
    expiresAt: input.expiresAt ?? null,
    createdBy: input.createdBy,
  });
  return token;
}

export async function revokePublicLink(id: string, documentId: string): Promise<void> {
  await db
    .delete(publicLink)
    .where(and(eq(publicLink.id, id), eq(publicLink.documentId, documentId)));
}

export type PublicView = {
  documentId: string;
  role: string;
  passwordHash: string | null;
  title: string;
  contentJson: unknown;
  updatedAt: Date;
};

/**
 * 공개 링크로 문서 열기. 만료됐거나 문서가 모래상자에 있으면 null.
 * **이 경로는 실효 권한 계산을 건너뛴다** — 대신 그 문서 하나로만 제한된다.
 */
export async function documentByPublicToken(token: string): Promise<PublicView | null> {
  const rows = await db
    .select({
      documentId: document.id,
      role: publicLink.role,
      passwordHash: publicLink.passwordHash,
      title: document.title,
      contentJson: document.contentJson,
      updatedAt: document.updatedAt,
      archivedAt: document.archivedAt,
    })
    .from(publicLink)
    .innerJoin(document, eq(document.id, publicLink.documentId))
    .where(
      and(
        eq(publicLink.token, token),
        or(isNull(publicLink.expiresAt), gt(publicLink.expiresAt, new Date())),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.archivedAt !== null) return null;
  return {
    documentId: row.documentId,
    role: row.role,
    passwordHash: row.passwordHash,
    title: row.title,
    contentJson: row.contentJson,
    updatedAt: row.updatedAt,
  };
}
