import { invitationByToken } from "@nyanotion/db";
import { headers } from "next/headers";
import Link from "next/link";
import { AcceptInvite } from "@/components/accept-invite";
import { CatMark } from "@/components/cat-mark";
import { auth } from "@/lib/auth";

export const metadata = { title: "초대" };

/**
 * 초대 링크. 로그인 밖에 있는 화면이다 — 아직 계정이 없는 사람이 먼저 여기로 온다.
 *
 * 가입 자체는 `/login` 이 아니라 여기서 막는 게 아니라, `auth.ts` 의 가입 훅이 막는다:
 * 살아 있는 초대가 있는 주소만 계정이 만들어진다.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await invitationByToken(token);
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <CatMark size={30} color="var(--ink)" />
          <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em", marginTop: 14 }}>
            Nyanotion
          </h1>
        </div>

        {invitation === null ? (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 8 }}>
              쓸 수 없는 초대장입니다
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-3)" }}>
              이미 쓰였거나, 기한이 지났거나, 취소된 링크예요.
              <br />
              초대한 사람에게 새 링크를 받아 주세요.
            </p>
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
              <strong style={{ fontWeight: 600, color: "var(--ink)" }}>
                {invitation.organizationName}
              </strong>{" "}
              가족에 초대받았습니다.
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
              <p style={{ fontSize: 14, color: "var(--ink)" }}>{invitation.email}</p>
            </div>

            {session === null ? (
              <>
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.75,
                    color: "var(--ink-3)",
                    marginBottom: 18,
                  }}
                >
                  이 주소로 계정을 만들거나 로그인하면 들어옵니다. 다른 주소로는 들어올 수 없어요.
                </p>
                <Link
                  href={`/login?invite=${token}&email=${encodeURIComponent(invitation.email)}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 42,
                    background: "var(--ink)",
                    color: "var(--paper)",
                    borderRadius: "var(--radius)",
                    fontSize: 14,
                    fontWeight: 500,
                    border: 0,
                  }}
                >
                  계정 만들고 들어가기
                </Link>
              </>
            ) : (
              <AcceptInvite
                token={token}
                invitedEmail={invitation.email}
                sessionEmail={session.user.email}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
