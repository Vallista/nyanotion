"use client";

import { useEffect, useState } from "react";

/**
 * 맥 앱 모양의 뼈대 (`docs/04-history.md` 2026-10-26 맥 테마).
 *
 * - **Section** — 상자 없이 굵은 제목 + 머리카락 선. 목록 줄은 그 아래에 옅은 선으로 나뉜다(미리 알림·메일처럼).
 * - **Group** — 시스템 설정처럼 둥근 흰 칸에 줄을 묶는다. 오른쪽 패널(인스펙터)에서 숫자·설정을 보일 때.
 * - **SplitView** — 가운데 목록 + 오른쪽 인스펙터. 좁으면 아래로 쌓는다.
 *
 * 색·간격은 전부 `globals.css` 의 변수다. 여기서 hex 를 쓰지 않는다.
 */

/** 미디어 질의가 맞는가. 서버와 첫 그리기에서는 null. */
export function useMedia(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function SplitView({
  main,
  inspector,
  inspectorLabel,
  mainMaxWidth = 760,
}: {
  main: React.ReactNode;
  inspector: React.ReactNode;
  inspectorLabel: string;
  mainMaxWidth?: number;
}) {
  // 나누기는 CSS(`globals.css` 의 .split)로 한다 — JS 로 재면 첫 그리기(서버)와 모양이 달라 화면이 한 번 튄다.
  return (
    <div className="split" style={{ "--main-max": `${mainMaxWidth}px` } as React.CSSProperties}>
      <div className="split-main">
        <div className="split-inner">{main}</div>
      </div>
      <aside aria-label={inspectorLabel} className="split-inspector">
        {inspector}
      </aside>
    </div>
  );
}

/** 가운데 한 줄만 있는 화면 — SplitView 의 가운데와 같은 폭·여백. */
export function SingleView({ children, maxWidth = 760 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ flexGrow: 1, overflowY: "auto" }}>
      <div className="split-inner" style={{ "--main-max": `${maxWidth}px` } as React.CSSProperties}>
        {children}
      </div>
    </div>
  );
}

/** 화면 맨 위의 큰 제목 — 26px 굵게, 아래에 한 줄 요약. */
export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  const narrow = useMedia("(max-width: 760px)");
  return (
    <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: narrow ? 22 : 26, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>{title}</h1>
        {sub !== undefined && <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.4 }}>{sub}</p>}
      </div>
      {action}
    </header>
  );
}

/** 상자 없는 묶음 — 굵은 제목과 머리카락 선, 그 아래 내용. */
export function Section({
  title,
  note,
  action,
  children,
  id,
  gap = 0,
}: {
  title?: React.ReactNode;
  /** 제목 옆에 붙는 옅은 말. */
  note?: React.ReactNode;
  /** 오른쪽 끝의 단추·링크. */
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  /** 내용 사이 간격. 목록이면 0(줄마다 선이 나눈다). */
  gap?: number;
}) {
  return (
    <section id={id} style={{ display: "flex", flexDirection: "column", gap, minWidth: 0 }}>
      {title !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            paddingBottom: 6,
            marginBottom: gap === 0 ? 0 : 4,
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{title}</h2>
          {note !== undefined && <span style={{ fontSize: 12, color: "var(--ink-3)", minWidth: 0 }}>{note}</span>}
          {action !== undefined && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>{action}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 목록 한 줄 — 아래에 옅은 선. */
export const listRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px solid var(--line-soft)",
};

/** 인스펙터의 작은 머리말 (11px 굵게, 회색). */
export function GroupLabel({ children, action, first = false }: { children: React.ReactNode; action?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: first ? "0 4px" : "12px 4px 0", fontSize: 11, fontWeight: 600, color: "var(--ink-4)" }}>
      <span style={{ minWidth: 0 }}>{children}</span>
      {action !== undefined && <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 12 }}>{action}</span>}
    </div>
  );
}

/** 시스템 설정처럼 묶은 둥근 칸. */
export function Group({ children, padding = 0, style }: { children: React.ReactNode; padding?: number | string; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--group-edge)",
        padding,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** 묶은 칸 안의 한 줄 — 왼쪽 이름, 오른쪽 값. */
export function GroupRow({ label, value, sub, last = false }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "9px 12px",
        borderBottom: last ? 0 : "1px solid var(--line-soft)",
        fontSize: 13,
      }}
    >
      <span style={{ flexGrow: 1, minWidth: 0, color: "var(--ink)" }}>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
        <span style={{ fontWeight: 600 }}>{value}</span>
        {sub !== undefined && <span style={{ display: "block", fontSize: 11, color: "var(--ink-3)", fontWeight: 400 }}>{sub}</span>}
      </span>
    </div>
  );
}

/** 맥 체크 동그라미 — 비면 테두리, 하면 색이 차고 흰 체크. */
export function CheckCircle({ done, color = "var(--accent)", size = 18 }: { done: boolean; color?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        border: done ? 0 : `1.5px solid ${color === "var(--accent)" ? "var(--ink-5)" : color}`,
        background: done ? color : "transparent",
        display: "grid",
        placeItems: "center",
      }}
    >
      {done && (
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 12 12">
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
