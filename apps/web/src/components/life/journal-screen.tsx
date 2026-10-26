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
import { Group, GroupLabel, PageTitle, Section, SplitView, listRow } from "../mac-ui";
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
  const current = reviews.find((r) => r.kind === selected.kind && r.period === selected.period) ?? null;
  const range = periodRange(selected.kind, selected.period);
  const inPeriod = range === null ? [] : notes.filter((n) => n.date >= range.from && n.date <= range.to);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const recentDays = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
  const noteOf = (day: string) => notes.find((n) => n.date === day) ?? null;
  const others = reviews.filter((r) => !(r.kind === selected.kind && r.period === selected.period));

  const main = (
    <>
      <PageTitle title="기록" sub="하루 기분·회고와 주간·월간 회고 — 나만 봐요." />
      {/* 맥의 분할 컨트롤 — 고른 칸만 흰 판이 떠 있다. 쓴 회고가 있는 기간에는 점. */}
      <nav aria-label="회고 기간" style={{ display: "flex", alignSelf: "flex-start", flexWrap: "wrap", gap: 2, padding: 2, background: "var(--chip)", borderRadius: "var(--radius)" }}>
        {choices.map((c) => {
          const on = c.kind === selected.kind && c.period === selected.period;
          const has = reviews.some((r) => r.kind === c.kind && r.period === c.period);
          return (
            <Link
              key={`${c.kind}:${c.period}`}
              href={`/journal?k=${c.kind}&p=${c.period}`}
              aria-current={on ? "page" : undefined}
              style={{
                height: 24,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "0 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 12.5,
                background: on ? "var(--card)" : "transparent",
                boxShadow: on ? "var(--shadow-control)" : "none",
                color: on ? "var(--ink)" : "var(--ink-2)",
                fontWeight: on ? 500 : 400,
              }}
            >
              {c.label}
              {has && <span aria-label="씀" style={{ width: 5, height: 5, borderRadius: 3, background: "var(--accent)" }} />}
            </Link>
          );
        })}
      </nav>
      <ReviewEditor key={`${selected.kind}:${selected.period}:${current?.updatedAt ?? ""}`} choice={selected} review={current} />

      <Section title={`${periodLabel(selected.kind, selected.period)}의 하루들`} note={inPeriod.length === 0 ? "기록 없음" : `${inPeriod.length}일 기록`}>
        {inPeriod.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 0" }}>이 기간에 남긴 하루 기록이 없어요.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {inPeriod.map((n) => (
              <DayLine key={n.date} note={n} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );

  const inspector = (
    <>
      <GroupLabel first>최근 2주 · 눌러서 고치기</GroupLabel>
      <Group padding="0 12px">
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {recentDays.map((day, i) => {
            const n = noteOf(day);
            const open = editingDay === day;
            return (
              <li key={day} style={{ borderTop: i === 0 ? 0 : "1px solid var(--line-soft)" }}>
                <button
                  onClick={() => setEditingDay(open ? null : day)}
                  aria-expanded={open}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 0", textAlign: "left" }}
                >
                  <span style={{ width: 64, flexShrink: 0, fontSize: 12.5, color: day === today ? "var(--today)" : "var(--ink)", fontWeight: day === today ? 600 : 400 }}>
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
      </Group>

      <GroupLabel>지난 회고{others.length === 0 ? "" : ` · ${others.length}개`}</GroupLabel>
      {others.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "0 4px" }}>아직 쓴 회고가 없어요.</p>
      ) : (
        <Group padding="0 12px">
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {others.map((r, i) => (
              <li key={r.id} style={{ borderTop: i === 0 ? 0 : "1px solid var(--line-soft)", padding: "9px 0" }}>
                <Link href={`/journal?k=${r.kind}&p=${r.period}`} style={{ display: "block" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{periodLabel(r.kind, r.period)}</span>
                  {r.source === "import" && <span style={{ marginLeft: 6, fontSize: 10.5, padding: "1px 6px", borderRadius: 3, background: "var(--chip)", color: "var(--ink-3)" }}>Bento</span>}
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 12, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.5 }}>{r.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );

  return <SplitView main={main} inspector={inspector} inspectorLabel="최근 하루와 지난 회고" />;
}

function ReviewEditor({ choice, review }: { choice: PeriodChoice; review: ReviewRow | null }) {
  const [text, setText] = useState(review?.text ?? "");
  const { pending, problem, call } = useLifeCall();
  const changed = text.trim() !== (review?.text ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <Section title={`${periodLabel(choice.kind, choice.period)} 회고`} note={review?.source === "import" ? "Bento 에서 가져온 글" : undefined} gap={8}>
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
    </Section>
  );
}

function DayLine({ note }: { note: DayNoteRow }) {
  return (
    <li style={{ ...listRow, flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, width: 104, flexShrink: 0 }}>{dayLabel(note.date)}</span>
        <Dots value={note.mood} title={note.mood ? `기분 ${MOOD_LABEL[note.mood]}` : "기분 없음"} />
        <Dots value={note.energy} title={note.energy ? `에너지 ${ENERGY_LABEL[note.energy]}` : "에너지 없음"} muted />
        {note.note !== null && <span style={{ fontSize: 13, color: "var(--ink)", minWidth: 0 }}>{note.note}</span>}
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
