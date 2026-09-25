import { isFavorite, listTags, listTree, tagsForDocuments } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { DocumentActions } from "@/components/document-actions";
import { DocumentView } from "@/components/document-view";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requireDocument } from "@/lib/session";
import { displayTitle, pathTo } from "@/lib/tree";
import { userColor } from "@/lib/user-color";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 권한 판정은 여기서 한 번 — access.ts 를 통과하지 못하면 404 다.
  const { viewer, doc, role } = await requireDocument(id);
  if (doc.archivedAt !== null) notFound();

  const [nodes, tagMap, allTags, favorite] = await Promise.all([
    listTree(viewer.spaceIds),
    tagsForDocuments([id]),
    listTags(viewer.spaceIds),
    isFavorite(viewer.userId, id),
  ]);

  const spaceName =
    viewer.spaces.find((item) => item.id === doc.spaceId)?.name ?? viewer.personalSpace.name;
  const canWrite = role === "editor" || role === "owner";

  const crumbs = [
    { id: null as string | null, title: spaceName },
    ...pathTo(nodes, id).map((node) => ({ id: node.id as string | null, title: displayTitle(node.title) })),
  ];
  // 공유로 들어온 문서는 내 트리에 없을 수 있다 — 그때는 제목만 세운다.
  if (crumbs.length === 1) crumbs.push({ id: doc.id, title: displayTitle(doc.title) });

  return (
    <>
      <TopBar
        crumbs={crumbs}
        right={<DocumentActions id={doc.id} favorite={favorite} canWrite={canWrite} />}
      />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <DocumentView
          key={doc.id}
          id={doc.id}
          initialTitle={doc.title}
          updatedAt={formatWhen(doc.updatedAt)}
          user={{ name: viewer.name, color: userColor(viewer.userId) }}
          tags={tagMap.get(id) ?? []}
          tagSuggestions={allTags.map((item) => ({ id: item.id, name: item.name }))}
          canWrite={canWrite}
        />
      </div>
    </>
  );
}
