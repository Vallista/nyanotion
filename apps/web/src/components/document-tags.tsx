"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { addTagAction, removeTagAction } from "@/lib/actions";
import { PlusIcon } from "./icons";

type TagRef = { id: string; name: string; color: string | null };

/**
 * 문서에 달린 태그. 트리가 "어디에 있나"라면 태그는 "무엇에 관한 것인가"다.
 * 이름으로 붙이고, 없는 이름이면 그 자리에서 만든다 — 태그를 먼저 만들러 가게 하지 않는다.
 */
export function DocumentTags({
  documentId,
  tags,
  suggestions,
}: {
  documentId: string;
  tags: TagRef[];
  suggestions: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const taken = new Set(tags.map((t) => t.name));
  const matches = suggestions
    .filter((s) => !taken.has(s.name))
    .filter((s) => draft.trim() === "" || s.name.includes(draft.trim()))
    .slice(0, 6);

  function commit(name: string) {
    const clean = name.trim();
    setDraft("");
    setAdding(false);
    if (clean === "" || taken.has(clean)) return;
    startTransition(() => void addTagAction(documentId, clean));
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            height: 20,
            padding: "0 4px 0 8px",
            borderRadius: "var(--radius-sm)",
            background: "var(--chip)",
            fontSize: 11.5,
            color: "var(--ink-2)",
          }}
        >
          <Link
            href={`/t/${tag.id}`}
            style={{ border: 0, color: "inherit" }}
            title={`"${tag.name}" 태그가 달린 문서 보기`}
          >
            {tag.name}
          </Link>
          <button
            aria-label={`${tag.name} 떼기`}
            onClick={() => startTransition(() => void removeTagAction(documentId, tag.id))}
            style={{
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 2,
              color: "var(--ink-4)",
              fontSize: 13,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <span style={{ position: "relative", display: "inline-flex" }}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              // 목록을 누를 틈을 준다.
              setTimeout(() => setAdding(false), 120);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(draft);
              if (event.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="태그 이름"
            aria-label="태그 추가"
            style={{
              height: 20,
              width: 110,
              padding: "0 6px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--accent)",
              background: "var(--card)",
              fontSize: 11.5,
              outline: "none",
            }}
          />
          {matches.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: 24,
                left: 0,
                zIndex: 20,
                minWidth: 130,
                background: "var(--card)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                boxShadow: "var(--shadow-float)",
                padding: 4,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {matches.map((match) => (
                <button
                  key={match.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(match.name);
                  }}
                  style={{
                    padding: "5px 7px",
                    borderRadius: 3,
                    fontSize: 12.5,
                    color: "var(--ink-2)",
                    textAlign: "left",
                  }}
                >
                  {match.name}
                </button>
              ))}
            </span>
          )}
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="태그 달기"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            height: 20,
            padding: "0 7px",
            borderRadius: "var(--radius-sm)",
            border: "1px dashed var(--line-strong)",
            fontSize: 11.5,
            color: "var(--ink-3)",
          }}
        >
          <PlusIcon size={11} />
          태그
        </button>
      )}
    </span>
  );
}
