"use client";

import { useState, useTransition } from "react";
import { emptyTrashAction, restoreDocumentAction } from "@/lib/actions";
import { LitterBoxIcon, PageIcon } from "./icons";

export function TrashList({
  items,
}: {
  items: { id: string; title: string; archivedAt: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", opacity: 0.85 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "var(--ink-5)" }}>
          <LitterBoxIcon size={36} strokeWidth={1} />
        </div>
        <p style={{ fontSize: 14, color: "var(--ink-3)" }}>모래상자가 비어 있어요</p>
      </div>
    );
  }

  return (
    <>
      <ul style={{ padding: 0, marginBottom: 32 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 40,
              padding: "0 8px",
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <span style={{ display: "flex", color: "var(--ink-4)" }}>
              <PageIcon size={15} />
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 14.5,
                color: "var(--ink-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>
              {item.archivedAt}
            </span>
            <button
              onClick={() => startTransition(() => void restoreDocumentAction(item.id))}
              disabled={pending}
              style={{
                fontSize: 12.5,
                color: "var(--accent)",
                padding: "4px 8px",
                borderRadius: "var(--radius)",
                flexShrink: 0,
              }}
            >
              되돌리기
            </button>
          </li>
        ))}
      </ul>

      {confirming ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            padding: "14px 16px",
          }}
        >
          <p style={{ fontSize: 13.5, color: "var(--ink)", marginBottom: 4 }}>
            정말 비울까요? 되돌릴 수 없습니다.
          </p>
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.6 }}>
            {items.length}개 문서와 그 하위 문서가 영구히 사라집니다.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setConfirming(false);
                startTransition(() => void emptyTrashAction());
              }}
              disabled={pending}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: "var(--radius)",
                background: "var(--ink)",
                color: "var(--paper)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              비우기
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: "var(--radius)",
                fontSize: 13,
                color: "var(--ink-2)",
              }}
            >
              그만두기
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          style={{ fontSize: 13, color: "var(--ink-3)", padding: "6px 0" }}
        >
          모래상자 비우기
        </button>
      )}
    </>
  );
}
