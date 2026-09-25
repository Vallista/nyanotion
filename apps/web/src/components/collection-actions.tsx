"use client";

import { useState, useTransition } from "react";
import { deleteCollectionAction, updateCollectionAction } from "@/lib/actions";
import { DotsIcon } from "./icons";

/** 모음 이름·보기 방식 바꾸기, 지우기. 지워도 문서는 그대로다. */
export function CollectionActions({
  id,
  name,
  view,
}: {
  id: string;
  name: string;
  view: "list" | "table";
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={name}
        onBlur={(event) => {
          setRenaming(false);
          const next = event.currentTarget.value.trim();
          if (next !== "" && next !== name) {
            startTransition(() => void updateCollectionAction(id, { name: next }));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setRenaming(false);
        }}
        aria-label="모음 이름"
        style={{
          height: 26,
          width: 170,
          padding: "0 8px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--accent)",
          background: "var(--card)",
          fontSize: 13,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      <span
        style={{
          display: "inline-flex",
          borderRadius: "var(--radius)",
          border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        {(["list", "table"] as const).map((option) => (
          <button
            key={option}
            onClick={() => startTransition(() => void updateCollectionAction(id, { view: option }))}
            style={{
              height: 26,
              padding: "0 10px",
              fontSize: 12,
              background: view === option ? "var(--accent-soft)" : "transparent",
              color: view === option ? "var(--ink)" : "var(--ink-3)",
            }}
          >
            {option === "list" ? "목록" : "표"}
          </button>
        ))}
      </span>

      <button
        aria-label="모음 설정"
        onClick={() => setOpen((value) => !value)}
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
        <DotsIcon />
      </button>

      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <span
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              zIndex: 26,
              minWidth: 190,
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
                setOpen(false);
                setRenaming(true);
              }}
              style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink-2)" }}
            >
              이름 바꾸기
            </button>
            {confirming ? (
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirming(false);
                  startTransition(() => void deleteCollectionAction(id));
                }}
                style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink)" }}
              >
                정말 지울까요?
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink-2)" }}
              >
                모음 지우기
              </button>
            )}
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "var(--ink-3)",
                padding: "4px 8px 6px",
              }}
            >
              모음만 사라지고 문서는 그대로 남습니다.
            </span>
          </span>
        </>
      )}
    </span>
  );
}
