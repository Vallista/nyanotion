"use client";

import {
  ROUTINE_SLOT_KEYS,
  ROUTINE_SLOT_LABEL,
  addDays,
  dayDiff,
  formatSecs,
  monthEnd,
  pct,
  perfectStreak,
  routineDayLabel,
  routineDayStat,
  routineInsights,
  routineRows,
  slotRates,
  startOfWeek,
  summarizeRoutines,
  compareRoutineRates,
  weekdayLabel,
  weekdayRates,
  type RoutineCell,
  type RoutineItem,
  type RoutineLogIndex,
} from "@nyanotion/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "../icons";
import { Card, linkButton, routineColorVar } from "./routine-ui";

/**
 * 기록 — 요약 4칸 · 루틴 고르기 · 히트맵 · 주간/월간 · 요일·시간대 · 분석 · 루틴별.
 * 색은 완료(이끼색) 한 가지의 단계만 쓴다. 루틴 색은 이름 옆 점에만.
 */
export function RoutineStats({
  routines,
  idx,
  today,
  narrow,
  onPickDay,
}: {
  routines: RoutineItem[];
  idx: RoutineLogIndex;
  today: string;
  narrow: boolean;
  onPickDay: (day: string) => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const picked = useMemo(
    () => (filter === null ? routines : routines.filter((r) => r.id === filter)),
    [routines, filter],
  );
  const active = useMemo(() => picked.filter((r) => r.archivedAt === null), [picked]);
  const insights = useMemo(() => routineInsights(active, idx, today), [active, idx, today]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Kpis routines={routines} idx={idx} today={today} narrow={narrow} />

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <Chip on={filter === null} onClick={() => setFilter(null)}>
          전체
        </Chip>
        {routines.map((r) => (
          <Chip key={r.id} on={filter === r.id} dim={r.archivedAt !== null} onClick={() => setFilter(filter === r.id ? null : r.id)}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: routineColorVar(r) }} />
            {r.title}
          </Chip>
        ))}
      </div>

      <Card title="한 해" note="칸을 누르면 그날 기록을 고쳐요">
        <Heatmap routines={picked} idx={idx} today={today} onPick={onPickDay} />
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1.4fr) minmax(0,1fr)", gap: 16 }}>
        <Card>
          <Period routines={picked} idx={idx} today={today} onPick={onPickDay} />
        </Card>
        <Card title="요일 · 시간대" note="최근 8주">
          <Patterns routines={picked} idx={idx} today={today} />
        </Card>
      </div>

      {insights.length > 0 && (
        <Card title="눈여겨볼 것">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {insights.map((i) => (
              <li key={i.id} style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 6,
                    height: 6,
                    marginTop: 8,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: i.tone === "good" ? "var(--accent)" : i.tone === "warn" ? "var(--late)" : "var(--ink-4)",
                  }}
                />
                {i.text}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="루틴별" note="최근 14일 · 30일 달성률">
        <Rows routines={routines} idx={idx} today={today} narrow={narrow} filter={filter} onFilter={setFilter} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ 요약 */

function Kpis({ routines, idx, today, narrow }: { routines: RoutineItem[]; idx: RoutineLogIndex; today: string; narrow: boolean }) {
  const day = routineDayStat(routines, idx, today, today);
  const perfect = perfectStreak(routines, idx, today);
  const r30 = summarizeRoutines(routines, idx, addDays(today, -29), today, today);
  // 비교는 어제까지의 30일 대 그 앞 30일 — 오늘 남은 것은 놓친 게 아니다.
  const delta = compareRoutineRates(routines, idx, addDays(today, -30), today, addDays(today, -60), addDays(today, -31), today)?.delta ?? null;
  const ws = startOfWeek(today);
  const elapsed = dayDiff(ws, today);
  const week = summarizeRoutines(routines, idx, ws, today, today);
  const last = summarizeRoutines(routines, idx, addDays(ws, -7), addDays(ws, elapsed - 7), today);
  return (
    <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 10 }}>
      <Kpi label="오늘" value={day.scheduled > 0 ? `${day.done}/${day.scheduled}` : "–"} sub={day.scheduled === 0 ? "예정 없음" : day.done === day.scheduled ? "모두 끝냄" : `${day.scheduled - day.done}개 남음`} good={day.scheduled > 0 && day.done === day.scheduled} />
      <Kpi label="모두 끝낸 날 연속" value={`${perfect.current}일`} sub={`최고 ${perfect.best}일`} good={perfect.current > 0} />
      <Kpi label="30일 달성률" value={pct(r30.rate)} sub={delta === null ? "앞 30일 기록 없음" : delta === 0 ? "앞 30일과 같음" : `앞 30일 대비 ${delta > 0 ? "+" : ""}${delta}%p`} />
      <Kpi label="이번 주 쓴 시간" value={formatSecs(week.secs)} sub={week.secs > 0 || last.secs > 0 ? `지난주 같은 기간 ${formatSecs(last.secs)}` : "기록 없음"} />
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: good ? "var(--accent)" : "var(--ink)", lineHeight: 1.4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

function Chip({ on, dim, onClick, children }: { on: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        height: 28,
        padding: "0 11px",
        borderRadius: 14,
        border: `1px solid ${on ? "var(--ink-2)" : "var(--line)"}`,
        background: on ? "var(--ink)" : "var(--card)",
        color: on ? "var(--paper)" : "var(--ink-2)",
        fontSize: 12.5,
        opacity: dim && !on ? 0.6 : 1,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ 히트맵 */

const HEAT = ["var(--chip)", "rgba(76,107,87,0.28)", "rgba(76,107,87,0.5)", "rgba(76,107,87,0.74)", "var(--accent)"];

function heatLevel(rate: number | null, extra: number): number | null {
  if (rate === null) return extra > 0 ? 1 : null;
  if (rate <= 0) return 0;
  if (rate < 0.34) return 1;
  if (rate < 0.67) return 2;
  if (rate < 1) return 3;
  return 4;
}

function Heatmap({ routines, idx, today, onPick }: { routines: RoutineItem[]; idx: RoutineLogIndex; today: string; onPick: (day: string) => void }) {
  const weeks = 53;
  const first = addDays(startOfWeek(today), -(weeks - 1) * 7);
  const start = routines.reduce((m, r) => (r.startDate < m ? r.startDate : m), today);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  const cell = 12;
  const gap = 3;
  const columns = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateRows: `14px repeat(7, ${cell}px)`, rowGap: gap, fontSize: 10, color: "var(--ink-4)" }}>
          <span />
          {["", "월", "", "수", "", "금", ""].map((t, i) => (
            <span key={i} style={{ lineHeight: `${cell}px` }}>
              {t}
            </span>
          ))}
        </div>
        <div ref={scroller} style={{ overflowX: "auto", flexGrow: 1 }}>
          <div style={{ display: "flex", gap }}>
            {columns.map((days) => {
              const firstOfMonth = days.find((d) => d.endsWith("-01"));
              return (
                <div key={days[0]} style={{ display: "grid", gridTemplateRows: `14px repeat(7, ${cell}px)`, rowGap: gap }}>
                  <span style={{ fontSize: 10, color: "var(--ink-4)", width: cell, whiteSpace: "nowrap", overflow: "visible" }}>
                    {firstOfMonth ? `${Number(firstOfMonth.slice(5, 7))}월` : ""}
                  </span>
                  {days.map((d) => {
                    const future = d > today;
                    const before = d < start;
                    const s = routineDayStat(routines, idx, d, today);
                    const level = future || before ? null : heatLevel(s.rate, s.extra);
                    const label = `${routineDayLabel(d)} — ${s.scheduled > 0 ? `${s.done}/${s.scheduled}` : "예정 없음"}${s.secs >= 60 ? ` · ${formatSecs(s.secs)}` : ""}`;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={future || before}
                        onClick={() => onPick(d)}
                        title={future ? undefined : label}
                        aria-label={future ? undefined : label}
                        style={{
                          width: cell,
                          height: cell,
                          padding: 0,
                          border: d === today ? "1.5px solid var(--ink-2)" : 0,
                          borderRadius: 2,
                          background: future ? "transparent" : level === null ? "var(--line-soft)" : HEAT[level],
                          cursor: future || before ? "default" : "pointer",
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-4)" }}>
        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "var(--line-soft)" }} />
        <span style={{ marginRight: 8 }}>예정 없음</span>
        <span>0%</span>
        {HEAT.map((c, i) => (
          <span key={i} style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: c }} />
        ))}
        <span>100%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 주간 · 월간 */

function Period({ routines, idx, today, onPick }: { routines: RoutineItem[]; idx: RoutineLogIndex; today: string; onPick: (day: string) => void }) {
  const [span, setSpan] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0);
  const [metric, setMetric] = useState<"rate" | "time">("rate");
  const [hover, setHover] = useState<string | null>(null);

  let from: string;
  let to: string;
  if (span === "week") {
    from = addDays(startOfWeek(today), offset * 7);
    to = addDays(from, 6);
  } else {
    let m = `${today.slice(0, 7)}-01`;
    for (let i = 0; i < -offset; i++) m = `${addDays(m, -1).slice(0, 7)}-01`;
    from = m;
    to = monthEnd(m);
  }
  const len = dayDiff(from, to < today ? to : today);
  const prevFrom = span === "week" ? addDays(from, -7) : `${addDays(from, -1).slice(0, 7)}-01`;
  const prevTo = [addDays(prevFrom, len), addDays(from, -1)].sort()[0]!;
  const cur = summarizeRoutines(routines, idx, from, to, today);
  const prev = summarizeRoutines(routines, idx, prevFrom, prevTo, today);
  const earliest = routines.reduce((m, r) => (r.startDate < m ? r.startDate : m), today);
  const maxSecs = Math.max(600, ...cur.days.map((d) => d.secs));
  const shown = hover ? cur.days.find((d) => d.date === hover) : undefined;
  const live = to >= today;
  const cmp = compareRoutineRates(routines, idx, from, to, prevFrom, addDays(from, -1), today);
  const rateSub =
    cmp === null
      ? live && from === today
        ? "비교는 내일부터"
        : "지난 기간 기록 없음"
      : `${live ? "어제까지 " : ""}${cmp.delta === 0 ? "지난 기간과 같음" : `지난 기간 대비 ${cmp.delta > 0 ? "+" : ""}${cmp.delta}%p`}`;
  const title =
    span === "month"
      ? `${from.slice(0, 4)}년 ${Number(from.slice(5, 7))}월`
      : `${Number(from.slice(5, 7))}/${Number(from.slice(8))} – ${Number(to.slice(5, 7))}/${Number(to.slice(8))}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Toggle value={span} options={[["week", "주간"], ["month", "월간"]]} onChange={(v) => { setSpan(v as "week" | "month"); setOffset(0); }} />
        <span style={{ flexGrow: 1 }} />
        <button type="button" aria-label="이전 기간" disabled={addDays(from, -1) < earliest} onClick={() => setOffset((o) => o - 1)} style={{ ...linkButton, opacity: addDays(from, -1) < earliest ? 0.3 : 1, display: "flex", transform: "rotate(180deg)" }}>
          <ChevronRight size={13} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{title}</span>
        <button type="button" aria-label="다음 기간" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} style={{ ...linkButton, opacity: offset >= 0 ? 0.3 : 1, display: "flex" }}>
          <ChevronRight size={13} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        <Stat label="달성률" value={pct(cur.rate)} sub={rateSub} />
        <Stat label="완료" value={`${cur.done}/${cur.scheduled}`} sub={`모두 끝낸 날 ${cur.perfectDays}일`} />
        <Stat label="쓴 시간" value={formatSecs(cur.secs)} sub={`지난 기간 ${formatSecs(prev.secs)}`} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Toggle value={metric} options={[["rate", "달성률"], ["time", "시간"]]} onChange={(v) => setMetric(v as "rate" | "time")} />
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
          {shown
            ? `${routineDayLabel(shown.date)} · ${shown.scheduled > 0 ? `${shown.done}/${shown.scheduled}` : "예정 없음"} · ${formatSecs(shown.secs)}`
            : "막대에 올리면 그날 숫자"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: span === "week" ? 8 : 2, height: 120, borderBottom: "1px solid var(--line)" }} onMouseLeave={() => setHover(null)}>
        {cur.days.map((d) => {
          const value = metric === "rate" ? d.rate : d.secs / maxSecs;
          const h = d.future || value === null ? 0 : Math.max(value > 0 ? 3 : 0, value * 112);
          return (
            <button
              key={d.date}
              type="button"
              disabled={d.future}
              onMouseEnter={() => setHover(d.date)}
              onFocus={() => setHover(d.date)}
              onClick={() => onPick(d.date)}
              aria-label={`${routineDayLabel(d.date)} ${d.scheduled > 0 ? `${d.done}/${d.scheduled}` : "예정 없음"}`}
              style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", padding: 0, border: 0, background: "transparent", cursor: d.future ? "default" : "pointer" }}
            >
              <span
                style={{
                  display: "block",
                  width: "100%",
                  height: h,
                  borderRadius: "2px 2px 0 0",
                  background: metric === "rate" ? "var(--accent)" : "var(--ink-3)",
                  opacity: hover === null || hover === d.date ? 1 : 0.45,
                }}
              />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: span === "week" ? 8 : 2, fontSize: 10.5, color: "var(--ink-4)", marginTop: -6 }}>
        {cur.days.map((d, i) => (
          <span key={d.date} style={{ flex: 1, textAlign: "center" }}>
            {span === "week" ? weekdayLabel(i) : i % 7 === 0 || d.date === today ? Number(d.date.slice(8)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
}

function Toggle({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" style={{ display: "inline-flex", padding: 2, gap: 2, background: "var(--chip)", borderRadius: "var(--radius)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          style={{
            height: 24,
            padding: "0 10px",
            border: 0,
            borderRadius: "var(--radius-sm)",
            background: v === value ? "var(--card)" : "transparent",
            boxShadow: v === value ? "0 1px 2px rgba(47,46,43,0.08)" : "none",
            color: v === value ? "var(--ink)" : "var(--ink-3)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 요일 · 시간대 */

function Patterns({ routines, idx, today }: { routines: RoutineItem[]; idx: RoutineLogIndex; today: string }) {
  const from = addDays(today, -55);
  const rates = weekdayRates(routines, idx, from, today);
  const slots = slotRates(routines, idx, from, today);
  const values = rates.map((r) => r.rate).filter((v): v is number => v !== null);
  const best = values.length > 0 ? Math.max(...values) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 104 }}>
        {rates.map((r, dow) => (
          <div key={dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 10.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{r.rate === null ? "" : Math.round(r.rate * 100)}</span>
            <span
              title={`${weekdayLabel(dow)}요일 ${r.done}/${r.scheduled}`}
              style={{
                width: "100%",
                maxWidth: 26,
                height: r.rate === null ? 0 : Math.max(2, r.rate * 70),
                borderRadius: "2px 2px 0 0",
                background: "var(--accent)",
                opacity: r.rate !== null && r.rate === best ? 1 : 0.55,
              }}
            />
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{weekdayLabel(dow)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {ROUTINE_SLOT_KEYS.filter((s) => slots[s].rate !== null).map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span style={{ width: 40, color: "var(--ink-2)" }}>{ROUTINE_SLOT_LABEL[s]}</span>
            <span style={{ flexGrow: 1, height: 5, borderRadius: 3, background: "var(--chip)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(slots[s].rate ?? 0) * 100}%`, background: "var(--accent)" }} />
            </span>
            <span style={{ width: 36, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>{pct(slots[s].rate)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 루틴별 */

const CELL_STYLE: Record<RoutineCell, (color: string) => React.CSSProperties> = {
  done: (c) => ({ background: c }),
  extra: (c) => ({ background: c, opacity: 0.4 }),
  missed: () => ({ background: "var(--line-strong)" }),
  pending: (c) => ({ boxShadow: `inset 0 0 0 1.2px ${c}` }),
  off: () => ({ background: "var(--line-soft)" }),
};

function Rows({
  routines,
  idx,
  today,
  narrow,
  filter,
  onFilter,
}: {
  routines: RoutineItem[];
  idx: RoutineLogIndex;
  today: string;
  narrow: boolean;
  filter: string | null;
  onFilter: (id: string | null) => void;
}) {
  const rows = routineRows(routines, idx, today);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((row, i) => {
        const color = routineColorVar(row.routine);
        const on = filter === row.routine.id;
        return (
          <button
            key={row.routine.id}
            type="button"
            onClick={() => onFilter(on ? null : row.routine.id)}
            aria-pressed={on}
            style={{
              ...linkButton,
              display: "grid",
              gridTemplateColumns: narrow ? "minmax(0,1fr) auto" : "minmax(0,1.2fr) auto minmax(0,1fr) 56px",
              alignItems: "center",
              gap: narrow ? 8 : 14,
              padding: "9px 4px",
              borderTop: i === 0 ? 0 : "1px solid var(--line-soft)",
              background: on ? "var(--accent-soft)" : "transparent",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.routine.title}</span>
              {row.routine.archivedAt !== null && (
                <span style={{ fontSize: 10.5, padding: "0 6px", borderRadius: 3, background: "var(--chip)", color: "var(--ink-3)" }}>보관</span>
              )}
            </span>
            {narrow && <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{pct(row.rate30.rate)}</span>}
            <span style={{ display: "flex", gap: 2, gridColumn: narrow ? "1 / -1" : undefined }} aria-label="최근 14일">
              {row.recent.map((c, k) => (
                <span key={k} style={{ width: 10, height: 10, borderRadius: 2, ...CELL_STYLE[c](color) }} />
              ))}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", gridColumn: narrow ? "1 / -1" : undefined }}>
              {row.streak.current > 0 ? <span style={{ color: "var(--accent)" }}>{row.streak.current}일 연속</span> : "연속 없음"}
              {` · 최고 ${row.streak.best}일`}
              {row.secs7 > 0 ? ` · 7일 ${formatSecs(row.secs7)}` : ""}
            </span>
            {!narrow && <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct(row.rate30.rate)}</span>}
          </button>
        );
      })}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 11, color: "var(--ink-4)" }}>
        {(
          [
            ["done", "완료"],
            ["missed", "놓침"],
            ["pending", "오늘 남음"],
            ["extra", "쉬는 날에 함"],
            ["off", "쉬는 날"],
          ] as [RoutineCell, string][]
        ).map(([c, label]) => (
          <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, ...CELL_STYLE[c]("var(--ink-3)") }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

