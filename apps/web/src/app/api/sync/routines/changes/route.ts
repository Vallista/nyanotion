import {
  applyRoutineChanges,
  routineChanges,
  type IncomingRoutine,
  type IncomingRoutineLog,
  type IncomingRoutineTimer,
} from "@nyanotion/db";
import type { NextRequest } from "next/server";
import { ApiError, apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * 루틴 동기화 (`docs/13-sync.md` §루틴) — Bento(맥)와 iPhone 앱이 부른다.
 *
 *   GET  ?since=<cursor>              그 번호 다음에 바뀐 루틴·기록·타이머 (지운 것 포함). `more` 면 이어서.
 *   POST {routines, logs, timer?}    바뀐 것을 올린다. 나중에 고친 쪽이 이긴다 — 버린 것은 `stale` + `current`.
 *
 * 루틴은 **토큰 주인 한 사람의 것**이다. 문서 권한을 거치지 않고 질의가 전부 그 사람으로 좁힌다.
 * 순서는 늘 올리고 → 받기.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/** 한 번에 받는 양. 처음 붙일 때 맥의 기록 전부(루틴 × 날짜)가 한 번에 올 수 있다. */
const MAX_BATCH = 5000;

export async function GET(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const since = Number(request.nextUrl.searchParams.get("since") ?? "0");
    if (!Number.isSafeInteger(since) || since < 0) throw new ApiError(400, "since 가 이상합니다.");
    return routineChanges(viewer.userId, since);
  });
}

export async function POST(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const body = (await request.json().catch(() => null)) as {
      routines?: unknown;
      logs?: unknown;
      timer?: unknown;
    } | null;
    const routines = Array.isArray(body?.routines) ? (body.routines as IncomingRoutine[]) : [];
    const logs = Array.isArray(body?.logs) ? (body.logs as IncomingRoutineLog[]) : [];
    const timer =
      typeof body?.timer === "object" && body.timer !== null ? (body.timer as IncomingRoutineTimer) : undefined;
    if (routines.length + logs.length > MAX_BATCH) {
      throw new ApiError(413, `한 번에 ${MAX_BATCH}개까지 올릴 수 있습니다. 나눠서 보내세요.`);
    }
    return applyRoutineChanges(viewer.userId, { routines, logs, timer });
  });
}
