import { getCollection, listTags, searchDocuments, tagsForDocuments } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { CollectionActions } from "@/components/collection-actions";
import { DatabaseTable } from "@/components/database-table";
import { DocumentTable } from "@/components/document-table";
import { TopBar } from "@/components/top-bar";
import { loadDatabaseView } from "@/lib/collection-view";
import { requireViewer } from "@/lib/session";

/**
 * 모음. 두 종류다.
 *   filter — 조건에 맞는 문서를 보여 준다 (문서를 소유하지 않는다)
 *   manual — 손으로 담은 줄 + 속성. 노션의 데이터베이스가 이쪽이다.
 */
export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();

  const saved = await getCollection(id, viewer.spaceIds);
  if (saved === null) notFound();

  const space = viewer.spaces.find((item) => item.id === saved.spaceId);

  if (saved.source === "manual") {
    // 본문에 끼운 표와 **같은 코드**로 모은다 — lib/collection-view.ts
    const view = await loadDatabaseView(id, viewer);
    if (view === null) notFound();
    const { columns, rows, people, canWrite } = view;

    return (
      <>
        <TopBar
          crumbs={[
            { id: null, title: space?.name ?? viewer.personalSpace.name },
            { id: null, title: saved.name },
          ]}
          right={<CollectionActions id={saved.id} name={saved.name} view={saved.view} />}
        />
        <div style={{ flexGrow: 1, overflowY: "auto" }}>
          <div style={{ width: "100%", maxWidth: 980, margin: "0 auto", padding: "56px 16px 120px" }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
              {saved.name}
            </h1>
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28 }}>
              줄 {rows.length}개 · 속성 {columns.length}개
            </p>
            <DatabaseTable
              collectionId={saved.id}
              columns={columns}
              rows={rows}
              people={people}
              canWrite={canWrite}
            />
          </div>
        </div>
      </>
    );
  }

  const [hits, allTags] = await Promise.all([
    searchDocuments(viewer.spaceIds, saved.filter.query, {
      tagIds: saved.filter.tagIds,
      limit: 200,
    }),
    listTags(viewer.spaceIds),
  ]);
  const tagMap = await tagsForDocuments(hits.map((hit) => hit.id));
  const tagNames = new Map(allTags.map((tag) => [tag.id, tag.name]));

  const conditions = [
    saved.filter.query === "" ? null : `"${saved.filter.query}"`,
    saved.filter.tagIds.length === 0
      ? null
      : saved.filter.tagIds.map((tagId) => tagNames.get(tagId) ?? "?").join(" · "),
  ].filter((value): value is string => value !== null);

  return (
    <>
      <TopBar
        crumbs={[
          { id: null, title: space?.name ?? viewer.personalSpace.name },
          { id: null, title: saved.name },
        ]}
        right={<CollectionActions id={saved.id} name={saved.name} view={saved.view} />}
      />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 880, margin: "0 auto", padding: "56px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            {saved.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 32 }}>
            문서 {hits.length}개
            {conditions.length > 0 && ` · ${conditions.join(" · ")}`}
          </p>

          {hits.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.75 }}>
              조건에 맞는 문서가 없습니다.
            </p>
          ) : (
            <DocumentTable
              view={saved.view}
              rows={hits.map((hit) => ({
                id: hit.id,
                title: hit.title,
                snippet: hit.snippet,
                updatedAt: hit.updatedAt,
                tags: (tagMap.get(hit.id) ?? []).map((tag) => tag.name),
              }))}
            />
          )}
        </div>
      </div>
    </>
  );
}
