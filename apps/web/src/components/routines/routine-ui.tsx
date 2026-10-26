"use client";

import { ROUTINE_SLOT_LABEL, ROUTINE_TEMPLATES, colorOf, type RoutineItem } from "@nyanotion/shared";
import { useEffect, useState } from "react";

/** 루틴 화면 여기저기서 같이 쓰는 작은 것들. */

export type RoutineTemplateChoice = (typeof ROUTINE_TEMPLATES)[number];

/** 루틴 색 — `globals.css` 의 `--routine-*`. 이름 옆 점과 체크에만 쓴다. */
export function routineColorVar(r: Pick<RoutineItem, "color">): string {
  return `var(--routine-${colorOf(r)})`;
}

/** 폰 폭이면 true. 첫 그리기(서버)에서는 null. */
export function useNarrow(): boolean | null {
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export const linkButton: React.CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  font: "inherit",
  color: "var(--ink-2)",
  cursor: "pointer",
};

export function Meter({ value, width, tone }: { value: number; width: number; tone: "done" | "time" }) {
  return (
    <span aria-hidden="true" style={{ display: "block", width, height: 4, borderRadius: 2, background: "var(--chip)", overflow: "hidden" }}>
      <span
        style={{
          display: "block",
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: "100%",
          background: tone === "done" ? "var(--accent)" : "var(--ink-3)",
          transition: "width 0.3s ease",
        }}
      />
    </span>
  );
}

export function TemplateChips({ onPick }: { onPick: (template: RoutineTemplateChoice) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ROUTINE_TEMPLATES.map((t) => (
        <button
          key={t.title}
          type="button"
          onClick={() => onPick(t)}
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 15,
            border: "1px solid var(--line)",
            background: "var(--paper)",
            fontSize: 12.5,
            color: "var(--ink-2)",
            cursor: "pointer",
          }}
        >
          {t.title}
          <span style={{ color: "var(--ink-4)" }}>
            {" "}
            · {ROUTINE_SLOT_LABEL[t.slot]}
            {t.goalMin ? ` ${t.goalMin}분` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Card({ title, note, children, id }: { title?: string; note?: string; children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      style={{
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      {title && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{title}</h2>
          {note && <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-4)" }}>{note}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
