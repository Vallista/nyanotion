import { desc, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { auditEvent, type AuditAction } from "../schema/audit";

/**
 * 감사 로그 쓰기·읽기.
 *
 * **쓰기는 절대 실패를 던지지 않는다.** 로그를 못 남겼다고 공유가 취소되거나 승인이 되돌아가면
 * 더 나쁘다. 기록은 부수적인 일이고, 실패하면 서버 콘솔에만 남긴다.
 */

export type AuditInput = {
  actorId: string;
  actorName?: string;
  action: AuditAction;
  spaceId?: string | null;
  subjectType?: string;
  subjectId?: string;
  summary: string;
  detail?: Record<string, unknown>;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvent).values({
      id: newId(),
      actorId: input.actorId,
      actorName: input.actorName ?? "",
      action: input.action,
      spaceId: input.spaceId ?? null,
      subjectType: input.subjectType ?? "",
      subjectId: input.subjectId ?? "",
      summary: input.summary.slice(0, 300),
      detail: input.detail ?? {},
    });
  } catch (error) {
    console.error("[audit] 기록하지 못했습니다:", error);
  }
}

export type AuditRow = {
  id: string;
  at: Date;
  actorId: string;
  actorName: string;
  action: string;
  spaceId: string | null;
  subjectType: string;
  subjectId: string;
  summary: string;
};

/**
 * **내가 들어갈 수 있는 공간의 기록만.** 개인 공간은 나뿐이고 가족 공간은 그 가족이 본다 —
 * 공간이 곧 경계다. 공간이 없는 기록(GPU 모드처럼 서버 전체의 일)은 로그인한 사람이면 본다.
 */
export async function listAudit(
  spaceIds: readonly string[],
  options: { limit?: number; before?: Date } = {},
): Promise<AuditRow[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const rows = await db
    .select()
    .from(auditEvent)
    .where(
      sql`(${auditEvent.spaceId} is null or ${
        spaceIds.length === 0
          ? sql`false`
          : inArray(auditEvent.spaceId, [...spaceIds])
      })${options.before === undefined ? sql`` : sql` and ${auditEvent.at} < ${options.before}`}`,
    )
    .orderBy(desc(auditEvent.at))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    spaceId: row.spaceId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    summary: row.summary,
  }));
}

/** 보관 기간이 지난 기록을 치운다. 기본 1년 — 가족 서버에서 그보다 오래 볼 일이 없다. */
export async function pruneAudit(olderThanDays = 365): Promise<number> {
  const rows = await db.execute<{ gone: number }>(sql`
    with removed as (
      delete from ${auditEvent}
       where at < now() - make_interval(days => ${olderThanDays})
      returning 1
    ) select count(*)::int as gone from removed
  `);
  return Array.from(rows)[0]?.gone ?? 0;
}
