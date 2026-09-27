"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageIcon, SearchIcon } from "./icons";

/**
 * 문서에 물어보기.
 *
 * **근거가 답보다 먼저 뜬다.** 서버가 근거를 먼저 보내기 때문이다 (`/api/ai/ask`).
 * 답을 기다리는 동안에도 어느 문서에서 나온 이야기인지 알 수 있고, 답이 시원찮으면
 * 그냥 문서로 가면 된다. 번호(`[1]`)를 누르면 그 **블록까지** 데려간다.
 */

type Source = {
  n: number;
  documentId: string;
  documentTitle: string;
  blockId: string;
  heading: string;
  excerpt: string;
};

type State = "idle" | "asking" | "done" | "busy";

const UNTITLED = "제목 없음";

/** 근거 한 줄에서 문서로 가는 주소. 블록 id 가 있으면 그 줄까지 데려간다. */
function hrefFor(source: Source): string {
  return source.blockId === ""
    ? `/d/${source.documentId}`
    : `/d/${source.documentId}#block-${source.blockId}`;
}

export function AskPanel({ initialQuestion }: { initialQuestion: string }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [state, setState] = useState<State>("idle");
  const [notice, setNotice] = useState("");
  const [semantic, setSemantic] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed === "") return;

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setAsked(trimmed);
    setAnswer("");
    setSources([]);
    setNotice("");
    setState("asking");

    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      });
      if (!response.ok || response.body === null) {
        setNotice("물어보지 못했습니다. 잠시 뒤에 다시 해 주세요.");
        setState("busy");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let at = buffer.indexOf("\n");
        while (at >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 1);
          at = buffer.indexOf("\n");

          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();
          if (payload === "") continue;
          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          if (event === "sources") {
            const body = data as { passages?: Source[]; semantic?: boolean };
            setSources(body.passages ?? []);
            setSemantic(body.semantic !== false);
          } else if (event === "chunk") {
            const body = data as { text?: string };
            if (typeof body.text === "string") setAnswer((old) => old + body.text);
          } else if (event === "busy") {
            const body = data as { kind?: string; message?: string };
            setNotice(
              body.kind === "gaming"
                ? "지금은 GPU 를 게임이 쓰고 있어요. 조금 뒤에 다시 물어봐 주세요."
                : (body.message ?? "냥이를 부르지 못했습니다."),
            );
            setState("busy");
            return;
          } else if (event === "done") {
            setState("done");
            return;
          }
        }
      }
      setState("done");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice("물어보지 못했습니다.");
      setState("busy");
    }
  }, []);

  // 주소에 질문이 실려 오면(팔레트에서 넘어온 경우) 바로 물어본다.
  useEffect(() => {
    if (initialQuestion.trim() !== "") void ask(initialQuestion);
  }, [initialQuestion, ask]);

  const running = state === "asking";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(question);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          height: 52,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 7,
        }}
      >
        <span style={{ display: "flex", color: "var(--ink-4)" }}>
          <SearchIcon size={16} />
        </span>
        <input
          ref={inputRef}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="작년에 정리한 김장 레시피 뭐였지?"
          aria-label="문서에 물어보기"
          style={{
            flexGrow: 1,
            minWidth: 0,
            border: 0,
            outline: "none",
            background: "transparent",
            // 16px 미만이면 iOS 가 탭할 때 화면을 확대한다.
            fontSize: 16,
            color: "var(--ink)",
          }}
        />
        <button
          type="submit"
          disabled={running || question.trim() === ""}
          style={{
            border: "1px solid var(--line)",
            borderRadius: 5,
            background: running ? "var(--surface)" : "var(--card)",
            color: "var(--ink-2)",
            fontSize: 13,
            padding: "6px 12px",
            cursor: running ? "default" : "pointer",
          }}
        >
          {running ? "찾는 중…" : "물어보기"}
        </button>
      </form>

      {state === "idle" && (
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.85 }}>
          읽을 수 있는 문서에서만 찾습니다. 답에 붙은 번호를 누르면 그 문서의 그 줄로 갑니다.
          <br />
          찾은 내용이 없으면 지어내지 않고 모른다고 말합니다.
        </p>
      )}

      {asked !== "" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 6 }}>물어본 것</p>
            <p style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.7 }}>{asked}</p>
          </div>

          {notice !== "" && (
            <p
              style={{
                fontSize: 13.5,
                color: "var(--ink-2)",
                background: "var(--surface)",
                border: "1px solid var(--line-soft)",
                borderRadius: 6,
                padding: "10px 12px",
                lineHeight: 1.8,
              }}
            >
              {notice}
            </p>
          )}

          {(answer !== "" || running) && (
            <div>
              <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 6 }}>
                냥이의 답{!semantic && " (지금은 글자로만 찾았어요)"}
              </p>
              <p
                style={{
                  fontSize: 15.5,
                  color: "var(--ink)",
                  lineHeight: 1.9,
                  whiteSpace: "pre-wrap",
                }}
              >
                {answer}
                {running && <span style={{ color: "var(--ink-4)" }}>▍</span>}
              </p>
            </div>
          )}

          {sources.length > 0 && (
            <div>
              <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 8 }}>
                근거 {sources.length}곳
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none" }}>
                {sources.map((source) => (
                  <li key={`${source.documentId}-${source.n}`}>
                    <Link
                      href={hrefFor(source)}
                      style={{
                        display: "block",
                        textDecoration: "none",
                        background: "var(--card)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 6,
                        padding: "10px 12px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontSize: 13,
                          color: "var(--ink-2)",
                        }}
                      >
                        <span style={{ color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>
                          [{source.n}]
                        </span>
                        <span style={{ display: "flex", color: "var(--ink-4)" }}>
                          <PageIcon size={14} />
                        </span>
                        <span>
                          {source.documentTitle.trim() === "" ? UNTITLED : source.documentTitle}
                        </span>
                        {source.heading !== "" && (
                          <span style={{ color: "var(--ink-4)" }}>› {source.heading}</span>
                        )}
                      </span>
                      <span
                        style={{
                          display: "block",
                          marginTop: 5,
                          fontSize: 12.5,
                          color: "var(--ink-3)",
                          lineHeight: 1.7,
                        }}
                      >
                        {source.excerpt}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state === "done" && sources.length === 0 && notice === "" && (
            <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
              근거로 삼을 문서를 못 찾았어요. 아직 색인되지 않았을 수도 있습니다 —
              워커가 돌고 있는지 확인해 주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
