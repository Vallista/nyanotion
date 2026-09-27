"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createDocumentAction, searchAction } from "@/lib/actions";
import { displayTitle } from "@/lib/tree";
import { AskIcon, PageIcon, PlusIcon, SearchIcon } from "./icons";

type Hit = { id: string; title: string; snippet: string; updatedAt: string };

const DEBOUNCE_MS = 140;

/** 사이드바 같은 다른 곳에서 팔레트를 열 때 쓰는 신호. */
export const PALETTE_EVENT = "nyanotion:palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

/**
 * ⌘K / Ctrl+K. 문서를 찾는 것과 새로 만드는 것을 같은 입력창에서 한다.
 *
 * 한국어는 형태소 분석기가 없어 "장보"로 "장보기"를 찾는 게 trigram 몫이다 — 서버가 처리한다
 * (packages/db/src/queries/search.ts). 여기서는 찾은 자리를 굵게만 표시한다.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const run = useCallback(async (text: string) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await searchAction(text);
      // 느린 응답이 최신 결과를 덮어쓰지 않게.
      if (id === requestId.current) {
        setHits(result);
        setCursor(0);
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // 열 때 한 번 최근 문서를 채운다.
  useEffect(() => {
    if (!open) return;
    void run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(query), DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [query, open, run]);

  // 전역 단축키와, 사이드바의 "검색" 버튼이 보내는 이벤트
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onAsk = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onAsk);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      // 렌더 뒤에 포커스를 줘야 모바일에서도 키보드가 올라온다.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const canCreate = query.trim() !== "";
  /**
   * 찾는 것과 **물어보는 것**은 다르다 — "김장 레시피" 는 검색이고 "김장할 때 배추 얼마나
   * 절였지" 는 질문이다. 같은 입력창에서 갈라 주되, 물어보기를 문서 아래에 둔다:
   * 이름을 아는 문서를 찾는 것이 훨씬 잦고 훨씬 빠르다.
   */
  const canAsk = query.trim().length >= 2;
  const askIndex = hits.length;
  const createIndex = hits.length + (canAsk ? 1 : 0);
  const rowCount = hits.length + (canAsk ? 1 : 0) + (canCreate ? 1 : 0);

  function choose(index: number) {
    if (canAsk && index === askIndex) {
      setOpen(false);
      router.push(`/ask?q=${encodeURIComponent(query.trim())}`);
      return;
    }
    if (canCreate && index === createIndex) {
      setOpen(false);
      startTransition(() => void createDocumentAction(null));
      return;
    }
    const hit = hits[index];
    if (hit === undefined) return;
    setOpen(false);
    router.push(`/d/${hit.id}`);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="명령 팔레트"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(47,46,43,0.22)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "12vh 16px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 7,
          boxShadow: "0 14px 36px rgba(47,46,43,.14), 0 2px 6px rgba(47,46,43,.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 14px",
            height: 50,
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <span style={{ display: "flex", color: "var(--ink-4)" }}>
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => (rowCount === 0 ? 0 : (c + 1) % rowCount));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => (rowCount === 0 ? 0 : (c - 1 + rowCount) % rowCount));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                choose(cursor);
              }
            }}
            placeholder="문서 찾기, 또는 새로 만들기"
            aria-label="문서 찾기"
            style={{
              flexGrow: 1,
              minWidth: 0,
              border: 0,
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: "var(--ink)",
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div style={{ maxHeight: "52vh", overflowY: "auto", padding: 6 }}>
          {hits.length === 0 && !loading && (
            <p
              style={{
                fontSize: 13,
                color: "var(--ink-3)",
                padding: "14px 10px",
                lineHeight: 1.7,
              }}
            >
              {query.trim() === "" ? "아직 문서가 없어요." : "찾는 게 없네요."}
            </p>
          )}

          {hits.length > 0 && (
            <SectionLabel>{query.trim() === "" ? "최근" : "문서"}</SectionLabel>
          )}

          {hits.map((hit, index) => (
            <Row
              key={hit.id}
              active={index === cursor}
              onMouseEnter={() => setCursor(index)}
              onClick={() => choose(index)}
              icon={<PageIcon size={15} />}
              title={<Highlight text={displayTitle(hit.title)} query={query} />}
              subtitle={hit.snippet === "" ? undefined : <Highlight text={hit.snippet} query={query} />}
            />
          ))}

          {canAsk && (
            <>
              <SectionLabel>냥이에게</SectionLabel>
              <Row
                active={cursor === askIndex}
                onMouseEnter={() => setCursor(askIndex)}
                onClick={() => choose(askIndex)}
                icon={<AskIcon size={15} />}
                title={<span>“{query.trim()}” 물어보기</span>}
                subtitle={<span>읽을 수 있는 문서에서 찾아 근거와 함께 답합니다</span>}
              />
            </>
          )}

          {canCreate && (
            <>
              <SectionLabel>만들기</SectionLabel>
              <Row
                active={cursor === createIndex}
                onMouseEnter={() => setCursor(createIndex)}
                onClick={() => choose(createIndex)}
                icon={<PlusIcon size={15} />}
                title={<span>새 문서 만들기</span>}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: "var(--ink-3)",
        padding: "10px 10px 6px",
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  active,
  onClick,
  onMouseEnter,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        borderRadius: "var(--radius)",
        background: active ? "var(--accent-soft)" : "transparent",
      }}
    >
      <span style={{ display: "flex", color: "var(--ink-4)", marginTop: 2 }}>{icon}</span>
      <span style={{ minWidth: 0, flexGrow: 1 }}>
        <span
          style={{
            display: "block",
            fontSize: 14,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {subtitle !== undefined && (
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--ink-3)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}

/** 찾은 자리를 굵게. 색을 쓰지 않는다 — 시안의 규칙. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim();
  if (needle === "") return <>{text}</>;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong style={{ fontWeight: 600, color: "var(--ink)" }}>
        {text.slice(at, at + needle.length)}
      </strong>
      {text.slice(at + needle.length)}
    </>
  );
}
