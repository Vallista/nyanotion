import { getDocument, isFavorite, listTags, listTree, tagsForDocuments } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { DocumentActions } from "@/components/document-actions";
import { DocumentView } from "@/components/document-view";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle, pathTo } from "@/lib/tree";
import { userColor } from "@/lib/user-color";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();

  const [doc, nodes, tagMap, allTags, favorite] = await Promise.all([
    getDocument(id, viewer.spaceId),
    listTree(viewer.spaceId),
    tagsForDocuments([id]),
    listTags(viewer.spaceId),
    isFavorite(viewer.userId, id),
  ]);
  if (doc === null || doc.archivedAt !== null) notFound();

  const crumbs = [
    { id: null, title: viewer.spaceName },
    ...pathTo(nodes, id).map((n) => ({ id: n.id, title: displayTitle(n.title) })),
  ];

  return (
    <>
      <TopBar crumbs={crumbs} right={<DocumentActions id={doc.id} favorite={favorite} />} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <DocumentView
          key={doc.id}
          id={doc.id}
          initialTitle={doc.title}
          updatedAt={formatWhen(doc.updatedAt)}
          user={{ name: viewer.name, color: userColor(viewer.userId) }}
          tags={tagMap.get(id) ?? []}
          tagSuggestions={allTags.map((tag) => ({ id: tag.id, name: tag.name }))}
        />
      </div>
    </>
  );
}
