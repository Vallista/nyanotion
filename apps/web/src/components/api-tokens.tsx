"use client";

import type { ApiTokenRow } from "@nyanotion/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTokenAction, revokeTokenAction } from "@/lib/token-actions";
import { SmallButton, inputStyle } from "./checklist-item";

/**
 * 개인 토큰 — Bento(맥 앱)가 내 체크리스트와 동기화할 때 쓰는 열쇠.
 * 평문은 **만들 때 한 번만** 보여 준다. 잃어버리면 끊고 새로 만든다.
 */
export function ApiTokens({ tokens, origin }: { tokens: ApiTokenRow[]; origin: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function create(): void {
    const clean = name.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const { token } = await createTokenAction(clean);
        setMade(token);
        setCopied(false);
        setName("");
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "만들지 못했어요.");
      }
    });
  }

  const when = (iso: string | null) =>
    iso === null
      ? "아직 안 씀"
      : new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 40 }}>
      <h2 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)" }}>개인 토큰 (Bento 동기화)</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.7 }}>
        Bento 같은 앱이 내 체크리스트와 동기화할 때 씁니다. 토큰을 가진 앱은 내가 고칠 수 있는 체크리스트를
        읽고 고칠 수 있어요. 앱에는 서버 주소 <code>{origin}</code> 와 함께 넣으세요.
      </p>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) create();
          }}
          placeholder="이름 (예: 맥북 Bento)"
          aria-label="토큰 이름"
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0, height: 38 }}
        />
        <SmallButton primary disabled={busy || name.trim() === ""} busy={busy} onClick={create}>
          토큰 만들기
        </SmallButton>
      </div>
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--late)" }}>
          {problem}
        </p>
      )}
      {made !== null && (
        <div
          style={{
            padding: 12,
            border: "1px solid var(--accent-line)",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius)",
            fontSize: 12.5,
            color: "var(--ink-2)",
            lineHeight: 1.6,
          }}
        >
          <b style={{ fontWeight: 500 }}>지금 한 번만</b> 보여 드려요. 복사해서 앱에 넣으세요.
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code
              data-token
              style={{
                flex: "1 1 240px",
                minWidth: 0,
                padding: "7px 9px",
                background: "var(--card)",
                borderRadius: "var(--radius)",
                overflowWrap: "anywhere",
                fontSize: 12,
              }}
            >
              {made}
            </code>
            <SmallButton onClick={() => void navigator.clipboard?.writeText(made).then(() => setCopied(true))}>
              {copied ? "복사했어요" : "복사"}
            </SmallButton>
          </div>
        </div>
      )}
      {tokens.length > 0 && (
        <ul style={{ padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)" }}>
          {tokens.map((token) => (
            <li
              key={token.id}
              style={{
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 2px",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ flexGrow: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13.5 }}>{token.name}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>
                  {token.prefix}… · 마지막 사용 {when(token.lastUsedAt)}
                </span>
              </span>
              <SmallButton
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(`"${token.name}" 토큰을 끊을까요? 이 토큰을 쓰는 앱은 더 동기화하지 못합니다.`)) return;
                  startTransition(async () => {
                    try {
                      await revokeTokenAction(token.id);
                      router.refresh();
                    } catch (error) {
                      setProblem(error instanceof Error ? error.message : "끊지 못했어요.");
                    }
                  });
                }}
              >
                끊기
              </SmallButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
