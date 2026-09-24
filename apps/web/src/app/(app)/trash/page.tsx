import { listArchived } from "@nyanotion/db";
import { TopBar } from "@/components/top-bar";
import { TrashList } from "@/components/trash-list";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle } from "@/lib/tree";

/** 모래상자. 삭제는 여기서만 실제로 일어난다. */
export default async function TrashPage() {
  const viewer = await requireViewer();
  const archived = await listArchived(viewer.spaceId);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "모래상자" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            모래상자
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-3)", marginBottom: 32 }}>
            버린 문서는 여기 남아 있습니다. 되돌리면 하위 문서까지 함께 살아납니다.
            <br />
            비우면 정말로 사라집니다.
          </p>

          <TrashList
            items={archived.map((doc) => ({
              id: doc.id,
              title: displayTitle(doc.title),
              archivedAt: formatWhen(doc.archivedAt),
            }))}
          />
        </div>
      </div>
    </>
  );
}
