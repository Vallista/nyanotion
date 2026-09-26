"use client";

import { useState, useTransition } from "react";
import { createDatabaseAction } from "@/lib/actions";
import { PlusIcon } from "./icons";

/** 손으로 담는 표(노션의 데이터베이스). 줄 하나가 문서다. */
export function NewDatabaseButton({ spaceId }: { spaceId?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          height: 28,
          padding: "0 6px 0 8px",
          borderRadius: "var(--radius)",
          fontSize: 13.5,
          color: "var(--ink-3)",
        }}
      >
        <span style={{ display: "flex", color: "var(--ink-4)" }}>
          <PlusIcon size={14} />
        </span>
        표 만들기
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const clean = name.trim();
        if (clean === "") return;
        setOpen(false);
        startTransition(() => void createDatabaseAction(clean, spaceId));
      }}
      style={{ padding: "2px 0" }}
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() === "") setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="표 이름 (예: 살 것)"
        aria-label="표 이름"
        disabled={pending}
        style={{
          width: "100%",
          height: 26,
          padding: "0 8px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--accent)",
          background: "var(--card)",
          fontSize: 13,
          outline: "none",
        }}
      />
    </form>
  );
}
