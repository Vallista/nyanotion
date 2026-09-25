"use client";

import { useState, useTransition } from "react";
import {
  createPublicLinkAction,
  removeShareAction,
  revokePublicLinkAction,
  shareWithFamilyAction,
  shareWithPersonAction,
} from "@/lib/actions";

const DOC_ROLES = [
  { value: "viewer", label: "보기" },
  { value: "commenter", label: "댓글" },
  { value: "editor", label: "편집" },
] as const;

export type ShareEntry = {
  /** document_share 행의 id — 닫을 때 쓴다. */
  shareId: string;
  /** 대상의 id (사람이면 user.id, 가족이면 organization.id). */
  subjectId: string;
  kind: "user" | "org";
  label: string;
  sub: string;
  role: string;
};

export type LinkEntry = { id: string; url: string; expiresAt: string | null };

/**
 * 문서를 사람이나 가족에게 연다. **문서의 owner 만 열 수 있다** — 서버가 다시 확인한다.
 * 공유는 하위 문서까지 함께 열린다는 걸 화면에 적어 둔다.
 */
export function ShareDialog({
  documentId,
  shares,
  families,
  links,
  onClose,
}: {
  documentId: string;
  shares: ShareEntry[];
  families: { id: string; name: string }[];
  links: LinkEntry[];
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const sharedFamilies = new Set(shares.filter((s) => s.kind === "org").map((s) => s.subjectId));

  function addPerson() {
    const clean = email.trim();
    if (clean === "") return;
    setError(null);
    startTransition(async () => {
      const result = await shareWithPersonAction(documentId, clean, role);
      if (result.ok) {
        setEmail("");
        return;
      }
      setError(
        result.reason === "no-account"
          ? "그 주소의 계정이 아직 없습니다. 먼저 가족으로 초대해 주세요."
          : result.reason === "self"
            ? "자기 자신에게는 공유할 수 없습니다."
            : "공유하지 못했습니다.",
      );
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="공유"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(47,46,43,0.22)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "76vh",
          overflowY: "auto",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 7,
          boxShadow: "0 14px 36px rgba(47,46,43,.14), 0 2px 6px rgba(47,46,43,.06)",
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>공유</h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.7, marginBottom: 18 }}>
          이 문서 <strong style={{ fontWeight: 500 }}>안에 있는 문서까지 같이</strong> 열립니다.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addPerson();
            }}
            placeholder="이메일로 사람 추가"
            aria-label="공유할 이메일"
            style={{
              flexGrow: 1,
              minWidth: 180,
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
            aria-label="권한"
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
            {DOC_ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            onClick={addPerson}
            disabled={busy}
            style={{
              height: 34,
              padding: "0 12px",
              borderRadius: "var(--radius)",
              background: "var(--ink)",
              color: "var(--paper)",
              fontSize: 13,
              fontWeight: 500,
              opacity: busy ? 0.6 : 1,
            }}
          >
            추가
          </button>
        </div>

        {error !== null && (
          <p role="alert" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10 }}>
            {error}
          </p>
        )}

        {families.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <Label>가족 전체에게</Label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {families.map((family) => (
                <button
                  key={family.id}
                  disabled={sharedFamilies.has(family.id) || busy}
                  onClick={() =>
                    startTransition(() => void shareWithFamilyAction(documentId, family.id, role))
                  }
                  style={{
                    height: 28,
                    padding: "0 10px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--line)",
                    fontSize: 12.5,
                    color: sharedFamilies.has(family.id) ? "var(--ink-4)" : "var(--ink-2)",
                  }}
                >
                  {family.name}
                  {sharedFamilies.has(family.id) ? " · 열림" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {shares.length > 0 && (
          <div style={{ marginTop: 22 }}>
            <Label>열려 있는 곳</Label>
            <ul style={{ padding: 0 }}>
              {shares.map((item) => (
                <li
                  key={item.shareId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 38,
                    padding: "5px 0",
                    borderBottom: "1px solid var(--line-soft)",
                  }}
                >
                  <span style={{ flexGrow: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, color: "var(--ink)" }}>
                      {item.label}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.sub}
                    </span>
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      padding: "0 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--chip)",
                      fontSize: 11.5,
                      color: "var(--ink-2)",
                      flexShrink: 0,
                    }}
                  >
                    {DOC_ROLES.find((r) => r.value === item.role)?.label ?? item.role}
                  </span>
                  <button
                    onClick={() =>
                      startTransition(() => void removeShareAction(documentId, item.shareId))
                    }
                    style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "4px 6px" }}
                  >
                    닫기
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid var(--line-soft)" }}>
          <Label>링크를 아는 사람</Label>
          {links.length === 0 ? (
            <>
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.7, marginBottom: 10 }}>
                로그인 없이 볼 수 있는 링크를 만듭니다. 읽기만 됩니다.
              </p>
              <button
                onClick={() => startTransition(() => void createPublicLinkAction(documentId))}
                disabled={busy}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--line)",
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                }}
              >
                링크 만들기
              </button>
            </>
          ) : (
            <ul style={{ padding: 0 }}>
              {links.map((link) => (
                <li key={link.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <code
                      style={{
                        flexGrow: 1,
                        minWidth: 0,
                        fontSize: 11.5,
                        fontFamily: "var(--font-plex-mono), monospace",
                        color: "var(--ink-2)",
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 8px",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {link.url}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(link.url).then(
                          () => setCopied(link.id),
                          () => setCopied(null),
                        );
                      }}
                      style={{
                        height: 28,
                        padding: "0 10px",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--line)",
                        fontSize: 12,
                        color: "var(--ink-2)",
                      }}
                    >
                      {copied === link.id ? "복사됨" : "복사"}
                    </button>
                    <button
                      onClick={() =>
                        startTransition(() => void revokePublicLinkAction(documentId, link.id))
                      }
                      style={{ fontSize: 12, color: "var(--ink-3)", padding: "4px 6px" }}
                    >
                      끄기
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: "var(--radius)",
              fontSize: 13,
              color: "var(--ink-2)",
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11.5,
        fontWeight: 500,
        color: "var(--ink-3)",
        letterSpacing: "0.01em",
        marginBottom: 8,
      }}
    >
      {children}
    </p>
  );
}
