import { documentByPublicToken } from "@nyanotion/db";
import { CatMark } from "@/components/cat-mark";
import { ReadOnlyBlocks } from "@/components/read-only-blocks";
import { formatWhen } from "@/lib/format";
import { displayTitle } from "@/lib/tree";

export const metadata = { title: "공유된 문서" };

/**
 * 공개 링크로 열리는 화면. **로그인 밖에 있다.**
 *
 * 실효 권한 계산을 거치지 않는 유일한 읽기 경로이므로, 대신 그 문서 하나로만 제한된다 —
 * 하위 문서도, 사이드바도, 검색도 없다. 편집기도 내려보내지 않는다(읽기뿐이라 쓸모가 없다).
 */
export default async function PublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await documentByPublicToken(token);

  if (view === null) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, opacity: 0.5 }}>
            <CatMark size={40} color="var(--ink-5)" />
          </div>
          <p style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 6 }}>
            열 수 없는 링크입니다
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-3)" }}>
            링크가 꺼졌거나, 기한이 지났거나, 문서가 지워졌어요.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          height: 46,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 18px 0 16px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <CatMark size={18} color="var(--ink-3)" />
        <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>공유된 문서 · 읽기 전용</span>
      </header>

      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <article
          style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}
        >
          <h1
            style={{
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "-0.022em",
              lineHeight: 1.34,
              marginBottom: 14,
            }}
          >
            {displayTitle(view.title)}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 30 }}>
            {formatWhen(view.updatedAt)}에 고침
          </p>

          <ReadOnlyBlocks content={view.contentJson} />
        </article>
      </div>
    </main>
  );
}
