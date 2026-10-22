"use client";

import type { AgendaRow, CalendarEventRow } from "@nyanotion/db";
import {
  DEFAULT_BLOCK_MIN,
  addDays,
  addMonths,
  daysBetween,
  homeNow,
  startOfWeek,
  type CalendarView,
} from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  quickAddAction,
  removeChecklistItemAction,
  toggleChecklistItemAction,
  updateChecklistItemAction,
} from "@/lib/checklist-actions";
import { Backlog } from "./calendar-backlog";
import { EventDialog, NewTodoDialog, TodoDialog, type TodoPatch } from "./calendar-dialogs";
import { MonthGrid, TimeGrid, type GridHandlers } from "./calendar-grid";
import {
  TODO_COLOR,
  bucketByDay,
  dayLabel,
  todoEntries,
  type CalSpace,
  type Entry,
} from "./calendar-model";

/**
 * 첫 화면 캘린더 — 구독한 가족 캘린더의 일정 위에 할 일을 놓는다 (`docs/14-calendar.md`).
 *
 * 데이터는 서버가 그 주(또는 그 달 격자)만큼 준다. 화면은 날짜를 넘길 때마다 주소를 바꿔 다시 받는다 —
 * 캘린더는 가족이 같이 고치는 것이라 들고 있던 것을 오래 믿지 않는다.
 * 할 일을 고치는 길은 체크리스트와 **같은 서버 동작**이다 (`checklist-actions.ts`) — 권한도 같다.
 */

type DialogState =
  | { kind: "todo"; item: AgendaRow; ghostDay: string | null }
  | { kind: "event"; event: CalendarEventRow }
  | { kind: "new"; day: string; time: string | null };

const HIDDEN_KEY = "nyanotion.calendar.hidden";
const VIEW_LABEL: Record<CalendarView, string> = { day: "하루", week: "주", month: "달" };

function useNarrow(): boolean | null {
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}

function readHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function CalendarHome({
  view: chosenView,
  anchor,
  today,
  range,
  events,
  items,
  backlog,
  overdue,
  spaces,
  feedCount,
  feedProblems,
  people,
  userId,
}: {
  view: CalendarView | null;
  anchor: string;
  today: string;
  range: { from: string; to: string };
  events: CalendarEventRow[];
  items: AgendaRow[];
  backlog: AgendaRow[];
  overdue: AgendaRow[];
  spaces: CalSpace[];
  feedCount: number;
  feedProblems: number;
  people: { id: string; name: string }[];
  userId: string;
}) {
  const router = useRouter();
  const narrow = useNarrow();
  const [navigating, startNavigation] = useTransition();
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [placing, setPlacing] = useState<AgendaRow | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [nowTime, setNowTime] = useState(() => homeNow().time);

  useEffect(() => setHidden(readHidden()), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTime(homeNow().time), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // 주소로 정하지 않았으면 화면 폭으로 — 폰은 하루, 넓으면 주.
  const view: CalendarView | null = chosenView ?? (narrow === null ? null : narrow ? "day" : "week");

  const nameOf = useCallback(
    (id: string) => (id === userId ? "나" : (people.find((p) => p.id === id)?.name ?? "누군가")),
    [people, userId],
  );
  const spaceOf = (id: string) => spaces.find((space) => space.id === id);
  const spaceName = (id: string) => {
    const space = spaceOf(id);
    return space === undefined ? "" : space.kind === "personal" ? "내 할 일" : `${space.name}`;
  };

  const shown = (spaceId: string) => !hidden.includes(spaceId);
  const visibleItems = items.filter((item) => shown(item.spaceId));
  const visibleEvents = events.filter((event) => shown(event.spaceId));
  const visibleBacklog = backlog.filter((item) => shown(item.spaceId));
  const visibleOverdue = overdue.filter((item) => shown(item.spaceId));

  const days = useMemo(() => {
    if (view === "day") return [anchor];
    if (view === "week") return daysBetween(startOfWeek(anchor), addDays(startOfWeek(anchor), 6));
    return daysBetween(range.from, range.to);
  }, [view, anchor, range.from, range.to]);

  const buckets = useMemo(
    () => bucketByDay(days, todoEntries(visibleItems, range.from, range.to), visibleEvents),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, items, events, hidden, range.from, range.to],
  );

  const everything = [...items, ...backlog, ...overdue];
  const findItem = (id: string) => everything.find((item) => item.id === id) ?? null;

  /* ── 동작 ────────────────────────────────────────────────────────── */

  function go(nextView: CalendarView, day: string): void {
    startNavigation(() => router.push(`/?view=${nextView}&d=${day}`));
  }

  function step(direction: -1 | 1): void {
    if (view === null) return;
    const next =
      view === "day" ? addDays(anchor, direction) : view === "week" ? addDays(anchor, 7 * direction) : addMonths(anchor, direction);
    go(view, next);
  }

  const run = (task: () => Promise<unknown>, after?: () => void) =>
    startBusy(async () => {
      setProblem(null);
      try {
        await task();
        after?.();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });

  /** 할 일을 그 날(·시각)에 놓는다. 시각이 있는데 길이를 안 정했으면 기본 길이로. */
  function schedule(item: AgendaRow, day: string, time: string | null): void {
    run(() =>
      updateChecklistItemAction(item.id, {
        dueOn: day,
        dueTime: time,
        estMin: time === null ? item.estMin : (item.estMin ?? DEFAULT_BLOCK_MIN),
      }),
    );
  }

  function unschedule(item: AgendaRow): void {
    run(() => updateChecklistItemAction(item.id, { dueOn: null }), () => setDialog(null));
  }

  function toggle(item: AgendaRow): void {
    run(() => toggleChecklistItemAction(item.id, !item.done));
  }

  function startPlacing(item: AgendaRow): void {
    setPlacing((current) => (current?.id === item.id ? null : item));
    setSheet(false);
    setDialog(null);
  }

  const canAdd = spaces.some((space) => space.canWrite);

  const handlers: GridHandlers = {
    onSlot: (day, time) => {
      if (placing !== null) {
        const item = placing;
        setPlacing(null);
        schedule(item, day, time);
        return;
      }
      if (canAdd) setDialog({ kind: "new", day, time });
    },
    onDrop: (itemId, day, time) => {
      setDragging(null);
      const item = findItem(itemId);
      if (item !== null) schedule(item, day, time);
    },
    onOpen: (entry: Entry) => {
      if (entry.kind === "event") setDialog({ kind: "event", event: entry.event });
      else setDialog({ kind: "todo", item: entry.item, ghostDay: entry.ghost ? entry.day : null });
    },
    onToggle: (entry: Entry) => {
      if (entry.kind === "todo" && !entry.ghost) toggle(entry.item);
    },
    onDay: (day) => go("day", day),
    onDragItem: setDragging,
    todoColor: (spaceId) => (spaceOf(spaceId)?.kind === "org" ? TODO_COLOR.org : TODO_COLOR.personal),
  };

  function toggleSpace(id: string): void {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {
      // 저장 못 해도 지금 화면에는 반영된다.
    }
  }

  /* ── 머리말 ──────────────────────────────────────────────────────── */

  const title =
    view === "month"
      ? `${anchor.slice(0, 4)}년 ${Number(anchor.slice(5, 7))}월`
      : view === "day"
        ? dayLabel(anchor)
        : (() => {
            const first = startOfWeek(anchor);
            const last = addDays(first, 6);
            const sameMonth = first.slice(0, 7) === last.slice(0, 7);
            return `${Number(first.slice(5, 7))}월 ${Number(first.slice(8, 10))}일 – ${
              sameMonth ? "" : `${Number(last.slice(5, 7))}월 `
            }${Number(last.slice(8, 10))}일`;
          })();

  const draggingItem = dragging === null ? null : findItem(dragging);
  const dialogSpace = dialog?.kind === "todo" ? spaceOf(dialog.item.spaceId) : undefined;

  const backlogPanel = (
    <Backlog
      backlog={visibleBacklog}
      overdue={visibleOverdue}
      spaces={spaces}
      today={today}
      placingId={placing?.id ?? null}
      busy={busy}
      nameOf={nameOf}
      onAdd={async (spaceId, text) => {
        setProblem(null);
        try {
          await quickAddAction(spaceId, { title: text });
          router.refresh();
          return true;
        } catch (error) {
          setProblem(error instanceof Error ? error.message : "적지 못했어요.");
          return false;
        }
      }}
      onPlace={startPlacing}
      onOpen={(item) => setDialog({ kind: "todo", item, ghostDay: null })}
      onToggle={toggle}
      onToday={(item) => schedule(item, today, item.dueTime)}
      onUnschedule={unschedule}
      onDragItem={setDragging}
    />
  );

  return (
    <div style={{ flexGrow: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 12px",
          padding: "10px 14px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <HeaderButton onClick={() => view !== null && go(view, today)}>오늘</HeaderButton>
          <HeaderButton onClick={() => step(-1)} label="앞으로">
            ‹
          </HeaderButton>
          <HeaderButton onClick={() => step(1)} label="뒤로">
            ›
          </HeaderButton>
          <h1 style={{ fontSize: 15.5, fontWeight: 600, marginLeft: 6, whiteSpace: "nowrap", opacity: navigating ? 0.5 : 1 }}>
            {view === null ? "" : title}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          {spaces.length > 1 && (
            <div role="group" aria-label="보일 공간" style={{ display: "flex", gap: 4 }}>
              {spaces.map((space) => {
                const on = shown(space.id);
                const color = space.kind === "org" ? TODO_COLOR.org : TODO_COLOR.personal;
                return (
                  <button
                    key={space.id}
                    onClick={() => toggleSpace(space.id)}
                    aria-pressed={on}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      border: "1px solid var(--line)",
                      background: on ? "var(--card)" : "transparent",
                      color: on ? "var(--ink-2)" : "var(--ink-4)",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        background: on ? color : "transparent",
                        border: `1.5px solid ${color}`,
                      }}
                    />
                    {space.name}
                  </button>
                );
              })}
            </div>
          )}
          <div role="group" aria-label="보기" style={{ display: "flex", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
            {(["day", "week", "month"] as const).map((key) => (
              <button
                key={key}
                onClick={() => go(key, anchor)}
                aria-pressed={view === key}
                style={{
                  height: 28,
                  padding: "0 11px",
                  fontSize: 12.5,
                  background: view === key ? "var(--chip)" : "transparent",
                  color: view === key ? "var(--ink)" : "var(--ink-3)",
                  fontWeight: view === key ? 500 : 400,
                }}
              >
                {VIEW_LABEL[key]}
              </button>
            ))}
          </div>
          {narrow === true && (
            <button
              onClick={() => setSheet(true)}
              style={{
                height: 28,
                padding: "0 11px",
                fontSize: 12.5,
                borderRadius: "var(--radius)",
                background: "var(--ink)",
                color: "var(--paper)",
              }}
            >
              백로그 {visibleBacklog.length + visibleOverdue.length}
            </button>
          )}
          {/* 폰에서는 머리말이 세 줄이 되므로 백로그 아래로 보낸다. */}
          {narrow === false && (
            <Link href="/calendars" style={{ border: 0, fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              캘린더 연결
            </Link>
          )}
        </div>
      </div>

      {feedCount === 0 && (
        <Notice>
          가족 캘린더(구글·애플)를 연결하면 그 일정이 여기 같이 보여요.{" "}
          <Link href="/calendars">캘린더 연결하기</Link>
        </Notice>
      )}
      {feedProblems > 0 && (
        <Notice tone="late">
          캘린더 {feedProblems}개를 가져오지 못했어요. <Link href="/calendars">까닭 보기</Link>
        </Notice>
      )}
      {placing !== null && (
        <Notice tone="accent">
          <strong style={{ fontWeight: 600 }}>「{placing.title}」</strong> 을 놓을 칸을 누르세요.{" "}
          <button onClick={() => setPlacing(null)} style={{ color: "var(--accent)", textDecoration: "underline" }}>
            그만두기
          </button>
        </Notice>
      )}
      {problem !== null && (
        <Notice tone="late">
          <span role="alert">{problem}</span>
        </Notice>
      )}

      <div style={{ flexGrow: 1, minHeight: 0, display: "flex" }}>
        <main
          aria-label="캘린더"
          aria-busy={busy || navigating}
          style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", opacity: navigating ? 0.6 : 1 }}
        >
          {view === null ? null : view === "month" ? (
            <MonthGrid
              days={days}
              month={anchor.slice(0, 7)}
              today={today}
              buckets={buckets}
              handlers={handlers}
              placing={placing !== null}
              compact={narrow === true}
            />
          ) : (
            <TimeGrid
              days={days}
              today={today}
              nowTime={nowTime}
              buckets={buckets}
              handlers={handlers}
              placing={placing !== null}
              draggingMin={draggingItem === null ? null : (draggingItem.estMin ?? DEFAULT_BLOCK_MIN)}
            />
          )}
        </main>
        {narrow === false && (
          <aside
            aria-label="백로그"
            style={{ width: 300, flexShrink: 0, borderLeft: "1px solid var(--line)", overflowY: "auto", background: "var(--surface)" }}
          >
            {backlogPanel}
          </aside>
        )}
      </div>

      {narrow === true && sheet && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) setSheet(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(47,46,43,0.28)", display: "flex", alignItems: "flex-end" }}
        >
          <aside
            aria-label="백로그"
            style={{
              width: "100%",
              maxHeight: "75dvh",
              overflowY: "auto",
              background: "var(--paper)",
              borderRadius: "12px 12px 0 0",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {backlogPanel}
            <Link
              href="/calendars"
              style={{ display: "block", border: 0, fontSize: 13, color: "var(--ink-3)", padding: "0 14px 20px" }}
            >
              캘린더 연결 ›
            </Link>
          </aside>
        </div>
      )}

      {dialog?.kind === "todo" && (
        <TodoDialog
          key={dialog.item.id}
          item={dialog.item}
          ghostDay={dialog.ghostDay}
          canWrite={dialogSpace?.canWrite ?? false}
          narrow={narrow === true}
          busy={busy}
          spaceName={spaceName(dialog.item.spaceId)}
          nameOf={nameOf}
          onClose={() => setDialog(null)}
          onSave={(patch: TodoPatch) =>
            run(
              () =>
                updateChecklistItemAction(dialog.item.id, {
                  title: patch.title,
                  dueOn: patch.dueOn,
                  dueTime: patch.dueTime,
                  estMin: patch.estMin,
                  repeat: patch.repeat,
                }),
              () => setDialog(null),
            )
          }
          onToggle={() => run(() => toggleChecklistItemAction(dialog.item.id, !dialog.item.done), () => setDialog(null))}
          onUnschedule={() => unschedule(dialog.item)}
          onMove={() => startPlacing(dialog.item)}
          onRemove={() => run(() => removeChecklistItemAction(dialog.item.id), () => setDialog(null))}
        />
      )}
      {dialog?.kind === "event" && (
        <EventDialog
          event={dialog.event}
          narrow={narrow === true}
          spaceName={spaceOf(dialog.event.spaceId)?.kind === "personal" ? "나만 봄" : (spaceOf(dialog.event.spaceId)?.name ?? "")}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "new" && (
        <NewTodoDialog
          day={dialog.day}
          time={dialog.time}
          spaces={spaces}
          narrow={narrow === true}
          busy={busy}
          onClose={() => setDialog(null)}
          onCreate={(spaceId, patch) =>
            run(
              () =>
                quickAddAction(spaceId, {
                  title: patch.title,
                  dueOn: patch.dueOn,
                  dueTime: patch.dueTime,
                  estMin: patch.estMin,
                  repeat: patch.repeat,
                }),
              () => setDialog(null),
            )
          }
        />
      )}
    </div>
  );
}

function HeaderButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        minWidth: 30,
        height: 30,
        padding: "0 10px",
        fontSize: label === undefined ? 12.5 : 16,
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}

function Notice({ tone = "plain", children }: { tone?: "plain" | "late" | "accent"; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "7px 14px",
        fontSize: 12.5,
        lineHeight: 1.6,
        borderBottom: "1px solid var(--line-soft)",
        color: tone === "late" ? "var(--late)" : tone === "accent" ? "var(--accent)" : "var(--ink-3)",
        background: tone === "accent" ? "var(--accent-soft)" : "transparent",
      }}
    >
      {children}
    </div>
  );
}
