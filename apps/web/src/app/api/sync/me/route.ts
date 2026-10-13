import { listChecklists, primaryChecklist } from "@nyanotion/db";
import type { NextRequest } from "next/server";
import { apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * 동기화 시작점 — 이 토큰이 누구인지, 그리고 맞출 수 있는 체크리스트들.
 * Bento 설정 화면이 "어느 체크리스트와 맞출지" 고를 때 쓴다. 기본은 내 문서의 기본 체크리스트.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const lists = await listChecklists(viewer.spaceIds);
    const personal = viewer.spaces.find((space) => space.kind === "personal");
    const primary = personal === undefined ? null : await primaryChecklist(personal.id);
    return {
      user: { id: viewer.userId, name: viewer.name, email: viewer.email },
      personalSpaceId: personal?.id ?? null,
      primaryChecklistId: primary?.id ?? null,
      checklists: lists
        .map((list) => {
          const space = viewer.spaces.find((s) => s.id === list.spaceId);
          return {
            id: list.id,
            title: list.title,
            spaceId: list.spaceId,
            spaceKind: space?.kind ?? "personal",
            spaceName: space?.kind === "org" ? (space.organizationName ?? space.name) : (space?.name ?? ""),
            canWrite: space?.baseRole === "editor" || space?.baseRole === "owner",
            open: list.open,
          };
        })
        .filter((list) => list.canWrite),
    };
  });
}
