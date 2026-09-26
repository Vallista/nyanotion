"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { equationBlockConfig } from "@nyanotion/editor-schema";
import katex from "katex";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * 수식 블록 — LaTeX 를 적으면 KaTeX 가 그린다.
 *
 * **원본은 언제나 LaTeX 문자열이다.** 그려진 결과를 저장하지 않으므로 나중에 렌더러를 바꿔도
 * 문서가 그대로 남는다. 누르면 원본이 나오고, 밖을 누르면 다시 그려진다 — 노션과 같은 방식.
 *
 * KaTeX 의 `throwOnError: false` 를 쓰지 않는다. 그러면 틀린 수식이 빨간 글자로 조용히 남아서
 * 뭐가 틀렸는지 알 수 없다. 여기서는 직접 잡아 사람 말로 알려 준다.
 */
export const equationReactSpec = createReactBlockSpec(equationBlockConfig, {
  render: ({ block, editor }) => {
    // 새로 넣은 수식은 곧바로 고칠 수 있게 연다 — 빈 상자를 한 번 더 눌러야 하는 것은 군더더기다.
    const [editing, setEditing] = useState(() => block.props.latex === "" && editor.isEditable);
    const [draft, setDraft] = useState(block.props.latex);

    // 다른 사람이 고쳐서 값이 바뀌면 따라간다 (내가 고치는 중이 아닐 때만).
    useEffect(() => {
      if (!editing) setDraft(block.props.latex);
    }, [block.props.latex, editing]);

    const latex = block.props.latex;

    if (editing && editor.isEditable) {
      return (
        <div contentEditable={false} style={{ margin: "4px 0" }}>
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== latex) editor.updateBlock(block, { props: { latex: draft } });
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(latex);
                setEditing(false);
              }
              // Enter 로 줄을 바꿀 수 있어야 하므로 Ctrl/Cmd+Enter 로 끝낸다.
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.currentTarget.blur();
              }
            }}
            spellCheck={false}
            placeholder="e^{i\pi} + 1 = 0"
            aria-label="수식 (LaTeX)"
            rows={Math.min(8, Math.max(2, draft.split("\n").length))}
            style={{
              width: "100%",
              resize: "vertical",
              font: "inherit",
              fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
              fontSize: 13.5,
              color: "var(--ink)",
              background: "var(--surface)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius)",
              padding: "8px 10px",
              outline: "none",
            }}
          />
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 4 }}>
            LaTeX 로 씁니다. 끝내려면 Ctrl(⌘)+Enter, 되돌리려면 Esc.
          </p>
        </div>
      );
    }

    return (
      <div
        contentEditable={false}
        onClick={() => {
          if (editor.isEditable) setEditing(true);
        }}
        role={editor.isEditable ? "button" : undefined}
        tabIndex={editor.isEditable ? 0 : undefined}
        onKeyDown={(event) => {
          if (editor.isEditable && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            setEditing(true);
          }
        }}
        style={{
          margin: "4px 0",
          padding: "10px 12px",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
          cursor: editor.isEditable ? "pointer" : "default",
          overflowX: "auto",
        }}
      >
        <Rendered latex={latex} />
      </div>
    );
  },
})();

function Rendered({ latex }: { latex: string }) {
  const host = useRef<HTMLDivElement>(null);
  const result = useMemo(() => {
    if (latex.trim() === "") return { html: null, error: null as string | null };
    try {
      return {
        html: katex.renderToString(latex, { displayMode: true, throwOnError: true }),
        error: null as string | null,
      };
    } catch (error) {
      return { html: null, error: error instanceof Error ? error.message : "수식을 읽지 못했어요" };
    }
  }, [latex]);

  useEffect(() => {
    if (host.current !== null && result.html !== null) host.current.innerHTML = result.html;
  }, [result.html]);

  if (latex.trim() === "") {
    return <span style={{ fontSize: 13.5, color: "var(--ink-4)" }}>눌러서 수식을 적으세요</span>;
  }
  if (result.error !== null) {
    return (
      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7 }}>
        수식을 읽지 못했어요 —{" "}
        <code style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{result.error}</code>
      </span>
    );
  }
  // KaTeX 가 만든 HTML 만 넣는다. 사용자 입력은 KaTeX 를 거치며 이스케이프된다.
  return <div ref={host} />;
}
