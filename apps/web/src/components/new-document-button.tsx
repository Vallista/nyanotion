"use client";

import { useTransition } from "react";
import { createDocumentAction } from "@/lib/actions";
import { PlusIcon } from "./icons";

export function NewDocumentButton({ parentId = null }: { parentId?: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => void createDocumentAction(parentId))}
      disabled={pending}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px",
        borderRadius: "var(--radius)",
        fontSize: 13,
        color: "var(--ink-2)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <span style={{ display: "flex", color: "var(--ink-3)" }}>
        <PlusIcon size={14} />
      </span>
      새 문서
    </button>
  );
}
