import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { invitation, member, organization, space, user } from "../schema/index";

/**
 * 가족 = Better Auth 의 organization. 스키마 이름은 그대로 두고 화면에서만 "가족"이라 부른다.
 *
 * **가족 역할은 가족 수준 행위에만 쓴다** (초대·역할 바꾸기). 문서 권한과 섞지 않는다 —
 * 그 둘을 잇는 건 `packages/auth/access.ts` 한 곳뿐이다.
 */

export type FamilyMember = {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  inviterId: string;
};

/** 가족을 만들면 그 가족의 space 하나가 같이 생긴다 — 이후 코드는 space 만 본다. */
export async function createFamily(input: {
  name: string;
  ownerUserId: string;
}): Promise<{ organizationId: string; spaceId: string }> {
  const name = input.name.trim().slice(0, 60);
  if (name === "") throw new Error("가족 이름이 비었습니다.");

  const organizationId = newId();
  const slug = `${organizationId.slice(0, 10)}`;
  await db.insert(organization).values({ id: organizationId, name, slug, createdAt: new Date() });
  await db.insert(member).values({
    id: newId(),
    organizationId,
    userId: input.ownerUserId,
    role: "owner",
    createdAt: new Date(),
  });

  const spaceId = newId();
  await db.insert(space).values({ id: spaceId, kind: "org", organizationId, name: `${name} 문서` });
  return { organizationId, spaceId };
}

export async function renameFamily(organizationId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (clean === "") return;
  await db.update(organization).set({ name: clean }).where(eq(organization.id, organizationId));
}

export async function familyMembers(organizationId: string): Promise<FamilyMember[]> {
  return db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt));
}

export async function roleInFamily(
  organizationId: string,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * 초대장을 만든다. **이 행이 곧 가입 허가증이다** — `hasOpenInvitation()` 이 같은 표를 본다.
 * 표의 id 가 초대 링크의 토큰이다 (추측하기 어려운 cuid2).
 */
export async function inviteToFamily(input: {
  organizationId: string;
  email: string;
  role: string;
  inviterId: string;
  days?: number;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  if (email === "") throw new Error("이메일이 비었습니다.");

  // 같은 주소로 살아 있는 초대가 있으면 그걸 다시 준다 — 같은 사람에게 링크가 여러 개 생기지 않게.
  const existing = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, input.organizationId),
        eq(invitation.email, email),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const found = existing[0];
  if (found !== undefined) return found.id;

  const id = newId();
  const expiresAt = new Date(Date.now() + (input.days ?? 14) * 24 * 60 * 60 * 1000);
  await db.insert(invitation).values({
    id,
    organizationId: input.organizationId,
    email,
    role: input.role,
    status: "pending",
    expiresAt,
    inviterId: input.inviterId,
  });
  return id;
}

export async function listInvitations(organizationId: string): Promise<PendingInvitation[]> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviterId: invitation.inviterId,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt));
  return rows.map((row) => ({ ...row, role: row.role ?? "member" }));
}

export type InvitationDetail = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
  expiresAt: Date;
};

/** 초대 링크를 열었을 때. 만료·사용된 초대는 null. */
export async function invitationByToken(token: string): Promise<InvitationDetail | null> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(
      and(
        eq(invitation.id, token),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return { ...row, role: row.role ?? "member" };
}

/**
 * 초대를 받아들인다. **초대장의 주소와 로그인한 주소가 같아야 한다** —
 * 링크가 새 나가도 아무나 들어오지 못하게.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; reason: "expired" | "email" }> {
  const detail = await invitationByToken(token);
  if (detail === null) return { ok: false, reason: "expired" };
  if (detail.email !== userEmail.trim().toLowerCase()) return { ok: false, reason: "email" };

  const already = await roleInFamily(detail.organizationId, userId);
  if (already === null) {
    await db.insert(member).values({
      id: newId(),
      organizationId: detail.organizationId,
      userId,
      role: detail.role,
      createdAt: new Date(),
    });
  }
  await db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, token));
  return { ok: true, organizationId: detail.organizationId };
}

export async function revokeInvitation(id: string, organizationId: string): Promise<void> {
  await db
    .update(invitation)
    .set({ status: "revoked" })
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, organizationId)));
}

export async function setMemberRole(
  organizationId: string,
  userId: string,
  role: string,
): Promise<void> {
  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
}

/** 가족에서 내보낸다. 그 사람이 만든 문서는 가족 space 에 그대로 남는다. */
export async function removeMember(organizationId: string, userId: string): Promise<void> {
  await db
    .delete(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
}

/** 주소로 사람 찾기 — 문서를 사람에게 공유할 때. 없으면 null (먼저 초대해야 한다). */
export async function userByEmail(
  email: string,
): Promise<{ id: string; name: string; email: string } | null> {
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

/** id 로 여러 사람 — 공유 목록에 이름을 붙일 때. */
export async function usersByIds(
  ids: readonly string[],
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(or(...ids.map((id) => eq(user.id, id))));
  for (const row of rows) result.set(row.id, { name: row.name, email: row.email });
  return result;
}

/** id 로 여러 가족 — 공유 목록에 이름을 붙일 때. */
export async function organizationsByIds(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(or(...ids.map((id) => eq(organization.id, id))));
  for (const row of rows) result.set(row.id, row.name);
  return result;
}

/** 아직 개인 space 가 없는 사람이 있는지 — 데이터가 어긋났는지 확인용. */
export async function usersWithoutPersonalSpace(): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .leftJoin(space, and(eq(space.ownerUserId, user.id), eq(space.kind, "personal")))
    .where(isNull(space.id));
  return rows.map((row) => row.id);
}
