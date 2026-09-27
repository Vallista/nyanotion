"use client";

import { useState, useTransition } from "react";
import { acceptSuggestionAction, dismissSuggestionAction } from "@/lib/ask-actions";

/**
 * 냥이가 낸 제목·태그 제안.
 *
 * **수락해야 반영된다.** 그래서 이 줄은 문서 위에 얹혀 있을 뿐이고, 누르기 전까지 문서는
 * 한 글자도 바뀌지 않는다. 제목만 받고 태그는 버릴 수 있다 — 둘을 묶으면 사람은
 * "둘 다 싫으면 그냥 무시"밖에 못 한다.
 */
export function SuggestionBar({
  documentId,
  title,
  tags,
}: {
  documentId: string;
  title: string;
  tags: string[];
}) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();

  if (gone || (title === "" && tags.length === 0)) return null;

  const act = (what: "title" | "tags" | "both" | "no") => {
    setGone(true);
    start(() => {
      if (what === "no") {
        void dismissSuggestionAction(documentId);
        return;
      }
      void acceptSuggestionAction(documentId, {
        title: what === "title" || what === "both",
        tags: what === "tags" || what === "both",
      });
    });
  };

  const both = title !== "" && tags.length > 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 20,
        padding: "9px 12px",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: 6,
        fontSize: 13,
        color: "var(--ink-2)",
      }}
    >
      <span style={{ color: "var(--ink-4)" }}>냥이 제안</span>
      {title !== "" && <span>제목 “{title}”</span>}
      {tags.length > 0 && (
        <span style={{ color: "var(--ink-2)" }}>{tags.map((tag) => `#${tag}`).join(" ")}</span>
      )}

      <span style={{ flexGrow: 1 }} />

      {both && (
        <Action label="둘 다" onClick={() => act("both")} disabled={pending} strong />
      )}
      {title !== "" && (
        <Action label={both ? "제목만" : "제목 쓰기"} onClick={() => act("title")} disabled={pending} strong={!both} />
      )}
      {tags.length > 0 && (
        <Action label={both ? "태그만" : "태그 달기"} onClick={() => act("tags")} disabled={pending} strong={!both} />
      )}
      <Action label="아니오" onClick={() => act("no")} disabled={pending} />
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  strong = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  strong?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: `1px solid ${strong ? "var(--line)" : "transparent"}`,
        borderRadius: 5,
        background: strong ? "var(--card)" : "transparent",
        color: strong ? "var(--ink)" : "var(--ink-3)",
        fontSize: 12.5,
        padding: "4px 9px",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {label}
    </button>
  );
}
