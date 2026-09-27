import { AskPanel } from "@/components/ask-panel";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "물어보기 — Nyanotion" };

/** 질문이 주소에 실려 올 수 있다 (팔레트에서 넘어올 때) — 미리 구울 수 없다. */
export const dynamic = "force-dynamic";

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // 로그인 확인만 한다. 어느 문서를 볼 수 있는지는 라우트가 요청마다 다시 따진다 —
  // 화면이 들고 있는 목록으로 권한을 판단하지 않는다.
  await requireViewer();
  const { q } = await searchParams;

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "물어보기" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            margin: "0 auto",
            padding: "48px 16px 120px",
          }}
        >
          <AskPanel initialQuestion={typeof q === "string" ? q : ""} />
        </div>
      </div>
    </>
  );
}
