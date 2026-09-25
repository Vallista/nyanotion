"use client";

import { useState, useTransition } from "react";
import { inviteToFamilyAction, revokeInvitationAction } from "@/lib/actions";

export type PendingRow = { id: string; email: string; role: string; expiresAt: string };

/**
 * 초대장을 만들고 **링크를 화면에 보여 준다.** 메일 발송은 아직 없다 —
 * 가족한테 카톡으로 보내는 편이 빠르고, 메일 서버를 세울 이유가 없다.
 */
export function InviteForm({
  organizationId,
  pending,
}: {
  organizationId: string;
  pending: PendingRow[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function invite() {
    const clean = email.trim();
    if (clean === "") return;
    setError(null);
    setLink(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const { token } = await inviteToFamilyAction(organizationId, clean, role);
        setLink(`${window.location.origin}/invite/${token}`);
        setEmail("");
      } catch {
        setError("초대장을 만들지 못했습니다.");
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") invite();
          }}
          placeholder="초대할 이메일"
          aria-label="초대할 이메일"
          style={{
            flexGrow: 1,
            minWidth: 200,
            height: 34,
            padding: "0 10px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line-strong)",
            background: "var(--card)",
            fontSize: 13.5,
          }}
        />
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          aria-label="역할"
          style={{
            height: 34,
            padding: "0 8px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--line)",
            background: "var(--card)",
            fontSize: 13,
            color: "var(--ink-2)",
          }}
        >
          <option value="member">식구</option>
          <option value="admin">관리</option>
          <option value="guest">손님</option>
        </select>
        <button
          onClick={invite}
          disabled={busy}
          style={{
            height: 34,
            padding: "0 14px",
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: busy ? 0.6 : 1,
          }}
        >
          초대장 만들기
        </button>
      </div>

      {error !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10 }}>
          {error}
        </p>
      )}

      {link !== null && (
        <div
          style={{
            marginTop: 14,
            padding: "12px 14px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          <p style={{ fontSize: 13, color: "var(--ink)", marginBottom: 8 }}>
            이 링크를 그 사람에게 보내세요
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 12,
                fontFamily: "var(--font-plex-mono), monospace",
                color: "var(--ink-2)",
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 8px",
                overflowWrap: "anywhere",
              }}
            >
              {link}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--line)",
                fontSize: 12.5,
                color: "var(--ink-2)",
              }}
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.7 }}>
            링크를 연 사람이 <strong style={{ fontWeight: 500 }}>그 주소로 로그인</strong>해야
            들어옵니다. 다른 주소로는 안 됩니다.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <ul style={{ padding: 0, marginTop: 20 }}>
          {pending.map((item) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 36,
                padding: "6px 0",
                borderBottom: "1px solid var(--line-soft)",
                fontSize: 13,
              }}
            >
              <span
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  color: "var(--ink-2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.email}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
                {item.expiresAt}까지
              </span>
              <button
                onClick={() =>
                  startTransition(() => void revokeInvitationAction(organizationId, item.id))
                }
                style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "4px 6px" }}
              >
                취소
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
