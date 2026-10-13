"use server";

import { createApiToken, recordAudit, revokeApiToken } from "@nyanotion/db";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/session";

/**
 * 개인 토큰 — **자기 것만** 만들고 끊는다. 토큰 평문은 만들 때 한 번만 돌려준다.
 * 만들고 끊은 것은 감사 로그에 남는다 (오래 사는 열쇠라서).
 */
export async function createTokenAction(name: string): Promise<{ token: string }> {
  const viewer = await requireViewer();
  const { id, token } = await createApiToken(viewer.userId, name);
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "token.create",
    subjectType: "api_token",
    subjectId: id,
    summary: `개인 토큰 "${name.trim().slice(0, 60)}" 을 만들었다`,
  });
  revalidatePath("/account");
  return { token };
}

export async function revokeTokenAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  const ok = await revokeApiToken(viewer.userId, id);
  if (!ok) throw new Error("그 토큰을 찾을 수 없습니다.");
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "token.revoke",
    subjectType: "api_token",
    subjectId: id,
    summary: "개인 토큰을 끊었다",
  });
  revalidatePath("/account");
}
