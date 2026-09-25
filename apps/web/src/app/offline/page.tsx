import { CatMark } from "@/components/cat-mark";

/** 서비스 워커가 아무것도 못 찾았을 때 보여 주는 화면. 정적이어야 한다 — DB 를 보지 않는다. */
export default function OfflinePage() {
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
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18, opacity: 0.5 }}>
          <CatMark size={44} color="var(--ink-5)" />
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>서버에 닿지 않아요</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.75, color: "var(--ink-3)" }}>
          집 서버가 꺼져 있거나 네트워크가 끊겼습니다.
          <br />
          <strong style={{ fontWeight: 500, color: "var(--ink-2)" }}>
            이미 열어 본 문서는 그대로 쓸 수 있고
          </strong>
          , 지금 쓴 글은 이 기기에 남았다가 서버가 돌아오면 저절로 합쳐집니다.
        </p>
      </div>
    </main>
  );
}
