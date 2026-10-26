"use client";

import type { AgendaRow, DayNoteRow, MemoRow } from "@nyanotion/db";
import { describeSchedule, homeNow, minutesOf, type RoutineItem } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { quickAddAction, toggleChecklistItemAction } from "@/lib/checklist-actions";
import { routineCheckAction } from "@/lib/routine-actions";
import { dayLabel, eventColor, type CalEvent } from "../calendar-model";
import { inputStyle } from "../checklist-item";
import { CheckBoxIcon } from "../icons";
import { Card, routineColorVar, useNarrow } from "../routines/routine-ui";
import { DayNoteCard } from "./day-note-card";
import { MemoCapture, MemoList, type MemoSpace } from "./memo-box";

/**
 * 오늘 — 하루를 한 화면에서 (`docs/15-today.md`). Bento(맥)의 '오늘'을 옮긴 것.
 *
 * 일정(여기서 적은 것 + 구독한 캘린더) · 오늘 할 일과 밀린 일 · 오늘 루틴 · 메모함 · 기분/회고.
 * 고치는 길은 전부 원래 화면과 같은 서버 동작이다 — 할 일은 체크리스트, 루틴은 루틴, 메모·기분은 생활 기록.
 */

export type TodayRoutine = { routine: RoutineItem; done: boolean; streak: number };

export function TodayScreen({
  today,
  serverTime,
  serverNow,
  events,
  todos,
  overdue,
  routines,
  memos,
  memoCount,
  note,
  memoSpaces,
  spaceLabel,
}: {
  today: string;
  /** 서버가 그린 시각 `HH:MM` — 첫 그리기와 어긋나지 않게. */
  serverTime: string;
  serverNow: number;
  events: CalEvent[];
  todos: AgendaRow[];
  overdue: AgendaRow[];
  routines: TodayRoutine[];
  memos: MemoRow[];
  memoCount: number;
  note: DayNoteRow | null;
  memoSpaces: MemoSpace[];
  /** space id → "나" · 가족 이름. */
  spaceLabel: Record<string, string>;
}) {
  const narrow = useNarrow();
  const [time, setTime] = useState(serverTime);
  useEffect(() => {
    const id = window.setInterval(() => setTime(homeNow().time), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const openTodos = todos.filter((t) => !t.done).length + overdue.length;
  const routineDone = routines.filter((r) => r.done).length;
  const evening = minutesOf(time) >= 18 * 60;

  const summary = [
    events.length > 0 ? `일정 ${events.length}개` : "일정 없음",
    openTodos > 0 ? `할 일 ${openTodos}개 남음` : todos.length > 0 ? "할 일 다 함" : null,
    routines.length > 0 ? `루틴 ${routineDone}/${routines.length}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const left = (
    <>
      <Card title="일정" note={undefined}>
        <Schedule events={events} todos={todos} time={time} today={today} />
      </Card>
      <Card title="할 일">
        <Todos todos={todos} overdue={overdue} today={today} personalSpaceId={memoSpaces[0]?.id ?? ""} spaceLabel={spaceLabel} />
      </Card>
      {routines.length > 0 && (
        <Card title="루틴">
          <Routines routines={routines} today={today} />
        </Card>
      )}
    </>
  );
  const right = (
    <>
      <Card title="메모함">
        <MemoCapture compact />
        <MemoList memos={memos} spaces={memoSpaces} now={serverNow} limit={5} />
        {memoCount > 5 && (
          <Link href="/memos" style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--ink-3)" }}>
            메모 {memoCount}개 모두 보기 ›
          </Link>
        )}
      </Card>
      <Card title={evening ? "오늘 돌아보기" : "오늘 기분"}>
        <DayNoteCard date={today} note={note} evening={evening} compact />
        <Link href="/journal" style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--ink-3)" }}>
          지난 기록 · 주간 회고 ›
        </Link>
      </Card>
    </>
  );

  return (
    <div style={{ flexGrow: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: narrow ? "18px 16px 48px" : "28px 32px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: narrow ? 22 : 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{dayLabel(today)}</h1>
            <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>{summary}</p>
          </div>
          <Link
            href={`/?view=day&d=${today}`}
            style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "6px 10px", background: "var(--card)" }}
          >
            캘린더에서 보기
          </Link>
        </header>
        {narrow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {left}
            {right}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{left}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{right}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 일정 */

type Row =
  | { kind: "event"; key: string; start: number | null; end: number | null; event: CalEvent }
  | { kind: "todo"; key: string; start: number; end: number; item: AgendaRow };

function Schedule({ events, todos, time, today }: { events: CalEvent[]; todos: AgendaRow[]; time: string; today: string }) {
  const now = minutesOf(time);
  const rows: Row[] = [
    ...events.map((event): Row => {
      // 여러 날 일정은 오늘 안에서 잘라 보인다.
      const start = event.startTime === null ? null : event.startsOn < today ? 0 : minutesOf(event.startTime);
      const end = event.startTime === null ? null : event.endsOn > today ? 24 * 60 : minutesOf(event.endTime ?? event.startTime);
      return { kind: "event", key: `e:${event.id}`, start, end, event };
    }),
    ...todos
      .filter((t) => t.dueTime !== null)
      .map((item): Row => {
        const start = minutesOf(item.dueTime ?? "00:00");
        return { kind: "todo", key: `t:${item.id}`, start, end: start + (item.estMin ?? 30), item };
      }),
  ].sort((a, b) => (a.start ?? -1) - (b.start ?? -1));

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-4)" }}>
        오늘은 정해 둔 일정이 없어요.{" "}
        <Link href={`/?view=day&d=${today}`} style={{ color: "var(--ink-3)" }}>
          캘린더에서 적기
        </Link>
      </p>
    );
  }
  const nextIndex = rows.findIndex((r) => r.start !== null && r.start >= now);

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
      {rows.map((row, i) => {
        const past = row.end !== null && row.end <= now;
        const current = row.start !== null && row.end !== null && row.start <= now && now < row.end;
        const color = row.kind === "event" ? eventColor(row.event) : "var(--accent)";
        const title = row.kind === "event" ? row.event.title : row.item.title;
        const when = row.start === null ? "종일" : `${clock(row.start)}–${clock(row.end ?? row.start)}`;
        const sub =
          row.kind === "event"
            ? [row.event.location, row.event.plan === null ? row.event.calendarName : null].filter(Boolean).join(" · ")
            : `할 일${row.item.done ? " · 함" : ""}`;
        return (
          <li key={row.key}>
            {i === nextIndex && nextIndex > 0 && <NowLine time={time} />}
            <div style={{ display: "flex", gap: 12, padding: "8px 0", alignItems: "flex-start", opacity: past ? 0.5 : 1 }}>
              <span style={{ width: 82, flexShrink: 0, fontSize: 12, color: current ? "var(--accent)" : "var(--ink-3)", fontVariantNumeric: "tabular-nums", paddingTop: 2, fontWeight: current ? 600 : 400 }}>
                {when}
              </span>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 500, textDecoration: row.kind === "todo" && row.item.done ? "line-through" : "none" }}>{title}</span>
                {sub !== "" && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-4)", marginTop: 1 }}>{sub}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NowLine({ time }: { time: string }) {
  return (
    <div aria-label={`지금 ${time}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0" }}>
      <span style={{ width: 82, fontSize: 11, color: "var(--late)", fontVariantNumeric: "tabular-nums" }}>지금 {time}</span>
      <span style={{ flexGrow: 1, borderTop: "1.5px solid var(--late)" }} />
    </div>
  );
}

function clock(minutes: number): string {
  const m = Math.min(minutes, 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ 할 일 */

function Todos({
  todos,
  overdue,
  today,
  personalSpaceId,
  spaceLabel,
}: {
  todos: AgendaRow[];
  overdue: AgendaRow[];
  today: string;
  personalSpaceId: string;
  spaceLabel: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState("");

  const run = (task: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setProblem(null);
      try {
        await task();
        after?.();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });

  const add = () => {
    if (text.trim() === "" || personalSpaceId === "") return;
    run(() => quickAddAction(personalSpaceId, { title: text, dueOn: today }), () => setText(""));
  };

  const sorted = [...todos].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: pending ? 0.7 : 1 }}>
      {overdue.length === 0 && todos.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-4)" }}>오늘로 정한 할 일이 없어요.</p>}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {overdue.map((item) => (
          <TodoRow key={item.id} item={item} late label={spaceLabel[item.spaceId]} onToggle={() => run(() => toggleChecklistItemAction(item.id, !item.done))} />
        ))}
        {sorted.map((item) => (
          <TodoRow key={item.id} item={item} label={spaceLabel[item.spaceId]} onToggle={() => run(() => toggleChecklistItemAction(item.id, !item.done))} />
        ))}
      </ul>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
          }}
          placeholder="오늘 할 일 적기"
          aria-label="오늘 할 일 적기"
          style={{ ...inputStyle, flexGrow: 1, minWidth: 0 }}
        />
      </div>
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}

function TodoRow({ item, late = false, label, onToggle }: { item: AgendaRow; late?: boolean; label?: string; onToggle: () => void }) {
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
      <button onClick={onToggle} aria-label={item.done ? `"${item.title}" 안 한 것으로` : `"${item.title}" 했음`} style={{ display: "flex", padding: 0, marginTop: 1, color: item.done ? "var(--accent)" : "var(--ink-4)" }}>
        <CheckBoxIcon size={17} checked={item.done} />
      </button>
      <span style={{ minWidth: 0, flexGrow: 1 }}>
        <span style={{ fontSize: 13.5, color: item.done ? "var(--ink-4)" : "var(--ink)", textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: late ? "var(--late)" : "var(--ink-4)", marginTop: 1 }}>
          {[late && item.dueOn !== null ? `밀림 · ${Number(item.dueOn.slice(5, 7))}/${Number(item.dueOn.slice(8))}` : null, item.dueTime, label, item.checklistTitle.trim() || null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ 루틴 */

function Routines({ routines, today }: { routines: TodayRoutine[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState<Record<string, boolean>>({});

  const toggle = (r: TodayRoutine) => {
    const next = !(over[r.routine.id] ?? r.done);
    setOver((o) => ({ ...o, [r.routine.id]: next }));
    start(async () => {
      setProblem(null);
      const result = await routineCheckAction(r.routine.id, today, next);
      if (!result.ok) {
        setOver((o) => ({ ...o, [r.routine.id]: !next }));
        setProblem(result.message ?? "하지 못했어요.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, opacity: pending ? 0.85 : 1 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "2px 16px" }}>
        {routines.map((r) => {
          const done = over[r.routine.id] ?? r.done;
          const color = routineColorVar(r.routine);
          return (
            <li key={r.routine.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
              <button
                onClick={() => toggle(r)}
                aria-label={done ? `${r.routine.title} 완료 취소` : `${r.routine.title} 완료`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  textAlign: "center",
                  border: `1.5px solid ${color}`,
                  background: done ? color : "transparent",
                  color: "#fff",
                  fontSize: 12,
                  lineHeight: "19px",
                }}
              >
                {done ? "✓" : ""}
              </button>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, color: done ? "var(--ink-3)" : "var(--ink)" }}>{r.routine.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-4)" }}>
                  {describeSchedule(r.routine.schedule)}
                  {r.streak > 0 && <span style={{ color: "var(--accent)" }}> · {r.streak}일 연속</span>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Link href="/routines" style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--ink-3)" }}>
        루틴 화면 ›
      </Link>
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12, color: "var(--late)" }}>
          {problem}
        </p>
      )}
    </div>
  );
}
