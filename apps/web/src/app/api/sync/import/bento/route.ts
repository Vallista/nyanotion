import { importLife } from "@nyanotion/db";
import { LifeRuleError, planBentoImport } from "@nyanotion/shared";
import type { NextRequest } from "next/server";
import { ApiError, apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * Bento(맥) 생활 기록 옮기기 — 한 번 부르면 된다 (`docs/15-today.md` §Bento 에서 옮기기).
 *
 *   POST {version: 1, blocks, moods, summaries, thoughts}   Bento 의 파일을 그대로.
 *
 * 모양을 바꾸는 일은 `planBentoImport`(@nyanotion/shared) 가 한다. **새것만 더한다** — 다시 불러도 겹치지 않고,
 * 도란에서 고친 것을 덮지 않는다(하루 기록은 빈칸만 채운다). 일정은 토큰 주인의 개인 space 에, 메모·기분·회고는
 * 그 사람 것으로 — 가족에게 보이는 길이 없다.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const personal = viewer.spaces.find((space) => space.kind === "personal");
    if (personal === undefined) throw new ApiError(409, "개인 공간이 없어 옮길 수 없습니다.");
    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== "object" || body === null || (body as { version?: unknown }).version !== 1) {
      throw new ApiError(400, "옮길 내용의 모양(version 1)이 아닙니다.");
    }
    let plan;
    try {
      plan = planBentoImport(body);
    } catch (error) {
      if (error instanceof LifeRuleError) throw new ApiError(400, error.message);
      throw error;
    }
    const result = await importLife(viewer.userId, personal.id, plan);
    return { ...result, skipped: plan.skipped };
  });
}
