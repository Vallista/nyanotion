import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { accountInvite } from "../schema/admin";
import { account, invitation, member, organization, session, user } from "../schema/auth";
import { space } from "../schema/app";
import { document } from "../schema/document";

/**
 * 어드민 — **이 서버 전체의 계정 관리.**
 *
 * 가족 역할(owner/admin)과 다른 축이다. 가족 admin 은 그 가족의 일만 하고, 서버 어드민은 계정을
 * 만들고 막는다. 어드민이 누구인지는 `apps/web/src/lib/admin.ts` 가 정한다 (설정의 `ADMIN_EMAILS`).
 *
 * 여기 질의는 space 로 좁히지 않는다 — 어드민 화면 전용이다. **다른 화면에서 부르지 말 것.**
 * 그리고 **문서 내용은 보여 주지 않는다.** 계정을 관리하는 것이지 남의 문서를 읽는 자리가 아니다
 * (개수만 센다).
 */

export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  /** 가장 최근 세션이 갱신된 때. 로그인한 적이 없거나 세션이 다 지워졌으면 null. */
  lastSeenAt: string | null;
  /** 개인 space 의 (모래상자에 안 간) 문서 수. 내용은 보지 않는다. */
  documentCount: number;
  families: { organizationId: string; name: string; role: string }[];
};

export async function listAccounts(): Promise<AdminAccount[]> {
  const users = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
    })
    .from(user)
    .orderBy(asc(user.createdAt));
  if (users.length === 0) return [];
  const ids = users.map((row) => row.id);

  const [seen, docs, families] = await Promise.all([
    db
      .select({ userId: session.userId, at: sql<string>`max(${session.updatedAt})` })
      .from(session)
      .where(inArray(session.userId, ids))
      .groupBy(session.userId),
    db
      .select({ userId: space.ownerUserId, n: sql<number>`count(${document.id})` })
      .from(space)
      .leftJoin(document, and(eq(document.spaceId, space.id), isNull(document.archivedAt)))
      .where(and(eq(space.kind, "personal"), inArray(space.ownerUserId, ids)))
      .groupBy(space.ownerUserId),
    db
      .select({
        userId: member.userId,
        organizationId: member.organizationId,
        name: organization.name,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(inArray(member.userId, ids))
      .orderBy(asc(organization.name)),
  ]);

  // 원시 집계는 타입이 보장되지 않는다 — 날짜·숫자로 바꿔서 내보낸다.
  const seenBy = new Map(seen.map((row) => [row.userId, row.at === null ? null : new Date(row.at)]));
  const docsBy = new Map(docs.map((row) => [row.userId, Number(row.n)]));

  return users.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt?.toISOString() ?? null,
    lastSeenAt: seenBy.get(row.id)?.toISOString() ?? null,
    documentCount: docsBy.get(row.id) ?? 0,
    families: families
      .filter((f) => f.userId === row.id)
      .map((f) => ({ organizationId: f.organizationId, name: f.name, role: f.role })),
  }));
}

/** 가족 전부 — 초대·배정할 때 고르는 칸. */
export async function listAllFamilies(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .orderBy(asc(organization.name));
}

/** 계정이 몇 개인가, 그중 가장 먼저 만든 것. `ADMIN_EMAILS` 가 비었을 때 첫 계정을 어드민으로 본다. */
export async function firstAccountId(): Promise<string | null> {
  const rows = await db.select({ id: user.id }).from(user).orderBy(asc(user.createdAt)).limit(1);
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ 초대 */

export type PendingInvite = {
  /** 링크의 토큰. */
  id: string;
  kind: "account" | "family";
  email: string;
  /** 가족 초대일 때만. */
  organizationId: string | null;
  familyName: string | null;
  role: string | null;
  expiresAt: string;
  createdAt: string;
};

/** 살아 있는 초대 전부 — 계정 초대와 모든 가족의 초대. */
export async function listPendingInvites(): Promise<PendingInvite[]> {
  const now = new Date();
  const [accounts, families] = await Promise.all([
    db
      .select()
      .from(accountInvite)
      .where(
        and(
          isNull(accountInvite.usedAt),
          isNull(accountInvite.revokedAt),
          gt(accountInvite.expiresAt, now),
        ),
      )
      .orderBy(desc(accountInvite.createdAt)),
    db
      .select({
        id: invitation.id,
        email: invitation.email,
        organizationId: invitation.organizationId,
        familyName: organization.name,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(and(eq(invitation.status, "pending"), gt(invitation.expiresAt, now)))
      .orderBy(desc(invitation.createdAt)),
  ]);

  return [
    ...accounts.map((row) => ({
      id: row.id,
      kind: "account" as const,
      email: row.email,
      organizationId: null,
      familyName: null,
      role: null,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    ...families.map((row) => ({
      id: row.id,
      kind: "family" as const,
      email: row.email,
      organizationId: row.organizationId,
      familyName: row.familyName,
      role: row.role ?? "member",
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * 계정 초대를 만든다. 같은 주소로 살아 있는 초대가 있으면 그걸 다시 준다 —
 * 한 사람에게 링크가 여러 개 생기지 않게 (`inviteToFamily` 와 같은 규칙).
 */
export async function createAccountInvite(input: {
  email: string;
  createdBy: string;
  days?: number;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (email === "") throw new Error("이메일이 비었습니다.");

  const existing = await openAccountInvite(email);
  if (existing !== null) return existing;

  const id = newId();
  await db.insert(accountInvite).values({
    id,
    email,
    createdBy: input.createdBy,
    expiresAt: new Date(Date.now() + (input.days ?? 14) * 24 * 60 * 60 * 1000),
  });
  return id;
}

async function openAccountInvite(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: accountInvite.id })
    .from(accountInvite)
    .where(
      and(
        eq(accountInvite.email, email.trim().toLowerCase()),
        isNull(accountInvite.usedAt),
        isNull(accountInvite.revokedAt),
        gt(accountInvite.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

/** 가입 훅이 부른다 — 이 주소로 살아 있는 계정 초대가 있는가. */
export async function hasOpenAccountInvite(email: string): Promise<boolean> {
  return (await openAccountInvite(email)) !== null;
}

/** 가입이 끝나면 그 주소의 계정 초대를 쓴 것으로. 한 번만 쓴다. */
export async function markAccountInviteUsed(email: string, userId: string): Promise<void> {
  await db
    .update(accountInvite)
    .set({ usedAt: new Date(), usedBy: userId })
    .where(
      and(
        eq(accountInvite.email, email.trim().toLowerCase()),
        isNull(accountInvite.usedAt),
        isNull(accountInvite.revokedAt),
      ),
    );
}

/** 링크를 열었을 때. 쓰였거나 취소됐거나 만료됐으면 null. */
export async function accountInviteByToken(
  token: string,
): Promise<{ id: string; email: string; expiresAt: Date } | null> {
  const rows = await db
    .select({ id: accountInvite.id, email: accountInvite.email, expiresAt: accountInvite.expiresAt })
    .from(accountInvite)
    .where(
      and(
        eq(accountInvite.id, token),
        isNull(accountInvite.usedAt),
        isNull(accountInvite.revokedAt),
        gt(accountInvite.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function revokeAccountInvite(id: string): Promise<void> {
  await db
    .update(accountInvite)
    .set({ revokedAt: new Date() })
    .where(and(eq(accountInvite.id, id), isNull(accountInvite.usedAt)));
}

/** 어드민이 어느 가족의 초대든 취소한다. 가족 화면의 `revokeInvitation` 은 가족 id 를 같이 받는다. */
export async function revokeFamilyInviteById(id: string): Promise<void> {
  await db.update(invitation).set({ status: "revoked" }).where(eq(invitation.id, id));
}

/* ------------------------------------------------------------------ 계정 */

/**
 * 계정을 막거나 푼다. **막으면 세션을 전부 지운다** — 이미 로그인한 기기도 바로 끊긴다.
 * 새로 로그인하는 것은 세션 훅이 막는다. 계정·문서는 그대로 남는다.
 */
export async function setAccountDisabled(userId: string, disabled: boolean): Promise<void> {
  await db
    .update(user)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(user.id, userId));
  if (disabled) await db.delete(session).where(eq(session.userId, userId));
}

export async function isAccountDisabled(userId: string): Promise<boolean> {
  const rows = await db
    .select({ disabledAt: user.disabledAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.disabledAt != null;
}

/**
 * 비밀번호를 바꾼다 (이미 해시한 값을 받는다 — 해시는 Better Auth 설정을 따라야 하므로 웹이 한다).
 * 바꾸면 **세션을 전부 지운다** — 옛 비밀번호로 들어와 있던 기기도 다시 로그인해야 한다.
 * 이메일·비밀번호 계정이 없으면 false.
 */
export async function setPasswordHash(userId: string, hash: string): Promise<boolean> {
  const changed = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (changed.length === 0) return false;
  await db.delete(session).where(eq(session.userId, userId));
  return true;
}

/** 가족에 바로 넣는다 (초대 없이 — 이미 계정이 있는 사람). 이미 있으면 역할만 바꾼다. */
export async function putInFamily(
  organizationId: string,
  userId: string,
  role: string,
): Promise<void> {
  const existing = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  if (existing[0] !== undefined) {
    await db.update(member).set({ role }).where(eq(member.id, existing[0].id));
    return;
  }
  await db.insert(member).values({
    id: newId(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
}

/** 그 가족의 owner 수. 마지막 owner 를 내보내거나 내리면 아무도 그 가족을 관리하지 못한다. */
export async function ownerCount(organizationId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, "owner")));
  return Number(rows[0]?.n ?? 0);
}
