"use client";

import { useTransition } from "react";
import { createCollectionAction } from "@/lib/actions";

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
        startTransition(() => void createCollectionAction(name, { tagIds, query }, "table"))
      }
      disabled={pending}
      title="이 조건을 모음으로 저장합니다"
      style={{
        height: 26,
        padding: "0 10px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        fontSize: 12,
        color: "var(--ink-2)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      모음으로 저장
    </button>
  );
}
