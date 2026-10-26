"use client";

import type { DayNoteRow, ReviewRow } from "@nyanotion/db";
import {
  ENERGY_LABEL,
  MOOD_LABEL,
  addDays,
  periodLabel,
  periodRange,
  type ReviewPeriodKind,
} from "@nyanotion/shared";
import Link from "next/link";
import { useState } from "react";
import { saveReviewAction } from "@/lib/life-actions";
import { dayLabel } from "../calendar-model";
import { SmallButton, inputStyle } from "../checklist-item";
import { Card, useNarrow } from "../routines/routine-ui";
import { DayNoteCard } from "./day-note-card";
import { useLifeCall } from "./memo-box";

/**
 * 기록 — 주간·월간 회고와 지난 하루들 (`docs/15-today.md`).
 * 회고를 쓰는 동안 그 기간의 하루 기록(기분·한 줄·하루 회고)을 옆에 펼쳐 둔다 — 돌아볼 재료.
 */

export type PeriodChoice = { kind: ReviewPeriodKind; period: string; label: string };

export function JournalScreen({
  today,
  choices,
  selected,
  reviews,
  notes,
}: {
  today: string;
  /** 고를 수 있는 기간 — 이번 주 · 지난주 · 이번 달 · 지난달. */
  choices: PeriodChoice[];
  selected: PeriodChoice;
  reviews: ReviewRow[];
  /** 최근 두 달쯤의 하루 기록. */
  notes: DayNoteRow[];
}) {
  const narrow = useNarrow();
  const current = reviews.find((r) => r.kind === selected.kind && r.period === selected.period) ?? null;
  const range = periodRange(selected.kind, selected.period);
  const inPeriod = range === null ? [] : notes.filter((n) => n.date >= range.from && n.date <= range.to);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const recentDays = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const noteOf = (day: string) => notes.find((n) => n.date === day) ?? null;
  const others = reviews.filter((r) => !(r.kind === selected.kind && r.period === selected.period));

  return (
    <div style={{ flexGrow: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: narrow ? "18px 16px 48px" : "28px 32px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 style={{ fontSize: narrow ? 22 : 26, fontWeight: 700, letterSpacing: "-0.02em" }}>기록</h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>하루 기분·회고와 주간·월간 회고 — 나만 봐요.</p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Card>
              <nav aria-label="회고 기간" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {choices.map((c) => {
                  const on = c.kind === selected.kind && c.period === selected.period;
                  const has = reviews.some((r) => r.kind === c.kind && r.period === c.period);
                  return (
                    <Link
                      key={`${c.kind}:${c.period}`}
                      href={`/journal?k=${c.kind}&p=${c.period}`}
                      aria-current={on ? "page" : undefined}
                      style={{
                        height: 30,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 12px",
                        borderRadius: 15,
                        fontSize: 12.5,
                        border: `1px solid ${on ? "var(--ink)" : "var(--line)"}`,
                        background: on ? "var(--ink)" : "var(--card)",
                        color: on ? "var(--paper)" : "var(--ink-2)",
                      }}
                    >
                      {c.label}
                      {has && <span aria-label="씀" style={{ width: 6, height: 6, borderRadius: 3, background: on ? "var(--paper)" : "var(--accent)" }} />}
                    </Link>
                  );
                })}
              </nav>
              <ReviewEditor key={`${selected.kind}:${selected.period}:${current?.updatedAt ?? ""}`} choice={selected} review={current} />
            </Card>

            <Card title={`${periodLabel(selected.kind, selected.period)}의 하루들`} note={inPeriod.length === 0 ? "기록 없음" : `${inPeriod.length}일 기록`}>
              {inPeriod.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--ink-4)" }}>이 기간에 남긴 하루 기록이 없어요.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {inPeriod.map((n, i) => (
                    <DayLine key={n.date} note={n} first={i === 0} />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Card title="최근 2주" note="눌러서 고치기">
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {recentDays.map((day, i) => {
                  const n = noteOf(day);
                  const open = editingDay === day;
                  return (
                    <li key={day} style={{ borderTop: i === 0 ? 0 : "1px solid var(--line-soft)" }}>
                      <button
                        onClick={() => setEditingDay(open ? null : day)}
                        aria-expanded={open}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 0", textAlign: "left" }}
                      >
                        <span style={{ width: 92, flexShrink: 0, fontSize: 12.5, color: day === today ? "var(--accent)" : "var(--ink-2)", fontWeight: day === today ? 600 : 400 }}>
                          {day === today ? "오늘" : dayLabel(day).replace(/^\d+월 /, "")}
                        </span>
                        <Dots value={n?.mood ?? null} title={n?.mood ? `기분 ${MOOD_LABEL[n.mood]}` : "기분 없음"} />
                        <Dots value={n?.energy ?? null} title={n?.energy ? `에너지 ${ENERGY_LABEL[n.energy]}` : "에너지 없음"} muted />
                        <span style={{ minWidth: 0, flexGrow: 1, fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n?.note ?? (n?.retro ? "회고 있음" : "")}
                        </span>
                      </button>
                      {open && (
                        <div style={{ padding: "4px 0 12px" }}>
                          <DayNoteCard key={`${day}:${n?.updatedAt ?? ""}`} date={day} note={n} evening={false} compact isToday={day === today} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="지난 회고" note={others.length === 0 ? undefined : `${others.length}개`}>
              {others.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "var(--ink-4)" }}>아직 쓴 회고가 없어요.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {others.map((r, i) => (
                    <li key={r.id} style={{ borderTop: i === 0 ? 0 : "1px solid var(--line-soft)", padding: "8px 0" }}>
                      <Link href={`/journal?k=${r.kind}&p=${r.period}`} style={{ border: 0, display: "block" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{periodLabel(r.kind, r.period)}</span>
                        {r.source === "import" && <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 3, background: "var(--chip)", color: "var(--ink-3)" }}>Bento</span>}
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.55 }}>{r.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewEditor({ choice, review }: { choice: PeriodChoice; review: ReviewRow | null }) {
  const [text, setText] = useState(review?.text ?? "");
  const { pending, problem, call } = useLifeCall();
  const changed = text.trim() !== (review?.text ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600 }}>
        {periodLabel(choice.kind, choice.period)} 회고
        {review?.source === "import" && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--ink-3)" }}>Bento 에서 가져온 글</span>}
      </h2>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={10}
        maxLength={20000}
        placeholder={choice.kind === "week" ? "이번 주 — 잘 된 것, 아쉬운 것, 다음 주에 바꿀 것" : "이번 달 — 무엇에 시간을 썼고, 무엇이 남았나"}
        aria-label="회고"
        style={{ ...inputStyle, width: "100%", height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.65 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SmallButton primary busy={pending} disabled={pending || !changed} onClick={() => call(() => saveReviewAction(choice.kind, choice.period, text), () => setSaved(true))}>
          저장
        </SmallButton>
        {saved && !changed && <span style={{ fontSize: 12, color: "var(--accent)" }}>저장했어요</span>}
        {review !== null && text.trim() === "" && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>비우고 저장하면 이 회고를 지워요</span>}
        {problem !== null && (
          <span role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
            {problem}
          </span>
        )}
      </div>
    </div>
  );
}

function DayLine({ note, first }: { note: DayNoteRow; first: boolean }) {
  return (
    <li style={{ borderTop: first ? 0 : "1px solid var(--line-soft)", padding: "8px 0", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, width: 104, flexShrink: 0 }}>{dayLabel(note.date)}</span>
        <Dots value={note.mood} title={note.mood ? `기분 ${MOOD_LABEL[note.mood]}` : "기분 없음"} />
        <Dots value={note.energy} title={note.energy ? `에너지 ${ENERGY_LABEL[note.energy]}` : "에너지 없음"} muted />
        {note.note !== null && <span style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 0 }}>{note.note}</span>}
      </div>
      {note.retro !== null && <p style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "pre-wrap", lineHeight: 1.6, paddingLeft: 112 }}>{note.retro}</p>}
    </li>
  );
}

/** 1~5 를 점 다섯 개로. 비면 흐린 점. */
function Dots({ value, title, muted = false }: { value: number | null; title: string; muted?: boolean }) {
  return (
    <span role="img" aria-label={title} title={title} style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            background: value !== null && i <= value ? (muted ? "var(--ink-3)" : "var(--accent)") : "var(--chip)",
          }}
        />
      ))}
    </span>
  );
}
