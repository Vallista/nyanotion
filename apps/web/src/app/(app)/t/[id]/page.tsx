import { documentsWithTag, listTags, tagsForDocuments } from "@nyanotion/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIcon } from "@/components/icons";
import { SaveCollectionButton } from "@/components/save-collection-button";
import { TagActions } from "@/components/tag-actions";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle } from "@/lib/tree";

/** 태그 하나에 달린 문서들. 트리가 "어디에 있나"라면 여기는 "무엇에 관한 것인가"로 모아 본다. */
export default async function TagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();

  const tags = await listTags(viewer.spaceIds);
  const tag = tags.find((item) => item.id === id);
  if (tag === undefined) notFound();

  const docs = await documentsWithTag(viewer.spaceIds, id);
  const tagMap = await tagsForDocuments(docs.map((doc) => doc.id));

  return (
    <>
      <TopBar
        crumbs={[
          { id: null, title: viewer.personalSpace.name },
          { id: null, title: tag.name },
        ]}
        right={
          <>
            <SaveCollectionButton name={tag.name} tagIds={[tag.id]} />
            <TagActions id={tag.id} name={tag.name} />
          </>
        }
      />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            {tag.name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 32 }}>
            문서 {docs.length}개
          </p>

          {docs.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.75 }}>
              이 태그가 달린 문서가 없습니다. 문서를 열어 제목 아래에서 태그를 달 수 있어요.
            </p>
          ) : (
            <ul style={{ padding: 0 }}>
              {docs.map((doc) => (
                <li key={doc.id}>
                  <Link
                    href={`/d/${doc.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minHeight: 40,
                      padding: "6px 8px",
                      border: 0,
                      color: "var(--ink)",
                      borderBottom: "1px solid var(--line-soft)",
                    }}
                  >
                    <span style={{ display: "flex", color: "var(--ink-4)" }}>
                      <PageIcon size={15} />
                    </span>
                    <span
                      style={{
                        flexGrow: 1,
                        minWidth: 0,
                        fontSize: 14.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayTitle(doc.title)}
                    </span>
                    <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {(tagMap.get(doc.id) ?? [])
                        .filter((other) => other.id !== tag.id)
                        .slice(0, 3)
                        .map((other) => (
                          <span
                            key={other.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              height: 18,
                              padding: "0 6px",
                              borderRadius: "var(--radius-sm)",
                              background: "var(--chip)",
                              fontSize: 11,
                              color: "var(--ink-3)",
                            }}
                          >
                            {other.name}
                          </span>
                        ))}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
                      {formatWhen(doc.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
