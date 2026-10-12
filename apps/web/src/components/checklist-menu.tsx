"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveChecklistAction, renameChecklistAction } from "@/lib/checklist-actions";
import { DotsIcon, LitterBoxIcon } from "./icons";

/** 체크리스트 화면 탑바의 `…` — 이름 바꾸기 · 모래상자로. 문서의 `…` 와 같은 모양. */
export function ChecklistMenu({ checklistId, title }: { checklistId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const item: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 8px",
    borderRadius: 3,
    fontSize: 13,
    color: "var(--ink-2)",
    textAlign: "left",
  };

  return (
    <span style={{ position: "relative", display: "flex" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="체크리스트 메뉴"
        aria-expanded={open}
        disabled={busy}
        style={{ display: "flex", padding: 6, borderRadius: "var(--radius)", color: "var(--ink-3)" }}
      >
        <DotsIcon />
      </button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <span
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              zIndex: 26,
              minWidth: 180,
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
              role="menuitem"
              style={item}
              onClick={() => {
                setOpen(false);
                const next = window.prompt("체크리스트 이름", title);
                if (next === null || next.trim() === "" || next.trim() === title) return;
                startTransition(async () => {
                  try {
                    await renameChecklistAction(checklistId, next);
                    router.refresh();
                  } catch (error) {
                    setProblem(error instanceof Error ? error.message : "바꾸지 못했어요.");
                  }
                });
              }}
            >
              이름 바꾸기
            </button>
            <button
              role="menuitem"
              style={item}
              onClick={() => {
                setOpen(false);
                if (!window.confirm(`"${title}" 체크리스트를 모래상자로 보낼까요? 모래상자에서 되돌릴 수 있어요.`)) return;
                startTransition(async () => {
                  try {
                    await archiveChecklistAction(checklistId);
                    router.push("/lists");
                    router.refresh();
                  } catch (error) {
                    setProblem(error instanceof Error ? error.message : "보내지 못했어요.");
                  }
                });
              }}
            >
              <span style={{ display: "flex", color: "var(--ink-4)" }}>
                <LitterBoxIcon size={14} />
              </span>
              모래상자로 보내기
            </button>
          </span>
        </>
      )}
      {problem !== null && (
        <span role="alert" style={{ position: "absolute", right: 0, top: 34, fontSize: 12, color: "var(--late)", whiteSpace: "nowrap" }}>
          {problem}
        </span>
      )}
    </span>
  );
}
