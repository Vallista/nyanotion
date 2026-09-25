"use client";

import { useState, useTransition } from "react";
import { removeMemberAction, setMemberRoleAction } from "@/lib/actions";

const ROLES = [
  { value: "owner", label: "가장" },
  { value: "admin", label: "관리" },
  { value: "member", label: "식구" },
  { value: "guest", label: "손님" },
] as const;

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string;
};

export function FamilyMembers({
  organizationId,
  myUserId,
  isAdmin,
  members,
}: {
  organizationId: string;
  myUserId: string;
  isAdmin: boolean;
  members: MemberRow[];
}) {
  const [, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      <h2
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--ink-3)",
          letterSpacing: "0.01em",
          marginBottom: 10,
        }}
      >
        구성원
      </h2>

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
            padding: "8px 10px",
            marginBottom: 12,
          }}
        >
          {error}
        </p>
      )}

      <ul style={{ padding: 0 }}>
        {members.map((item) => {
          const isMe = item.userId === myUserId;
          return (
            <li
              key={item.userId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minHeight: 46,
                padding: "8px 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ flexGrow: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, color: "var(--ink)" }}>
                  {item.name}
                  {isMe && <span style={{ color: "var(--ink-3)", fontSize: 12 }}> · 나</span>}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--ink-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.email}
                </span>
              </span>

              {isAdmin && !isMe ? (
                <select
                  value={item.role}
                  onChange={(event) => {
                    const role = event.target.value;
                    setError(null);
                    startTransition(async () => {
                      try {
                        await setMemberRoleAction(organizationId, item.userId, role);
                      } catch {
                        setError("역할을 바꾸지 못했습니다.");
                      }
                    });
                  }}
                  aria-label={`${item.name} 역할`}
                  style={{
                    height: 26,
                    padding: "0 6px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--line)",
                    background: "var(--card)",
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                  }}
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              ) : (
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
                  }}
                >
                  {ROLES.find((role) => role.value === item.role)?.label ?? item.role}
                </span>
              )}

              {isAdmin && !isMe && (
                <>
                  {confirming === item.userId ? (
                    <button
                      onClick={() => {
                        setConfirming(null);
                        setError(null);
                        startTransition(async () => {
                          try {
                            await removeMemberAction(organizationId, item.userId);
                          } catch {
                            setError("내보내지 못했습니다.");
                          }
                        });
                      }}
                      style={{ fontSize: 12.5, color: "var(--ink)", padding: "4px 6px" }}
                    >
                      정말요?
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming(item.userId)}
                      style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "4px 6px" }}
                    >
                      내보내기
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {isAdmin && (
        <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 10, lineHeight: 1.7 }}>
          내보내도 그 사람이 쓴 문서는 가족 공간에 그대로 남습니다.
        </p>
      )}
    </section>
  );
}
