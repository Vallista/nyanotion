"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTagAction, renameTagAction } from "@/lib/actions";
import { DotsIcon } from "./icons";

/** 태그 이름 바꾸기·지우기. 지워도 문서는 남는다 — 태그만 떨어진다. */
export function TagActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
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
            startTransition(() => void renameTagAction(id, next));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setRenaming(false);
        }}
        aria-label="태그 이름"
        style={{
          height: 26,
          width: 150,
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
    <span style={{ position: "relative", display: "flex" }}>
      <button
        aria-label="태그 설정"
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
              minWidth: 184,
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
                  startTransition(async () => {
                    await deleteTagAction(id);
                    router.push("/");
                  });
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
                태그 지우기
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
              태그만 사라지고 문서는 그대로 남습니다.
            </span>
          </span>
        </>
      )}
    </span>
  );
}
