import { NextResponse } from "next/server";
import { loadDatabaseView } from "@/lib/collection-view";
import { optionalViewer } from "@/lib/session";

/**
 * 본문에 끼운 표가 자기 내용을 가져오는 곳.
 *
 * 문서 페이지는 서버 컴포넌트라 표를 바로 그릴 수 있지만, 에디터 안의 블록은 브라우저에서
 * 그려지므로 데이터를 따로 받아야 한다. 권한 판정은 페이지와 같은 `loadDatabaseView` 가 한다 —
 * 볼 수 없는 모음이면 404 다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const viewer = await optionalViewer();
  if (viewer === null) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const view = await loadDatabaseView(id, viewer);
  if (view === null) return NextResponse.json({ error: "표를 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json(view, { headers: { "cache-control": "no-store" } });
}
