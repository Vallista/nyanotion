import {
  documentOfChecklist,
  listChecklistItems,
  usersByIds,
  watchersOfDocument,
} from "@nyanotion/db";
import { homeNow, roleAllows } from "@nyanotion/shared";
import { notFound } from "next/navigation";
import { ChecklistBoard } from "@/components/checklist-board";
import { ChecklistMenu } from "@/components/checklist-menu";
import { TopBar } from "@/components/top-bar";
import { requireDocument } from "@/lib/session";

export const metadata = { title: "체크리스트 — Nyanotion" };

/**
 * 체크리스트 하나. **권한은 그 문서로 본다** — 없으면 404 (`requireDocument`).
 * 읽기만 되는 사람(viewer·commenter)에게는 체크 상자가 눌리지 않게 보여 준다.
 */
export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = await documentOfChecklist(id);
  if (documentId === null) notFound();

  const { viewer, doc, role } = await requireDocument(documentId);
  // 모래상자에 간 체크리스트는 열리지 않는다 — 문서 화면과 같은 규칙.
  if (doc.archivedAt !== null) notFound();
  const space = viewer.spaces.find((item) => item.id === doc.spaceId);

  const [items, watchers] = await Promise.all([
    listChecklistItems(id),
    watchersOfDocument(documentId),
  ]);
  const people = await usersByIds([
    ...new Set([
      ...watchers,
      ...items.flatMap((item) => (item.doneBy === null ? [] : [item.doneBy])),
      ...items.flatMap((item) => (item.assigneeId === null ? [] : [item.assigneeId])),
    ]),
  ]);

  const title = doc.title.trim() === "" ? "제목 없는 체크리스트" : doc.title;

  return (
    <>
      <TopBar
        crumbs={[
          { id: null, title: "체크리스트", href: "/lists" },
          { id: null, title },
        ]}
        right={roleAllows(role, "editor") ? <ChecklistMenu checklistId={id} title={title} /> : undefined}
      />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 820, margin: "0 auto", padding: "48px 16px 120px" }}>
          <ChecklistBoard
            checklistId={id}
            documentId={documentId}
            title={title}
            icon={doc.icon}
            spaceName={
              space === undefined
                ? ""
                : space.kind === "org"
                  ? (space.organizationName ?? space.name)
                  : space.name
            }
            family={space?.kind === "org"}
            canWrite={roleAllows(role, "editor")}
            items={items}
            people={[...people.entries()].map(([pid, info]) => ({ id: pid, name: info.name }))}
            members={watchers}
            today={homeNow().day}
            userId={viewer.userId}
          />
        </div>
      </div>
    </>
  );
}
