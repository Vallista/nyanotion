"use client";

import { useState, useTransition } from "react";
import { archiveDocumentAction, createDocumentAction } from "@/lib/actions";
import { DotsIcon, LitterBoxIcon, PlusIcon } from "./icons";

/** 상단 바 오른쪽. 공유는 M4, 댓글은 M6 에서 들어온다. */
export function DocumentActions({ id }: { id: string }) {
  const [, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
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
  children,
}: {
  label: string;
  onClick: () => void;
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
        color: "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}
