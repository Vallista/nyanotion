import { listRecent } from "@nyanotion/db";
import Link from "next/link";
import { CatMark } from "@/components/cat-mark";
import { NewDocumentButton } from "@/components/new-document-button";
import { TopBar } from "@/components/top-bar";
import { PageIcon } from "@/components/icons";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { displayTitle } from "@/lib/tree";

/** 캣타워 — 대시보드 위젯을 늘어놓지 않는다. 조용한 시작 화면. */
export default async function HomePage() {
  const viewer = await requireViewer();
  const recent = await listRecent(viewer.spaceIds, 12);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "캣타워" }]} right={<NewDocumentButton />} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              marginBottom: 4,
            }}
          >
            {viewer.name.trim() === "" ? "안녕하세요" : `${viewer.name} 님, 안녕하세요`}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)" }}>{viewer.personalSpace.name}</p>

          {recent.length === 0 ? (
            <EmptyState />
          ) : (
            <section style={{ marginTop: 40 }}>
              <h2
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: "var(--ink-3)",
                  letterSpacing: "0.01em",
                  marginBottom: 8,
                }}
              >
                최근 고친 문서
              </h2>
              <ul style={{ padding: 0 }}>
                {recent.map((doc) => (
                  <li key={doc.id}>
                    <Link
                      href={`/d/${doc.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        height: 38,
                        padding: "0 8px",
                        borderRadius: "var(--radius)",
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
                      <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
                        {formatWhen(doc.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div style={{ marginTop: 72, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: 0.5 }}>
        <CatMark size={44} color="var(--ink-5)" />
      </div>
      <p style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 6 }}>아직 문서가 없어요</p>
      <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-3)" }}>
        왼쪽 위 <strong style={{ fontWeight: 500 }}>+</strong> 를 눌러 첫 문서를 만드세요.
        <br />
        문서 안에 문서를 넣어 묶을 수 있습니다.
      </p>
    </div>
  );
}
