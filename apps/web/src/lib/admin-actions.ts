"use server";

import { randomInt } from "node:crypto";
import {
  createAccountInvite,
  inviteToFamily,
  listAllFamilies,
  ownerCount,
  putInFamily,
  recordAudit,
  removeMember,
  revokeAccountInvite,
  revokeFamilyInviteById,
  roleInFamily,
  setAccountDisabled,
  setPasswordHash,
  usersByIds,
} from "@nyanotion/db";
import { revalidatePath } from "next/cache";
import { assertAdmin, isAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

/**
 * 어드민 화면의 동작. **전부 `assertAdmin` 을 먼저 지난다.**
 *
 * 하는 일: 계정 초대(가족 없이 또는 가족으로) · 초대 취소 · 계정 막기/풀기 · 임시 비밀번호 ·
 * 가족에 넣기/빼기/역할. 하지 않는 일: **계정 지우기**(그 사람의 문서·기록이 남아야 한다 — 막기로
 * 충분하다), **문서 읽기**(계정을 관리하는 자리이지 남의 문서를 보는 자리가 아니다).
 *
 * 모두 감사 로그에 남는다 — 계정에 손대는 일은 "나중에 왜 이렇게 됐지"를 가장 많이 묻는 일이다.
 */

const FAMILY_ROLES = ["owner", "admin", "member", "guest"] as const;
type FamilyRoleInput = (typeof FAMILY_ROLES)[number];

function cleanRole(role: string | undefined): FamilyRoleInput {
  return (FAMILY_ROLES as readonly string[]).includes(role ?? "")
    ? (role as FamilyRoleInput)
    : "member";
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  // 엄밀한 검사는 아니다 — 오타로 엉뚱한 주소에 링크를 만드는 것만 막는다.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 주소가 이상합니다.");
  return email;
}

function refresh(): void {
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

async function nameOf(userId: string): Promise<string> {
  const found = (await usersByIds([userId])).get(userId);
  return found === undefined ? "누군가" : `${found.name} (${found.email})`;
}

/**
 * 초대 링크를 만든다. 가족을 고르면 그 가족의 초대(`/invite/…`), 안 고르면 계정만(`/join/…`).
 * 어느 쪽이든 **그 주소로만** 가입된다.
 */
export async function adminInviteAction(input: {
  email: string;
  organizationId?: string | null;
  role?: string;
}): Promise<{ path: string }> {
  const admin = await assertAdmin();
  const email = cleanEmail(input.email);

  let path: string;
  let summary: string;
  if (input.organizationId) {
    const families = await listAllFamilies();
    const family = families.find((item) => item.id === input.organizationId);
    if (family === undefined) throw new Error("그런 가족이 없습니다.");
    const role = cleanRole(input.role);
    // 가족 초대로 owner 를 줄 수는 없다 — owner 는 이미 계정이 있는 사람을 "가족에 넣기"로만.
    const token = await inviteToFamily({
      organizationId: family.id,
      email,
      role: role === "owner" ? "admin" : role,
      inviterId: admin.userId,
    });
    path = `/invite/${token}`;
    summary = `${email} 을 ${family.name} 가족으로 초대했다`;
  } else {
    const token = await createAccountInvite({ email, createdBy: admin.userId });
    path = `/join/${token}`;
    summary = `${email} 에게 계정 초대를 만들었다`;
  }

  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: "admin.invite",
    subjectType: "account",
    subjectId: email,
    summary,
    detail: { email, organizationId: input.organizationId ?? null },
  });
  refresh();
  return { path };
}

export async function adminRevokeInviteAction(
  kind: "account" | "family",
  id: string,
): Promise<void> {
  const admin = await assertAdmin();
  if (kind === "account") await revokeAccountInvite(id);
  else await revokeFamilyInviteById(id);
  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: "admin.revoke",
    subjectType: kind === "account" ? "account_invite" : "invitation",
    subjectId: id,
    summary: "초대를 취소했다",
  });
  refresh();
}

/**
 * 막는다 / 푼다. **자기 자신이나 다른 어드민은 막지 못한다** — 어드민이 다 막히면 이 화면을
 * 열 사람이 없다 (설정 파일을 고쳐야 한다).
 */
export async function adminSetDisabledAction(userId: string, disabled: boolean): Promise<void> {
  const admin = await assertAdmin();
  if (disabled) {
    if (userId === admin.userId) throw new Error("자기 계정은 막을 수 없습니다.");
    const target = (await usersByIds([userId])).get(userId);
    if (target === undefined) throw new Error("그런 계정이 없습니다.");
    if (await isAdmin({ userId, email: target.email })) {
      throw new Error("어드민 계정은 막을 수 없습니다. 먼저 ADMIN_EMAILS 에서 빼세요.");
    }
  }
  await setAccountDisabled(userId, disabled);
  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: disabled ? "admin.disable" : "admin.enable",
    subjectType: "user",
    subjectId: userId,
    summary: `${await nameOf(userId)} 을 ${disabled ? "막았다 (모든 기기에서 로그아웃)" : "다시 열었다"}`,
  });
  refresh();
}

/** 헷갈리는 글자(0/O, 1/l/I)를 뺀 임시 비밀번호. 사람이 받아 적기 쉽게. */
function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 14; i += 1) out += letters[randomInt(letters.length)];
  return out;
}

/**
 * 임시 비밀번호를 만든다. **화면에 한 번만 보여 주고 어디에도 저장하지 않는다** (해시만 남는다).
 * 그 사람의 기기는 전부 로그아웃된다. 받은 사람은 로그인한 뒤 바꾸면 된다.
 *
 * 메일 발송이 없어서 "비밀번호 잊음" 흐름을 만들 수 없다 — 그 자리를 이게 대신한다.
 */
export async function adminResetPasswordAction(userId: string): Promise<{ password: string }> {
  const admin = await assertAdmin();
  const password = temporaryPassword();
  // 해시는 Better Auth 설정을 따라야 로그인이 된다 — 직접 고르지 않는다.
  const context = await auth.$context;
  const hash = await context.password.hash(password);
  const ok = await setPasswordHash(userId, hash);
  if (!ok) throw new Error("이메일·비밀번호로 만든 계정이 아닙니다.");

  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: "admin.password",
    subjectType: "user",
    subjectId: userId,
    summary: `${await nameOf(userId)} 에게 임시 비밀번호를 만들었다 (모든 기기에서 로그아웃)`,
  });
  refresh();
  return { password };
}

/** 이미 계정이 있는 사람을 가족에 넣거나 역할을 바꾼다. */
export async function adminPutInFamilyAction(
  userId: string,
  organizationId: string,
  role: string,
): Promise<void> {
  const admin = await assertAdmin();
  const families = await listAllFamilies();
  const family = families.find((item) => item.id === organizationId);
  if (family === undefined) throw new Error("그런 가족이 없습니다.");
  const next = cleanRole(role);

  const current = await roleInFamily(organizationId, userId);
  if (current === "owner" && next !== "owner" && (await ownerCount(organizationId)) <= 1) {
    throw new Error("마지막 owner 는 내릴 수 없습니다. 다른 사람을 먼저 owner 로 만드세요.");
  }

  await putInFamily(organizationId, userId, next);
  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: "admin.family",
    subjectType: "organization",
    subjectId: organizationId,
    summary: `${await nameOf(userId)} 을 ${family.name} 가족의 ${next} 로 두었다`,
  });
  refresh();
}

/** 가족에서 뺀다. 그 사람이 쓴 문서는 가족 space 에 남는다. */
export async function adminRemoveFromFamilyAction(
  userId: string,
  organizationId: string,
): Promise<void> {
  const admin = await assertAdmin();
  const current = await roleInFamily(organizationId, userId);
  if (current === null) return;
  if (current === "owner" && (await ownerCount(organizationId)) <= 1) {
    throw new Error("마지막 owner 는 뺄 수 없습니다. 다른 사람을 먼저 owner 로 만드세요.");
  }
  await removeMember(organizationId, userId);
  await recordAudit({
    actorId: admin.userId,
    actorName: admin.name,
    action: "admin.family",
    subjectType: "organization",
    subjectId: organizationId,
    summary: `${await nameOf(userId)} 을 가족에서 뺐다`,
  });
  refresh();
}
