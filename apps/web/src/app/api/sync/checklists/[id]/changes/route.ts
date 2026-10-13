import {
  applyChanges,
  documentOfChecklist,
  syncChanges,
  type IncomingFolder,
  type IncomingItem,
} from "@nyanotion/db";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { ApiError, apiRequireDocument, apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * 체크리스트 하나의 동기화 (`docs/13-sync.md`).
 *
 *   GET  ?since=<cursor>   그 번호 다음에 바뀐 폴더·항목 (지운 것 포함). `more` 면 이어서 또 부른다.
 *   POST {folders, items}  바뀐 것을 올린다. 나중에 고친 쪽이 이긴다 — 버려진 id 는 `stale` 로 온다.
 *
 * 순서는 늘 **올리고 → 받기.** 올린 것이 받는 쪽에 섞여 돌아오지만(번호가 새로 붙으므로) 같은 값이라 무해하다.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/** 한 번에 받는 양. 처음 붙일 때 Bento 의 할 일 전부가 한 번에 올 수 있다. */
const MAX_BATCH = 2000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await params;
    const viewer = await apiViewer(request);
    await apiRequireDocument(viewer, await documentOfChecklist(id), "viewer");
    const since = Number(request.nextUrl.searchParams.get("since") ?? "0");
    if (!Number.isSafeInteger(since) || since < 0) throw new ApiError(400, "since 가 이상합니다.");
    return syncChanges(id, since);
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const { id } = await params;
    const viewer = await apiViewer(request);
    await apiRequireDocument(viewer, await documentOfChecklist(id), "editor");

    const body = (await request.json().catch(() => null)) as {
      folders?: unknown;
      items?: unknown;
    } | null;
    const folders = Array.isArray(body?.folders) ? (body.folders as IncomingFolder[]) : [];
    const items = Array.isArray(body?.items) ? (body.items as IncomingItem[]) : [];
    if (folders.length + items.length > MAX_BATCH) {
      throw new ApiError(413, `한 번에 ${MAX_BATCH}개까지 올릴 수 있습니다. 나눠서 보내세요.`);
    }

    const result = await applyChanges(id, viewer.userId, { folders, items });
    if (result.applied > 0) {
      // 웹 화면들이 다음에 열릴 때 새 값을 보게.
      revalidatePath("/lists", "layout");
      revalidatePath("/", "layout");
    }
    return result;
  });
}
