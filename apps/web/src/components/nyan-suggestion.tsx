"use client";

import { TASK_LABELS, type AiTask } from "@nyanotion/shared";
import { CatMark } from "./cat-mark";

export type NyanState = {
  task: AiTask;
  /** 손볼 대상 블록들. 바꾸기·아래에 붙이기가 이걸 기준으로 한다. */
  blockIds: string[];
  text: string;
  status: "streaming" | "ready" | "failed" | "gaming" | "empty";
  message?: string;
  /** 다시 쓰기에 쓸 원본. */
  source: { blockIds: string[]; text: string };
};

/**
 * 냥이의 답은 **제안으로만 보여 준다** — 사람이 수락해야 문서에 들어간다.
 * 글을 대신 고쳐 놓고 되돌리게 하는 것보다, 보여 주고 고르게 하는 편이 낫다 (시안 06b).
 */
export function NyanSuggestion({
  state,
  onReplace,
  onAppend,
  onRetry,
  onDismiss,
}: {
  state: NyanState;
  onReplace: () => void;
  onAppend: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const busy = state.status === "streaming";
  const usable = state.status === "ready" && state.text.trim() !== "";

  return (
    <section
      aria-label="냥이 제안"
      style={{
        marginTop: 20,
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-float)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ display: "flex", color: "var(--ink-3)" }}>
          <CatMark size={16} color="currentColor" />
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
          {headline(state)}
        </span>
        {busy && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
          >
            <span className="dot dot-syncing" />
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>쓰는 중</span>
          </span>
        )}
      </div>

      {state.status === "empty" ? (
        <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-3)" }}>
          손볼 글이 없어요. 고칠 문단에 커서를 두거나 여러 블록을 골라서 다시 불러 주세요.
        </p>
      ) : state.status === "gaming" ? (
        <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-2)" }}>
          지금은 서버 그래픽카드를 게임이 쓰고 있어요. 게임이 끝나면 다시 눌러 주세요.
          <br />
          <span style={{ color: "var(--ink-3)" }}>
            문서를 쓰고 맞추는 일은 그대로 됩니다.
          </span>
        </p>
      ) : state.status === "failed" ? (
        <p style={{ fontSize: 13, lineHeight: 1.75, color: "var(--ink-2)" }}>
          {state.message ?? "냥이를 부르지 못했어요."}
        </p>
      ) : (
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.72,
            color: "var(--ink)",
            whiteSpace: "pre-wrap",
            margin: 0,
          }}
        >
          {state.text}
          {busy && <span style={{ color: "var(--ink-4)" }}>▍</span>}
        </p>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
        {usable && (
          <>
            <Action primary onClick={onReplace}>
              바꾸기
            </Action>
            <Action onClick={onAppend}>아래에 붙이기</Action>
          </>
        )}
        {state.status !== "streaming" && state.status !== "empty" && (
          <Action onClick={onRetry}>다시 쓰기</Action>
        )}
        <Action onClick={onDismiss}>{busy ? "그만" : "취소"}</Action>
      </div>
    </section>
  );
}

function headline(state: NyanState): string {
  switch (state.status) {
    case "gaming":
      return "냥이는 잠시 후";
    case "failed":
      return "냥이가 답하지 못했어요";
    case "empty":
      return "냥이";
    default:
      return `냥이가 ${TASK_LABELS[state.task]}`;
  }
}

function Action({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: "var(--radius)",
        fontSize: 12.5,
        fontWeight: primary ? 500 : 400,
        background: primary ? "var(--ink)" : "transparent",
        color: primary ? "var(--paper)" : "var(--ink-2)",
        border: primary ? "none" : "1px solid var(--line)",
      }}
    >
      {children}
    </button>
  );
}
