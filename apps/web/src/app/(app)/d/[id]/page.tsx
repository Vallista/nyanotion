import {
  isFavorite,
  listPublicLinks,
  listShares,
  listTags,
  listTree,
  organizationsByIds,
  tagsForDocuments,
  usersByIds,
} from "@nyanotion/db";
import { notFound } from "next/navigation";
import { DocumentActions } from "@/components/document-actions";
import { DocumentView } from "@/components/document-view";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requestOrigin } from "@/lib/origin";
import { requireDocument } from "@/lib/session";
import { displayTitle, pathTo } from "@/lib/tree";
import { userColor } from "@/lib/user-color";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 권한 판정은 여기서 한 번 — access.ts 를 통과하지 못하면 404 다.
  const { viewer, doc, role } = await requireDocument(id);
  if (doc.archivedAt !== null) notFound();

  const canWrite = role === "editor" || role === "owner";
  const canShare = role === "owner";

  const [nodes, tagMap, allTags, favorite, shares, links] = await Promise.all([
    listTree(viewer.spaceIds),
    tagsForDocuments([id]),
    listTags(viewer.spaceIds),
    isFavorite(viewer.userId, id),
    canShare ? listShares(id) : Promise.resolve([]),
    canShare ? listPublicLinks(id) : Promise.resolve([]),
  ]);

  // 공유 목록에 사람·가족 이름을 붙인다 (한 번에 가져와 N+1 을 만들지 않는다).
  const [people, orgs] = await Promise.all([
    usersByIds(shares.filter((s) => s.subjectType === "user").map((s) => s.subjectId)),
    organizationsByIds(shares.filter((s) => s.subjectType === "org").map((s) => s.subjectId)),
  ]);

  const origin = await requestOrigin();
  const spaceName =
    viewer.spaces.find((item) => item.id === doc.spaceId)?.name ?? viewer.personalSpace.name;

  const crumbs: { id: string | null; title: string }[] = [{ id: null, title: spaceName }];
  for (const node of pathTo(nodes, id)) crumbs.push({ id: node.id, title: displayTitle(node.title) });
  // 공유로 들어온 문서는 내 트리에 없을 수 있다 — 그때는 제목만 세운다.
  if (crumbs.length === 1) crumbs.push({ id: doc.id, title: displayTitle(doc.title) });

  return (
    <>
      <TopBar
        crumbs={crumbs}
        right={
          <DocumentActions
            id={doc.id}
            favorite={favorite}
            canWrite={canWrite}
            canShare={canShare}
            families={viewer.spaces
              .filter((item) => item.organizationId !== null)
              .map((item) => ({
                id: item.organizationId as string,
                name: item.organizationName ?? item.name,
              }))}
            shares={shares.map((item) => ({
              shareId: item.id,
              subjectId: item.subjectId,
              kind: item.subjectType === "org" ? ("org" as const) : ("user" as const),
              label:
                item.subjectType === "org"
                  ? (orgs.get(item.subjectId) ?? "가족")
                  : (people.get(item.subjectId)?.name ?? "사람"),
              sub:
                item.subjectType === "org"
                  ? "가족 전체"
                  : (people.get(item.subjectId)?.email ?? ""),
              role: item.role,
            }))}
            links={links.map((item) => ({
              id: item.id,
              url: `${origin}/p/${item.token}`,
              expiresAt: item.expiresAt === null ? null : formatWhen(item.expiresAt),
            }))}
          />
        }
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
