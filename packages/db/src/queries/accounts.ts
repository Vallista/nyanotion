import { and, eq, gt } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { invitation, space, user } from "../schema/index";

/** 이 주소 앞으로 아직 살아 있는 초대가 있는가. */
export async function hasOpenInvitation(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.email, email.toLowerCase()),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** 계정이 하나도 없는가 — 첫 사용자는 초대할 사람이 없으므로 이때만 통과시킨다. */
export async function isFirstUser(): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).limit(1);
  return rows.length === 0;
}

/** 가입하면 개인 space 하나가 따라온다. 이후 모든 코드는 space 만 본다. */
export async function createPersonalSpace(userId: string, name = "내 문서"): Promise<void> {
  await db
    .insert(space)
    .values({ id: newId(), kind: "personal", ownerUserId: userId, name })
    .onConflictDoNothing();
}
