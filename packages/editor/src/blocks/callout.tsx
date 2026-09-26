"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { CALLOUT_TONES, calloutBlockConfig, type CalloutTone } from "@nyanotion/editor-schema";
import { useState } from "react";

/**
 * 콜아웃 — 한 문단을 옆으로 떼어 눈에 띄게 둔다.
 *
 * 색으로만 구분하지 않는다. 그림글자가 앞에 붙고 왼쪽 선의 진하기가 달라서,
 * 색을 못 보는 사람이나 흑백 인쇄에서도 구분이 남는다.
 */
const TONES: Record<CalloutTone, { emoji: string; label: string; line: string; bg: string }> = {
  note: { emoji: "💡", label: "메모", line: "var(--line-strong)", bg: "var(--surface)" },
  tip: { emoji: "🐾", label: "도움말", line: "var(--accent)", bg: "var(--accent-soft)" },
  warn: { emoji: "⚠️", label: "주의", line: "#b08050", bg: "rgba(176,128,80,0.09)" },
};

function asTone(value: string): CalloutTone {
  return (CALLOUT_TONES as readonly string[]).includes(value) ? (value as CalloutTone) : "note";
}

export const calloutReactSpec = createReactBlockSpec(calloutBlockConfig, {
  render: ({ block, editor, contentRef }) => {
    const tone = asTone(block.props.tone);
    const style = TONES[tone];
    const emoji = block.props.emoji === "" ? style.emoji : block.props.emoji;

    return (
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: style.bg,
          borderLeft: `3px solid ${style.line}`,
          borderRadius: "var(--radius)",
          padding: "10px 12px",
          margin: "4px 0",
        }}
      >
        {editor.isEditable ? (
          <TonePicker
            emoji={emoji}
            tone={tone}
            onPick={(next) =>
              editor.updateBlock(block, { props: { tone: next, emoji: TONES[next].emoji } })
            }
          />
        ) : (
          <span contentEditable={false} style={{ fontSize: 15, lineHeight: 1.5 }}>
            {emoji}
          </span>
        )}
        <div ref={contentRef} style={{ flex: 1, minWidth: 0 }} />
      </div>
    );
  },
})();

function TonePicker({
  emoji,
  tone,
  onPick,
}: {
  emoji: string;
  tone: CalloutTone;
  onPick: (next: CalloutTone) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span contentEditable={false} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="콜아웃 결 고르기"
        title="결 고르기"
        style={{ fontSize: 15, lineHeight: 1.5, padding: 0 }}
      >
        {emoji}
      </button>
      {open && (
        <>
          <span
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 25 }}
          />
          <span
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              zIndex: 26,
              display: "flex",
              flexDirection: "column",
              minWidth: 110,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-float)",
              padding: 4,
            }}
          >
            {(Object.keys(TONES) as CalloutTone[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  onPick(key);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 7px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 13,
                  color: "var(--ink-2)",
                  background: key === tone ? "var(--surface)" : "transparent",
                }}
              >
                <span>{TONES[key].emoji}</span>
                {TONES[key].label}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
