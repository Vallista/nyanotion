import { accountInviteByToken } from "@nyanotion/db";
import { headers } from "next/headers";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { auth } from "@/lib/auth";

export const metadata = { title: "초대" };

/**
 * 계정 초대 링크 (가족 없이 계정만 — 어드민이 만든다). 로그인 밖에 있는 화면이다.
 *
 * 가입을 막는 것은 여기가 아니라 `auth.ts` 의 가입 훅이다 — 이 주소로 살아 있는 계정 초대가
 * 있어야 계정이 만들어진다. 여기는 안내와 주소를 미리 채워 주는 것뿐이다.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await accountInviteByToken(token);
  const session = await auth.api.getSession({ headers: await headers() });

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
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <BrandMark size={30} color="var(--ink)" />
          <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em", marginTop: 14 }}>
            도란
          </h1>
        </div>

        {invite === null ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 8 }}>쓸 수 없는 초대장입니다</p>
            <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-3)" }}>
              이미 쓰였거나, 기한이 지났거나, 취소된 링크예요.
              <br />
              보낸 사람에게 새 링크를 받아 주세요.
            </p>
          </div>
        ) : session !== null ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.8, marginBottom: 18 }}>
              이미 <strong style={{ fontWeight: 500 }}>{session.user.email}</strong> 으로 로그인되어
              있어요. 이 초대는 새 계정을 만드는 것이라 지금 계정에는 쓸 일이 없습니다.
            </p>
            <Link href="/">캘린더로 가기</Link>
          </div>
        ) : (
          <>
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.8,
                color: "var(--ink-2)",
                textAlign: "center",
                marginBottom: 26,
              }}
            >
              도란 계정을 만들 수 있게 초대받았습니다.
            </p>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                marginBottom: 22,
              }}
            >
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 3 }}>초대받은 주소</p>
              <p style={{ fontSize: 14, color: "var(--ink)" }}>{invite.email}</p>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-3)", marginBottom: 18 }}>
              이 주소로만 계정을 만들 수 있어요.
            </p>
            <Link
              href={`/login?join=${token}&email=${encodeURIComponent(invite.email)}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 42,
                background: "var(--accent)",
                color: "var(--on-accent)",
                borderRadius: "var(--radius)",
                fontSize: 14,
                fontWeight: 500,
                border: 0,
              }}
            >
              계정 만들기
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
