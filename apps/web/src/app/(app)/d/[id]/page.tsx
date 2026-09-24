import { getDocument, listTree } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { DocumentActions } from "@/components/document-actions";
import { DocumentView } from "@/components/document-view";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle, pathTo } from "@/lib/tree";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();

  const [doc, nodes] = await Promise.all([
    getDocument(id, viewer.spaceId),
    listTree(viewer.spaceId),
  ]);
  if (doc === null || doc.archivedAt !== null) notFound();

  const crumbs = [
    { id: null, title: viewer.spaceName },
    ...pathTo(nodes, id).map((n) => ({ id: n.id, title: displayTitle(n.title) })),
  ];

  return (
    <>
      <TopBar crumbs={crumbs} right={<DocumentActions id={doc.id} />} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <DocumentView
          key={doc.id}
          id={doc.id}
          initialTitle={doc.title}
          initialContent={doc.contentJson}
          updatedAt={formatWhen(doc.updatedAt)}
        />
      </div>
    </>
  );
}
