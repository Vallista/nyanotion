import { publicKey } from "@nyanotion/notify";
import Link from "next/link";
import { CatMark } from "@/components/cat-mark";
import { NotificationsButton } from "@/components/notifications-button";
import { PersistStorageButton } from "@/components/persist-storage-button";

export const metadata = { title: "Nyanotion 설치하기" };

// 알림 공개키를 빌드에 구우면 키를 바꿨을 때 옛 값이 남는다. 요청마다 읽는다.
export const dynamic = "force-dynamic";

/**
 * iOS 의 "홈 화면에 추가"는 공유 메뉴 안에 숨어 있어서, 말로 설명하면 가족이 반드시 실패한다.
 * 그래서 화면 하나를 따로 둔다 — docs/05-clients.md §3.
 * 로그인 없이 볼 수 있어야 한다 (초대 링크를 받은 사람이 먼저 여기를 볼 수 있다).
 */
export default async function InstallPage() {
  // 공개키는 비밀이 아니다 — 브라우저가 구독할 때 그대로 쓴다.
  const vapid = publicKey();

  return (
    <main style={{ minHeight: "100dvh", padding: "48px 16px 96px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <CatMark size={26} color="var(--ink)" />
          <h1
            style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.02em" }}
          >
            앱처럼 쓰기
          </h1>
        </div>

        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.8,
            color: "var(--ink-2)",
            marginBottom: 36,
          }}
        >
          홈 화면에 추가하면 Safari 주소창 없이 앱처럼 열리고,{" "}
          <strong style={{ fontWeight: 500 }}>
            인터넷이 없어도 문서를 쓸 수 있습니다.
          </strong>{" "}
          쓴 글은 기기에 남았다가 집 서버가 돌아오면 저절로 합쳐집니다.
        </p>

        <Section title="아이폰 · 아이패드">
          <Step n={1}>
            <strong style={{ fontWeight: 500 }}>Safari</strong> 로 이 페이지를
            엽니다. (크롬이나 다른 앱 안의 브라우저로는 안 됩니다)
          </Step>
          <Step n={2}>
            아래쪽 가운데 <Key>공유</Key> 버튼을 누릅니다. 네모에 위쪽 화살표가
            있는 아이콘이에요.
          </Step>
          <Step n={3}>
            목록을 아래로 내려 <Key>홈 화면에 추가</Key> 를 고릅니다.
          </Step>
          <Step n={4}>
            오른쪽 위 <Key>추가</Key> 를 누르면 끝. 홈 화면에 고양이 아이콘이
            생깁니다.
          </Step>
        </Section>

        <Section title="데스크탑 (크롬 · 엣지)">
          <Step n={1}>
            주소창 오른쪽 끝의 <Key>설치</Key> 아이콘을 누릅니다. 모니터에 아래
            화살표가 있는 모양이에요.
          </Step>
          <Step n={2}>
            안 보이면 메뉴 → 캐스트·저장·공유 → 페이지를 앱으로 설치.
          </Step>
        </Section>

        <section
          style={{
            marginTop: 40,
            padding: "18px 20px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            오프라인으로 쓴 글을 지키려면
          </h2>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.75,
              color: "var(--ink-3)",
              marginBottom: 14,
            }}
          >
            Safari 는 한동안 안 쓴 사이트의 저장 공간을 정리합니다. 아래를 눌러
            두면 이 앱의 저장 공간을 지워지지 않게 해 달라고 요청합니다. 알림
            권한을 같이 물어보는데, 그래야 요청이 받아들여집니다.
          </p>
          <PersistStorageButton />
        </section>

        <section
          style={{
            marginTop: 20,
            padding: "18px 20px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            알림 받기
          </h2>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.75,
              color: "var(--ink-3)",
              marginBottom: 14,
            }}
          >
            살 것을 자동으로 찾아 놓으면{" "}
            <strong style={{ fontWeight: 500 }}>
              가족 중 누구든 한 명이 승인
            </strong>
            해야 실제로 삽니다. 그때 이 기기로 알려 드립니다.
          </p>
          <NotificationsButton publicKey={vapid} />
        </section>

        <p style={{ marginTop: 36, fontSize: 13, color: "var(--ink-3)" }}>
          <Link href="/">캣타워로 돌아가기</Link>
        </p>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 34 }}>
      <h2
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--ink-3)",
          letterSpacing: "0.01em",
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      <ol
        style={{
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
      </ol>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          marginTop: 3,
          borderRadius: "50%",
          background: "var(--chip)",
          color: "var(--ink-2)",
          fontSize: 11.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.75, color: "var(--ink-2)" }}>
        {children}
      </span>
    </li>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        background: "var(--chip)",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        fontWeight: 500,
        color: "var(--ink)",
      }}
    >
      {children}
    </span>
  );
}
