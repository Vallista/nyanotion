import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { apiToken } from "../schema/api-token";
import { user } from "../schema/auth";

/**
 * 개인 토큰 — Bento 같은 앱이 그 사람으로 동기화 API 를 부를 때 (`docs/13-sync.md`).
 * **해시만 저장한다.** 평문은 만들 때 한 번 돌려주고 끝이다.
 */

export type ApiTokenRow = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 새 토큰. 돌려주는 `token` 은 **이번 한 번만** 볼 수 있다. */
export async function createApiToken(
  userId: string,
  name: string,
): Promise<{ id: string; token: string }> {
  const clean = name.trim().slice(0, 60);
  if (clean === "") throw new Error("토큰 이름을 적어 주세요 (예: 맥북 Bento).");
  // 32바이트 = 256비트. 앞의 nyt_ 는 어디서 새 나왔을 때 "냥노션 토큰"인 줄 알아보게.
  const token = `nyt_${randomBytes(32).toString("base64url")}`;
  const id = newId();
  await db.insert(apiToken).values({
    id,
    userId,
    name: clean,
    tokenHash: hash(token),
    prefix: token.slice(0, 10),
  });
  return { id, token };
}

export async function listApiTokens(userId: string): Promise<ApiTokenRow[]> {
  const rows = await db
    .select()
    .from(apiToken)
    .where(and(eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
    .orderBy(desc(apiToken.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }));
}

/** 끊는다. **자기 토큰만** — 남의 토큰 id 를 알아도 못 끊는다. */
export async function revokeApiToken(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiToken.id, id), eq(apiToken.userId, userId), isNull(apiToken.revokedAt)))
    .returning({ id: apiToken.id });
  return rows.length > 0;
}

/**
 * 토큰 → 그 사람. 끊긴 토큰·막힌 계정이면 null.
 * 마지막 사용 시각은 1분에 한 번만 적는다 — 동기화는 자주 부르므로 매번 쓰면 쓸데없이 무겁다.
 */
export async function userByApiToken(
  token: string,
): Promise<{ userId: string; email: string; name: string; tokenId: string } | null> {
  if (!token.startsWith("nyt_") || token.length > 200) return null;
  const rows = await db
    .select({
      tokenId: apiToken.id,
      userId: apiToken.userId,
      lastUsedAt: apiToken.lastUsedAt,
      email: user.email,
      name: user.name,
      disabledAt: user.disabledAt,
    })
    .from(apiToken)
    .innerJoin(user, eq(user.id, apiToken.userId))
    .where(and(eq(apiToken.tokenHash, hash(token)), isNull(apiToken.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.disabledAt !== null) return null;
  if (row.lastUsedAt === null || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, row.tokenId));
  }
  return { userId: row.userId, email: row.email, name: row.name, tokenId: row.tokenId };
}
