import { createChecklist } from "@nyanotion/db";
import type { NextRequest } from "next/server";
import { ApiError, apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * 체크리스트 만들기 — Bento 를 처음 붙일 때 맞출 체크리스트가 없으면 여기서 만든다.
 * 웹의 `createChecklistAction` 과 같은 규칙: 그 공간에 쓸 수 있어야 한다.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const body = (await request.json().catch(() => null)) as { title?: unknown; spaceId?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (title === "") throw new ApiError(400, "이름이 필요합니다.");
    const spaceId =
      typeof body?.spaceId === "string"
        ? body.spaceId
        : viewer.spaces.find((space) => space.kind === "personal")?.id;
    const space = viewer.spaces.find((s) => s.id === spaceId);
    if (space === undefined || (space.baseRole !== "editor" && space.baseRole !== "owner")) {
      throw new ApiError(404, "찾을 수 없습니다.");
    }
    const { id } = await createChecklist({ spaceId: space.id, userId: viewer.userId, title });
    return { id };
  });
}
