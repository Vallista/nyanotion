"use client";

import type { AgendaRow, DayNoteRow, MemoRow } from "@nyanotion/db";
import { describeSchedule, homeNow, minutesOf, type RoutineItem } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { quickAddAction, toggleChecklistItemAction } from "@/lib/checklist-actions";
import { routineCheckAction } from "@/lib/routine-actions";
import { dayLabel, eventColor, type CalEvent } from "../calendar-model";
import { PlusIcon } from "../icons";
import { CheckCircle, Group, GroupLabel, PageTitle, Section, SplitView, listRow } from "../mac-ui";
import { routineColorVar } from "../routines/routine-ui";
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

  const main = (
    <>
      <PageTitle title={dayLabel(today)} sub={summary} />
      <Section title="일정" action={<Link href={`/?view=day&d=${today}`} style={{ fontSize: 12.5 }}>캘린더에서 보기</Link>}>
        <Schedule events={events} todos={todos} time={time} today={today} />
      </Section>
      <Section title="할 일" note={openTodos > 0 ? `${openTodos}개 남음` : undefined}>
        <Todos todos={todos} overdue={overdue} today={today} personalSpaceId={memoSpaces[0]?.id ?? ""} spaceLabel={spaceLabel} />
      </Section>
      {routines.length > 0 && (
        <Section
          title="루틴"
          note={`${routineDone}/${routines.length}`}
          action={<Link href="/routines" style={{ fontSize: 12.5 }}>루틴 화면</Link>}
        >
          <Routines routines={routines} today={today} />
        </Section>
      )}
    </>
  );
  const inspector = (
    <>
      <GroupLabel first action={<Link href="/journal">지난 기록</Link>}>
        {evening ? "오늘 돌아보기" : "오늘 기록"}
      </GroupLabel>
      <Group padding={12}>
        <DayNoteCard date={today} note={note} evening={evening} compact />
      </Group>
      <GroupLabel action={<Link href="/memos">{memoCount > 5 ? `${memoCount}개 모두 보기` : "모두 보기"}</Link>}>메모함</GroupLabel>
      <MemoCapture compact />
      {memos.length > 0 && (
        <Group padding="0 12px">
          <MemoList memos={memos} spaces={memoSpaces} now={serverNow} limit={5} />
        </Group>
      )}
    </>
  );

  return <SplitView main={main} inspector={inspector} inspectorLabel="오늘 기록과 메모함" />;
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
      <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "10px 0" }}>
        오늘은 정해 둔 일정이 없어요.{" "}
        <Link href={`/?view=day&d=${today}`}>캘린더에서 적기</Link>
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
        const when = row.start === null ? "종일" : `${clock(row.start)} – ${clock(row.end ?? row.start)}`;
        const sub =
          row.kind === "event"
            ? [row.event.location, row.event.plan === null ? row.event.calendarName : null].filter(Boolean).join(" · ")
            : `할 일${row.item.done ? " · 함" : ""}`;
        return (
          <li key={row.key}>
            {i === nextIndex && nextIndex > 0 && <NowLine time={time} />}
            <div style={{ ...listRow, gap: 12, color: past ? "var(--ink-3)" : "var(--ink)" }}>
              <span
                style={{
                  width: 96,
                  flexShrink: 0,
                  fontSize: 12,
                  color: current ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: current ? 600 : 400,
                  fontVariantNumeric: "tabular-nums",
                  paddingTop: 1,
                }}
              >
                {when}
              </span>
              <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: color, opacity: past ? 0.45 : 1, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: current ? 600 : 400,
                    textDecoration: row.kind === "todo" && row.item.done ? "line-through" : "none",
                  }}
                >
                  {title}
                </span>
                {sub !== "" && <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-3)", marginTop: 1 }}>{sub}</span>}
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
    <div aria-label={`지금 ${time}`} style={{ display: "flex", alignItems: "center", gap: 6, height: 14 }}>
      <span style={{ width: 96, fontSize: 11, fontWeight: 600, color: "var(--today)", fontVariantNumeric: "tabular-nums" }}>{time}</span>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--today)", marginLeft: 4, flexShrink: 0 }} />
      <span style={{ flexGrow: 1, height: 1, background: "var(--today)" }} />
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
    <div style={{ display: "flex", flexDirection: "column", opacity: pending ? 0.7 : 1 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {overdue.map((item) => (
          <TodoRow key={item.id} item={item} late label={spaceLabel[item.spaceId]} onToggle={() => run(() => toggleChecklistItemAction(item.id, !item.done))} />
        ))}
        {sorted.map((item) => (
          <TodoRow key={item.id} item={item} label={spaceLabel[item.spaceId]} onToggle={() => run(() => toggleChecklistItemAction(item.id, !item.done))} />
        ))}
      </ul>
      {/* 미리 알림처럼 목록 맨 아래 줄이 곧 적는 칸이다. */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", color: "var(--accent)" }}>
        <span style={{ width: 18, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <PlusIcon size={15} />
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) add();
          }}
          placeholder={overdue.length === 0 && todos.length === 0 ? "오늘로 정한 할 일이 없어요 — 여기에 적기" : "새 할 일"}
          aria-label="오늘 할 일 적기"
          style={{ flexGrow: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", fontSize: "var(--input-font, 13px)", color: "var(--ink)", padding: 0 }}
        />
      </label>
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
    <li style={listRow}>
      <button onClick={onToggle} aria-label={item.done ? `"${item.title}" 안 한 것으로` : `"${item.title}" 했음`} style={{ display: "flex", padding: 0, marginTop: 1 }}>
        <CheckCircle done={item.done} />
      </button>
      <span style={{ minWidth: 0, flexGrow: 1 }}>
        <span style={{ fontSize: 13, color: item.done ? "var(--ink-3)" : "var(--ink)", textDecoration: item.done ? "line-through" : "none" }}>{item.title}</span>
        <span style={{ display: "block", fontSize: 11.5, color: late ? "var(--late)" : "var(--ink-3)", marginTop: 1 }}>
          {[late && item.dueOn !== null ? `${Number(item.dueOn.slice(5, 7))}월 ${Number(item.dueOn.slice(8))}일 · 밀림` : null, item.dueTime, label, item.checklistTitle.trim() || null]
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
    <div style={{ display: "flex", flexDirection: "column", opacity: pending ? 0.85 : 1 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {routines.map((r) => {
          const done = over[r.routine.id] ?? r.done;
          const color = routineColorVar(r.routine);
          return (
            <li key={r.routine.id} style={{ ...listRow, alignItems: "center" }}>
              <button
                onClick={() => toggle(r)}
                aria-label={done ? `${r.routine.title} 완료 취소` : `${r.routine.title} 완료`}
                style={{ display: "flex", padding: 0 }}
              >
                <CheckCircle done={done} color={color} />
              </button>
              <span style={{ flexGrow: 1, minWidth: 0, fontSize: 13, color: done ? "var(--ink-3)" : "var(--ink)" }}>{r.routine.title}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {r.streak > 0 ? `${r.streak}일 연속` : describeSchedule(r.routine.schedule)}
              </span>
            </li>
          );
        })}
      </ul>
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12, color: "var(--late)", marginTop: 6 }}>
          {problem}
        </p>
      )}
    </div>
  );
}
