"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CatMark } from "@/components/cat-mark";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? "로그인하지 못했습니다. 주소와 비밀번호를 확인해 주세요.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

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
      <div style={{ width: "100%", maxWidth: 372 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 40 }}>
          <CatMark size={30} color="var(--ink)" />
          <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em", marginTop: 14 }}>
            Nyanotion
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>가족 문서 서버</p>
        </div>

        <form onSubmit={onSubmit}>
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error !== null && (
            <p
              role="alert"
              style={{
                fontSize: 12.5,
                lineHeight: 1.6,
                color: "var(--ink-2)",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: "10px 12px",
                marginBottom: 16,
              }}
            >
              {error}
            </p>
          )}

          <button type="submit" className="button-primary" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? "들어가는 중…" : "로그인"}
          </button>
        </form>

        <div style={{ marginTop: 38, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
          <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginBottom: 5 }}>
            계정은 초대로만 만들어집니다
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.66, color: "var(--ink-3)" }}>
            가입 화면은 따로 없어요. 가족 중 누군가에게 초대 링크를 받아서 열면 그 자리에서 계정이
            만들어집니다.
          </p>
        </div>
      </div>
    </main>
  );
}
