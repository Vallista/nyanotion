import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CatMark } from "@/components/cat-mark";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect("/login");

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
        <CatMark size={19} color="var(--ink)" />
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.012em" }}>캣타워</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{session.user.email}</span>
          <SignOutButton />
        </span>
      </header>

      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 18, opacity: 0.55 }}>
            <CatMark size={44} color="var(--ink-5)" />
          </div>
          <p style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 6 }}>
            아직 문서가 없어요
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: "var(--ink-3)" }}>
            문서 트리와 에디터는 다음 단계(M1)에서 올라옵니다. 지금은 계정과 로그인까지 되어 있어요.
          </p>
        </div>
      </div>
    </main>
  );
}
