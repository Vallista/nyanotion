"use client";

import { useTransition } from "react";
import { createCollectionAction } from "@/lib/actions";
import { Spinner } from "./pending";

/** 지금 보고 있는 조건을 모음으로 굳힌다. 문서를 옮기는 게 아니라 조건만 저장한다. */
export function SaveCollectionButton({
  name,
  tagIds = [],
  query = "",
}: {
  name: string;
  tagIds?: string[];
  query?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(() => createCollectionAction(name, { tagIds, query }, "table"))
      }
      disabled={pending}
      aria-busy={pending}
      title="이 조건을 모음으로 저장합니다"
      style={{
        height: 26,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "0 10px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        fontSize: 12,
        color: "var(--ink-2)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending && <Spinner size={11} />}
      {pending ? "저장하는 중…" : "모음으로 저장"}
    </button>
  );
}
