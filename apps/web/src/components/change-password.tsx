"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { inputStyle } from "./checklist-item";

/**
 * 비밀번호 바꾸기. **다른 기기는 전부 로그아웃시킨다** — 비밀번호를 바꾸는 이유의 절반은
 * "누가 알게 됐을지 모른다"이다.
 */
export function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (next.length < 10) {
      setMessage({ ok: false, text: "새 비밀번호는 10자 이상이어야 합니다." });
      return;
    }
    if (next !== again) {
      setMessage({ ok: false, text: "새 비밀번호 두 칸이 다릅니다." });
      return;
    }
    setBusy(true);
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (result.error) {
      setMessage({
        ok: false,
        text: result.error.message ?? "바꾸지 못했습니다. 지금 비밀번호를 확인해 주세요.",
      });
      return;
    }
    setCurrent("");
    setNext("");
    setAgain("");
    setMessage({ ok: true, text: "바꿨어요. 다른 기기에서는 다시 로그인해야 합니다." });
  }

  const field = { ...inputStyle, width: "100%", height: 38 };
  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)" }}>비밀번호 바꾸기</h2>
      <input
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        placeholder="지금 비밀번호 (임시 비밀번호를 받았다면 그것)"
        aria-label="지금 비밀번호"
        style={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(event) => setNext(event.target.value)}
        placeholder="새 비밀번호 (10자 이상)"
        aria-label="새 비밀번호"
        style={field}
      />
      <input
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={(event) => setAgain(event.target.value)}
        placeholder="새 비밀번호 한 번 더"
        aria-label="새 비밀번호 확인"
        style={field}
      />
      <button
        type="submit"
        disabled={busy || current === "" || next === ""}
        style={{
          height: 38,
          borderRadius: "var(--radius)",
          background: "var(--ink)",
          color: "var(--paper)",
          fontSize: 13.5,
          fontWeight: 500,
          opacity: busy || current === "" || next === "" ? 0.45 : 1,
        }}
      >
        {busy ? "바꾸는 중…" : "바꾸기"}
      </button>
      {message !== null && (
        <p
          role={message.ok ? "status" : "alert"}
          style={{ fontSize: 12.5, color: message.ok ? "var(--accent)" : "var(--late)" }}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
