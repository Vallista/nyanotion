"use client";

import { useState, useTransition } from "react";
import { archiveDocumentAction, createDocumentAction, toggleFavoriteAction } from "@/lib/actions";
import { ChuruIcon, DotsIcon, LitterBoxIcon, PlusIcon } from "./icons";

/** 상단 바 오른쪽. 공유는 M4, 댓글은 M6 에서 들어온다. */
export function DocumentActions({
  id,
  favorite,
  canWrite,
}: {
  id: string;
  favorite: boolean;
  canWrite: boolean;
}) {
  const [, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [starred, setStarred] = useState(favorite);

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      <BarButton
        label={starred ? "츄르에서 빼기" : "츄르에 넣기"}
        onClick={() => {
          setStarred((value) => !value);
          startTransition(async () => {
            const next = await toggleFavoriteAction(id);
            setStarred(next);
          });
        }}
        color={starred ? "var(--accent)" : undefined}
      >
        <ChuruIcon filled={starred} />
      </BarButton>
      <BarButton
        label="안에 새 문서"
        onClick={() => startTransition(() => void createDocumentAction(id))}
      >
        <PlusIcon />
      </BarButton>
      <BarButton label="더 보기" onClick={() => setMenuOpen((v) => !v)}>
        <DotsIcon />
      </BarButton>

      {menuOpen && (
        <>
          <span
            onClick={() => setMenuOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 25 }}
          />
          <span
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              zIndex: 26,
              minWidth: 168,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-float)",
              padding: 4,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                startTransition(() => void archiveDocumentAction(id));
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 3,
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              <span style={{ display: "flex", color: "var(--ink-4)" }}>
                <LitterBoxIcon size={14} />
              </span>
              모래상자로 보내기
            </button>
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "var(--ink-3)",
                padding: "4px 8px 6px",
              }}
            >
              하위 문서도 같이 들어갑니다. 모래상자에서 되돌릴 수 있어요.
            </span>
          </span>
        </>
      )}
    </span>
  );
}

function BarButton({
  label,
  onClick,
  color,
  children,
}: {
  label: string;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius)",
        color: color ?? "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}
