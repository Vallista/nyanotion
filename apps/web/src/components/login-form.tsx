"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { CatMark } from "./cat-mark";

/**
 * 로그인, 그리고 **초대 링크를 타고 왔거나 이 서버의 첫 계정일 때만** 가입.
 * 가입 자체를 막는 건 서버(`lib/auth.ts` 의 가입 훅)다 — 여기 화면은 안내일 뿐이다.
 */
export function LoginForm({ bootstrap = false }: { bootstrap?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get("invite");
  const invitedEmail = params.get("email");

  const canSignUp = invite !== null || bootstrap;
  const [mode, setMode] = useState<"in" | "up">(canSignUp ? "up" : "in");
  const [email, setEmail] = useState(invitedEmail ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "up"
        ? await authClient.signUp.email({ email, password, name: name.trim() || email })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(
        result.error.message ??
          (mode === "up"
            ? "계정을 만들지 못했습니다. 초대받은 주소가 맞는지 확인해 주세요."
            : "로그인하지 못했습니다. 주소와 비밀번호를 확인해 주세요."),
      );
      setBusy(false);
      return;
    }

    // 초대를 타고 가입했으면 그 초대장으로 되돌아가 가족에 들어간다.
    router.push(invite === null ? "/" : `/invite/${invite}`);
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 40,
          }}
        >
          <CatMark size={30} color="var(--ink)" />
          <h1 style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em", marginTop: 14 }}>
            Nyanotion
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>가족 문서 서버</p>
        </div>

        <form onSubmit={onSubmit}>
          {mode === "up" && (
            <label className="field">
              <span>이름</span>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="가족에게 보일 이름"
              />
            </label>
          )}

          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              readOnly={invitedEmail !== null}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === "up" ? "new-password" : "current-password"}
              required
              minLength={mode === "up" ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "up" && (
              <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 400 }}>
                열 자 이상
              </span>
            )}
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
            {busy
              ? mode === "up"
                ? "만드는 중…"
                : "들어가는 중…"
              : mode === "up"
                ? "계정 만들기"
                : "로그인"}
          </button>
        </form>

        {canSignUp ? (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            {bootstrap && invite === null && (
              <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-3)", marginBottom: 10 }}>
                이 서버에는 아직 계정이 없습니다. 지금 만드는 것이 <b style={{ fontWeight: 500 }}>첫 계정</b>이고,
                그다음부터는 초대를 받아야 들어올 수 있어요.
              </p>
            )}
            <button
              onClick={() => {
                setMode((value) => (value === "up" ? "in" : "up"));
                setError(null);
              }}
              style={{ fontSize: 12.5, color: "var(--ink-3)" }}
            >
              {mode === "up" ? "이미 계정이 있어요" : "계정을 새로 만들래요"}
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 38, paddingTop: 26, borderTop: "1px solid var(--line)" }}>
            <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginBottom: 5 }}>
              계정은 초대로만 만들어집니다
            </p>
            <p style={{ fontSize: 12.5, lineHeight: 1.66, color: "var(--ink-3)" }}>
              가입 화면은 따로 없어요. 가족 중 누군가에게 초대 링크를 받아서 열면 그 자리에서 계정이
              만들어집니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
