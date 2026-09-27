import { listTree, searchDocuments } from "@nyanotion/db";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/session";
import { take } from "@/lib/rate-limit";
import { displayTitle, pathTo } from "@/lib/tree";

/**
 * `@` 로 문서를 찾는다.
 *
 * **검색 자체가 권한 경계다** — `searchDocuments` 는 `viewer.spaceIds` 로만 훑으므로
 * 볼 수 없는 문서는 애초에 결과에 없다. 여기서 따로 거르지 않는다 (거르면 두 군데가 된다).
 *
 * 제목만 주면 같은 이름이 여럿일 때 구분이 안 되므로 **상위 경로**를 함께 준다.
 * 트리는 제목·부모만 담은 가벼운 질의라 검색 한 번에 같이 가져와도 괜찮다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const viewer = await requireViewer();

  // 글자를 칠 때마다 부른다 — 싸지만 상한은 둔다.
  const verdict = take("mention", viewer.userId);
  if (!verdict.ok) return NextResponse.json({ documents: [] }, { status: 429 });

  const [hits, nodes] = await Promise.all([
    searchDocuments(viewer.spaceIds, query, { limit: 8 }),
    listTree(viewer.spaceIds),
  ]);

  const documents = hits.map((hit) => {
    // 자기 자신은 빼고 조상만 — "어디에 있는 문서인지"만 알려 주면 된다.
    const ancestors = pathTo(nodes, hit.id).slice(0, -1);
    return {
      id: hit.id,
      title: hit.title,
      breadcrumb: ancestors.map((node) => displayTitle(node.title)).join(" / "),
    };
  });

  return NextResponse.json({ documents }, { headers: { "cache-control": "no-store" } });
}
