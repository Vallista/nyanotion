"use client";

import { useState, useTransition } from "react";
import { createFamilyAction } from "@/lib/actions";
import { PlusIcon } from "./icons";
import { Spinner } from "./pending";

/** 가족을 만들면 그 가족의 문서 공간이 같이 생긴다. */
export function NewFamilyButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={pending}
        aria-busy={pending}
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
          {pending ? <Spinner size={12} /> : <PlusIcon size={14} />}
        </span>
        {pending ? "가족 만드는 중…" : "가족 만들기"}
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
        // 입력칸은 닫고, 새 화면으로 넘어갈 때까지 단추 자리에 원을 띄운다.
        startTransition(async () => {
          await createFamilyAction(clean);
          setName("");
        });
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
        placeholder="가족 이름"
        aria-label="가족 이름"
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
