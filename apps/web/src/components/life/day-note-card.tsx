"use client";

import type { DayNoteRow } from "@nyanotion/db";
import { ENERGY_LABEL, MOOD_LABEL, MOOD_LEVELS } from "@nyanotion/shared";
import { useState } from "react";
import { saveDayNoteAction } from "@/lib/life-actions";
import { SmallButton, inputStyle } from "../checklist-item";
import { useLifeCall } from "./memo-box";

/**
 * 하루 한 줄 — 기분 · 에너지(1~5) · 한 줄 · 하루 회고 (`docs/15-today.md`).
 * 기분·에너지는 누르는 즉시 저장하고, 글은 저장 단추로. 저녁(18시~)에는 회고 칸을 먼저 연다.
 */

export function DayNoteCard({
  date,
  note,
  evening,
  compact = false,
  isToday = true,
}: {
  date: string;
  note: DayNoteRow | null;
  /** 지난 날을 고칠 때는 false — 칸 이름이 "그날"이 된다. */
  isToday?: boolean;
  /** 저녁이면 회고 칸을 펼쳐 둔다. */
  evening: boolean;
  compact?: boolean;
}) {
  const { pending, problem, call } = useLifeCall();
  const [mood, setMood] = useState<number | null>(note?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(note?.energy ?? null);
  const [line, setLine] = useState(note?.note ?? "");
  const [retro, setRetro] = useState(note?.retro ?? "");
  const [retroOpen, setRetroOpen] = useState(evening || (note?.retro ?? "") !== "");
  const lineChanged = line.trim() !== (note?.note ?? "");
  const retroChanged = retro.trim() !== (note?.retro ?? "");

  const pick = (kind: "mood" | "energy", value: number) => {
    const current = kind === "mood" ? mood : energy;
    const next = current === value ? null : value; // 같은 것을 다시 누르면 지운다
    if (kind === "mood") setMood(next);
    else setEnergy(next);
    call(() => saveDayNoteAction(date, { [kind]: next }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 12 }}>
      <Scale label="기분" value={mood} labels={MOOD_LABEL} onPick={(v) => pick("mood", v)} disabled={pending} />
      <Scale label="에너지" value={energy} labels={ENERGY_LABEL} onPick={(v) => pick("energy", v)} disabled={pending} />
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && lineChanged) call(() => saveDayNoteAction(date, { note: line }));
          }}
          maxLength={1000}
          placeholder={isToday ? "오늘 한 줄" : "그날 한 줄"}
          aria-label={isToday ? "오늘 한 줄" : "그날 한 줄"}
          style={{ ...inputStyle, flexGrow: 1, minWidth: 0 }}
        />
        {lineChanged && (
          <SmallButton primary disabled={pending} onClick={() => call(() => saveDayNoteAction(date, { note: line }))}>
            저장
          </SmallButton>
        )}
      </div>
      {retroOpen ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={retro}
            onChange={(e) => setRetro(e.target.value)}
            maxLength={8000}
            rows={compact ? 3 : 5}
            placeholder="하루 회고 — 잘 된 것, 아쉬운 것, 내일 할 것"
            aria-label="하루 회고"
            style={{ ...inputStyle, width: "100%", height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.6 }}
          />
          {retroChanged && (
            <div>
              <SmallButton primary disabled={pending} onClick={() => call(() => saveDayNoteAction(date, { retro }))}>
                회고 저장
              </SmallButton>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setRetroOpen(true)} style={{ alignSelf: "flex-start", fontSize: 13, color: "var(--accent)" }}>
          하루 회고 쓰기
        </button>
      )}
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

function Scale({
  label,
  value,
  labels,
  onPick,
  disabled,
}: {
  label: string;
  value: number | null;
  labels: Record<number, string>;
  onPick: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 42, flexShrink: 0, fontSize: 12, color: "var(--ink-3)" }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 4 }}>
        {MOOD_LEVELS.map((level) => {
          const on = value === level;
          return (
            <button
              key={level}
              role="radio"
              aria-checked={on}
              aria-label={`${label} ${labels[level]}`}
              title={labels[level]}
              disabled={disabled}
              onClick={() => onPick(level)}
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                textAlign: "center",
                fontSize: 12.5,
                fontVariantNumeric: "tabular-nums",
                border: `1px solid ${on ? "var(--accent)" : "var(--line)"}`,
                background: on ? "var(--accent)" : value !== null && level < value ? "var(--accent-soft)" : "var(--card)",
                color: on ? "var(--on-accent)" : "var(--ink-3)",
              }}
            >
              {level}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, color: value === null ? "var(--ink-4)" : "var(--ink-2)", whiteSpace: "nowrap" }}>
        {value === null ? "—" : labels[value]}
      </span>
    </div>
  );
}
