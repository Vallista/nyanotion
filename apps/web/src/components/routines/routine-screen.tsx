"use client";

import {
  ROUTINE_SLOT_KEYS,
  ROUTINE_SLOT_LABEL,
  addDays,
  describeSchedule,
  formatClock,
  formatSecs,
  indexRoutineLogs,
  isActiveOn,
  isScheduledOn,
  perfectStreak,
  routineDayLabel,
  routineDayStat,
  routineElapsed,
  routineLogKey,
  routineStreak,
  slotOf,
  sortRoutines,
  type RoutineItem,
  type RoutineLogItem,
  type RoutineTimerItem,
} from "@nyanotion/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  routineCheckAction,
  routineMinutesAction,
  routineTimerStartAction,
  routineTimerStopAction,
  type RoutineActionResult,
} from "@/lib/routine-actions";
import { SmallButton, inputStyle } from "../checklist-item";
import { Dialog } from "../calendar-dialogs";
import { ChevronDown, ChevronRight, PlayIcon, StopIcon } from "../icons";
import { RoutineEditor, RoutineManager, type EditorTarget } from "./routine-dialogs";
import { RoutineRecords, RoutineSummary } from "./routine-stats";
import { PageTitle, SingleView, SplitView } from "../mac-ui";
import { Meter, TemplateChips, linkButton, routineColorVar, useNarrow, type RoutineTemplateChoice } from "./routine-ui";

/**
 * 루틴 화면 — 날짜별 체크 · 타이머 · 기록.
 *
 * 서버가 원본이다. 누르면 화면을 먼저 바꾸고(낙관적) 서버 동작을 부른 뒤, 서버가 다시 그린 값으로 맞춘다.
 * 실패하면 되돌리고 위에 한 줄로 알린다. 규칙(미래 날짜 막기 · 목표 채우면 완료 · 타이머 하나)은
 * 서버 동작이 `@nyanotion/shared` 로 다시 확인한다 — 화면의 계산은 보여 주기용이다.
 */
export function RoutineScreen({
  routines,
  logs,
  timer,
  today,
  serverNow,
}: {
  routines: RoutineItem[];
  logs: RoutineLogItem[];
  timer: RoutineTimerItem | null;
  today: string;
  /** 서버가 그린 시각 — 첫 그리기에서 타이머 숫자가 서버와 같아야 hydration 이 어긋나지 않는다. */
  serverNow: string;
}) {
  const narrow = useNarrow();
  const [selected, setSelected] = useState(today);
  /** 기록·요약에서 한 루틴만 볼 때 (전체면 null). */
  const [filter, setFilter] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, RoutineLogItem | null>>(new Map());
  const [timerOverride, setTimerOverride] = useState<{ value: RoutineTimerItem | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "warn" } | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [managing, setManaging] = useState(false);
  const [minutesFor, setMinutesFor] = useState<RoutineItem | null>(null);
  const [now, setNow] = useState(() => new Date(serverNow));

  // 서버가 새 값을 주면 낙관적으로 바꿔 둔 것을 걷는다.
  useEffect(() => {
    setOverrides(new Map());
    setTimerOverride(null);
  }, [logs, timer]);

  // 자정을 넘기면 '오늘'을 보던 화면은 새 오늘로.
  useEffect(() => {
    setSelected((s) => (s > today ? today : s));
  }, [today]);

  const liveTimer = timerOverride !== null ? timerOverride.value : timer;
  useEffect(() => {
    if (liveTimer === null) return;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [liveTimer]);

  useEffect(() => {
    if (notice === null) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const allLogs = useMemo(() => {
    if (overrides.size === 0) return logs;
    const map = new Map(logs.map((l) => [routineLogKey(l.routineId, l.date), l]));
    for (const [key, value] of overrides) {
      if (value === null) map.delete(key);
      else map.set(key, value);
    }
    return [...map.values()];
  }, [logs, overrides]);
  const idx = useMemo(() => indexRoutineLogs(allLogs), [allLogs]);
  const sorted = useMemo(() => sortRoutines(routines), [routines]);
  const byId = useMemo(() => new Map(routines.map((r) => [r.id, r])), [routines]);

  const run = useCallback(
    async (key: string, optimistic: () => void, call: () => Promise<RoutineActionResult>, rollback: () => void) => {
      setBusy(key);
      optimistic();
      try {
        const result = await call();
        if (!result.ok) {
          rollback();
          setNotice({ text: result.message ?? "저장하지 못했어요.", tone: "warn" });
          return result;
        }
        return result;
      } catch {
        rollback();
        setNotice({ text: "서버에 닿지 못했어요. 연결을 확인해 주세요.", tone: "warn" });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const announce = (result: RoutineActionResult | null) => {
    const c = result?.committed;
    if (c?.capped) setNotice({ text: `‘${c.title}’ 타이머가 너무 오래 켜져 있어 12시간까지만 기록했어요.`, tone: "warn" });
    else if (c?.reachedGoal || result?.reachedGoal)
      setNotice({ text: `목표 시간을 채워 ${c ? `‘${c.title}’을 ` : ""}완료로 표시했어요.`, tone: "info" });
  };

  const toggle = (r: RoutineItem, day: string) => {
    const key = routineLogKey(r.id, day);
    const current = idx.get(key);
    const done = current?.done !== true;
    const at = new Date().toISOString();
    const next: RoutineLogItem | null =
      done || (current?.secs ?? 0) > 0
        ? { ...(current ?? { routineId: r.id, date: day, secs: 0, sessions: [], doneAt: null, updatedAt: at }), done, doneAt: done ? at : null, updatedAt: at }
        : null;
    void run(
      key,
      () => setOverrides((m) => new Map(m).set(key, next)),
      () => routineCheckAction(r.id, day, done),
      () =>
        setOverrides((m) => {
          const copy = new Map(m);
          copy.delete(key);
          return copy;
        }),
    ).then((result) => {
      if (result?.ok && done && day === today) celebrate(r.id);
    });
  };

  const celebrate = (justDone: string) => {
    const scheduledToday = routines.filter((r) => isScheduledOn(r, today));
    const left = scheduledToday.filter((r) => r.id !== justDone && idx.get(routineLogKey(r.id, today))?.done !== true);
    if (scheduledToday.length > 0 && left.length === 0) {
      const streak = perfectStreak(routines, idx, today).current + 1;
      setNotice({ text: streak > 1 ? `오늘 루틴을 모두 끝냈어요 — ${streak}일 연속` : "오늘 루틴을 모두 끝냈어요", tone: "info" });
    }
  };

  const toggleTimer = (r: RoutineItem) => {
    if (liveTimer?.routineId === r.id) {
      void run(
        "timer",
        () => setTimerOverride({ value: null }),
        () => routineTimerStopAction(),
        () => setTimerOverride(null),
      ).then(announce);
      return;
    }
    void run(
      "timer",
      () => setTimerOverride({ value: { routineId: r.id, date: today, startedAt: new Date().toISOString() } }),
      () => routineTimerStartAction(r.id),
      () => setTimerOverride(null),
    ).then(announce);
  };

  const stopTimer = () => {
    void run(
      "timer",
      () => setTimerOverride({ value: null }),
      () => routineTimerStopAction(),
      () => setTimerOverride(null),
    ).then(announce);
  };

  const saveMinutes = async (r: RoutineItem, minutes: number) => {
    const result = await routineMinutesAction(r.id, selected, minutes);
    if (!result.ok) {
      setNotice({ text: result.message ?? "저장하지 못했어요.", tone: "warn" });
      return false;
    }
    announce(result);
    return true;
  };

  const todayStat = routineDayStat(routines, idx, today, today);
  const perfect = perfectStreak(routines, idx, today);
  const timerRoutine = liveTimer ? byId.get(liveTimer.routineId) : undefined;

  const sub =
    routines.length === 0
      ? "매일 지키고 싶은 것을 체크하고, 쌓인 기록을 돌아봐요."
      : todayStat.scheduled > 0
        ? `오늘 ${todayStat.done}/${todayStat.scheduled} 완료${perfect.current > 0 ? ` · 모두 끝낸 날 ${perfect.current}일 연속` : ""}`
        : "오늘은 예정된 루틴이 없어요.";

  const pickDay = (day: string) => {
    setSelected(day);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const main = (
    <>
      <PageTitle
        title="루틴"
        sub={sub}
        action={
          routines.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <SmallButton onClick={() => setManaging(true)}>루틴 관리</SmallButton>
              <SmallButton primary onClick={() => setEditor({ kind: "new" })}>
                + 루틴
              </SmallButton>
            </div>
          )
        }
      />

      {notice && (
        <div
          role="status"
          style={{
            padding: "9px 12px",
            borderRadius: "var(--radius-lg)",
            fontSize: 13,
            background: notice.tone === "warn" ? "var(--late-soft)" : "var(--accent-soft)",
            color: notice.tone === "warn" ? "var(--late)" : "var(--accent-hover)",
          }}
        >
          {notice.text}
        </div>
      )}

      {liveTimer && timerRoutine && (
        <TimerBar
          routine={timerRoutine}
          timer={liveTimer}
          baseSecs={idx.get(routineLogKey(liveTimer.routineId, liveTimer.date))?.secs ?? 0}
          now={now}
          today={today}
          busy={busy === "timer"}
          onStop={stopTimer}
        />
      )}

      {routines.length === 0 ? (
        <EmptyStart onPick={(template) => setEditor({ kind: "new", template })} />
      ) : (
        <>
          <DayCard
            routines={sorted}
            idx={idx}
            day={selected}
            today={today}
            timer={liveTimer}
            now={now}
            busy={busy}
            narrow={narrow === true}
            onDay={setSelected}
            onToggle={toggle}
            onTimer={toggleTimer}
            onMinutes={setMinutesFor}
            onEdit={(r) => setEditor({ kind: "edit", routine: r })}
          />
          <RoutineRecords routines={sorted} idx={idx} today={today} narrow={narrow === true} filter={filter} onFilter={setFilter} onPickDay={pickDay} />
        </>
      )}
    </>
  );

  return (
    <>
      {routines.length === 0 ? (
        <SingleView>{main}</SingleView>
      ) : (
        <SplitView
          main={main}
          inspectorLabel="루틴 요약"
          inspector={<RoutineSummary routines={sorted} idx={idx} today={today} filter={filter} onFilter={setFilter} />}
        />
      )}

      {editor && (
        <RoutineEditor
          target={editor}
          routines={routines}
          today={today}
          narrow={narrow === true}
          onClose={() => setEditor(null)}
          onNotice={(text) => setNotice({ text, tone: "warn" })}
        />
      )}
      {managing && (
        <RoutineManager
          routines={sorted}
          narrow={narrow === true}
          onClose={() => setManaging(false)}
          onEdit={(r) => {
            setManaging(false);
            setEditor({ kind: "edit", routine: r });
          }}
          onNotice={(text) => setNotice({ text, tone: "warn" })}
        />
      )}
      {minutesFor && (
        <MinutesDialog
          routine={minutesFor}
          day={selected}
          current={idx.get(routineLogKey(minutesFor.id, selected))?.secs ?? 0}
          narrow={narrow === true}
          onClose={() => setMinutesFor(null)}
          onSave={async (minutes) => {
            if (await saveMinutes(minutesFor, minutes)) setMinutesFor(null);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ 날짜 카드 */

function DayCard({
  routines,
  idx,
  day,
  today,
  timer,
  now,
  busy,
  narrow,
  onDay,
  onToggle,
  onTimer,
  onMinutes,
  onEdit,
}: {
  routines: RoutineItem[];
  idx: ReturnType<typeof indexRoutineLogs>;
  day: string;
  today: string;
  timer: RoutineTimerItem | null;
  now: Date;
  busy: string | null;
  narrow: boolean;
  onDay: (day: string) => void;
  onToggle: (r: RoutineItem, day: string) => void;
  onTimer: (r: RoutineItem) => void;
  onMinutes: (r: RoutineItem) => void;
  onEdit: (r: RoutineItem) => void;
}) {
  const [showOff, setShowOff] = useState(false);
  const active = routines.filter((r) => isActiveOn(r, day));
  const scheduled = active.filter((r) => isScheduledOn(r, day));
  const off = active.filter((r) => !isScheduledOn(r, day));
  const stat = routineDayStat(routines, idx, day, today);
  const earliest = routines.reduce((m, r) => (r.startDate < m ? r.startDate : m), today);
  const isToday = day === today;

  const row = (r: RoutineItem) => (
    <RoutineRow
      key={r.id}
      routine={r}
      log={idx.get(routineLogKey(r.id, day))}
      streak={routineStreak(r, idx, today).current}
      day={day}
      today={today}
      running={timer?.routineId === r.id && timer.date === day}
      timer={timer}
      now={now}
      busy={busy === routineLogKey(r.id, day)}
      timerBusy={busy === "timer"}
      narrow={narrow}
      onToggle={() => onToggle(r, day)}
      onTimer={() => onTimer(r)}
      onMinutes={() => onMinutes(r)}
      onEdit={() => onEdit(r)}
    />
  );

  return (
    <section aria-label="날짜별 체크" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
        <NavButton label="전날" disabled={day <= earliest} onClick={() => onDay(addDays(day, -1))}>
          <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
            <ChevronRight size={12} />
          </span>
        </NavButton>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{isToday ? "오늘" : routineDayLabel(day)}</span>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            {isToday ? routineDayLabel(day) : "지난 날 기록 고치기"}
          </span>
        </div>
        <NavButton label="다음날" disabled={day >= today} onClick={() => onDay(addDays(day, 1))}>
          <ChevronRight size={12} />
        </NavButton>
        {!isToday && (
          <button onClick={() => onDay(today)} style={linkButton}>
            오늘로
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>
          {stat.scheduled > 0 ? `${stat.done}/${stat.scheduled}` : "예정 없음"}
        </span>
        {stat.scheduled > 0 && <Meter value={stat.done / stat.scheduled} width={narrow ? 48 : 72} tone="done" />}
      </div>

      {scheduled.length === 0 && (
        <p style={{ margin: 0, padding: "14px 0", fontSize: 13, color: "var(--ink-3)" }}>
          {day < earliest ? "이 날은 루틴을 시작하기 전이에요." : "이 날 예정된 루틴이 없어요."}
        </p>
      )}
      {ROUTINE_SLOT_KEYS.map((slot) => {
        const items = scheduled.filter((r) => slotOf(r) === slot);
        if (items.length === 0) return null;
        return (
          <div key={slot}>
            <div style={{ padding: "14px 0 2px", fontSize: 11, fontWeight: 600, color: "var(--ink-4)" }}>
              {ROUTINE_SLOT_LABEL[slot]}
            </div>
            {items.map(row)}
          </div>
        );
      })}
      {off.length > 0 && (
        <div>
          <button
            onClick={() => setShowOff((v) => !v)}
            aria-expanded={showOff}
            style={{ ...linkButton, display: "flex", alignItems: "center", gap: 6, padding: "10px 0", width: "100%", color: "var(--ink-3)", fontSize: 13 }}
          >
            {showOff ? <ChevronDown size={11} /> : <ChevronRight size={11} />}이 날 쉬는 루틴 · {off.length}
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-4)" }}>해도 연속 기록에는 안 들어가요</span>
          </button>
          {showOff && <div style={{ opacity: 0.8, paddingBottom: 6 }}>{off.map(row)}</div>}
        </div>
      )}
    </section>
  );
}

function RoutineRow({
  routine,
  log,
  streak,
  day,
  today,
  running,
  timer,
  now,
  busy,
  timerBusy,
  narrow,
  onToggle,
  onTimer,
  onMinutes,
  onEdit,
}: {
  routine: RoutineItem;
  log: RoutineLogItem | undefined;
  streak: number;
  day: string;
  today: string;
  running: boolean;
  timer: RoutineTimerItem | null;
  now: Date;
  busy: boolean;
  timerBusy: boolean;
  narrow: boolean;
  onToggle: () => void;
  onTimer: () => void;
  onMinutes: () => void;
  onEdit: () => void;
}) {
  const done = log?.done === true;
  const color = routineColorVar(routine);
  const secs = (log?.secs ?? 0) + (running ? routineElapsed(timer, now) : 0);
  const goal = (routine.goalMin ?? 0) * 60;
  const canTime = day === today && routine.archivedAt === null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", minHeight: 46, borderBottom: "1px solid var(--line-soft)" }}>
      <button
        onClick={onToggle}
        disabled={busy}
        aria-pressed={done}
        aria-label={done ? `${routine.title} 완료 취소` : `${routine.title} 완료`}
        style={{
          width: 22,
          height: 22,
          flexShrink: 0,
          borderRadius: "50%",
          border: done ? 0 : `1.5px solid ${color}`,
          background: done ? color : "transparent",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {done && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="m2.6 6.2 2.2 2.2 4.6-4.9" fill="none" stroke="var(--on-accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button onClick={onEdit} title="루틴 고치기" style={{ ...linkButton, flexGrow: 1, minWidth: 0, textAlign: "left", display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontSize: 13.5,
            color: done ? "var(--ink-3)" : "var(--ink)",
            textDecorationLine: done ? "line-through" : "none",
            textDecorationColor: "var(--ink-5)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {routine.title}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 6 }}>
          <span>{describeSchedule(routine.schedule)}{routine.goalMin ? ` · 목표 ${routine.goalMin}분` : ""}</span>
          {streak > 0 && <span>· {streak}일 연속</span>}
        </span>
      </button>
      {(goal > 0 || secs > 0 || running) && (
        <button onClick={onMinutes} title="시간 직접 고치기" style={{ ...linkButton, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: running ? "var(--ink)" : "var(--ink-2)" }}>
            {running ? formatClock(secs) : formatSecs(secs)}
            {goal > 0 && <span style={{ color: "var(--ink-4)" }}> / {routine.goalMin}분</span>}
          </span>
          {goal > 0 && <Meter value={Math.min(1, secs / goal)} width={narrow ? 56 : 72} tone={secs >= goal ? "done" : "time"} />}
        </button>
      )}
      {canTime && (
        <button
          onClick={onTimer}
          disabled={timerBusy}
          aria-label={running ? "타이머 멈추기" : "타이머 시작"}
          title={running ? "타이머 멈추기" : "타이머 시작"}
          style={{
            width: 26,
            height: 26,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            border: `1px solid ${running ? "var(--accent)" : "var(--line-strong)"}`,
            background: running ? "var(--accent)" : "var(--card)",
            color: running ? "var(--on-accent)" : "var(--ink-3)",
            cursor: "pointer",
          }}
        >
          {running ? <StopIcon size={10} /> : <PlayIcon size={10} />}
        </button>
      )}
    </div>
  );
}

function TimerBar({
  routine,
  timer,
  baseSecs,
  now,
  today,
  busy,
  onStop,
}: {
  routine: RoutineItem;
  timer: RoutineTimerItem;
  baseSecs: number;
  now: Date;
  today: string;
  busy: boolean;
  onStop: () => void;
}) {
  const elapsed = routineElapsed(timer, now);
  return (
    <div
      role="timer"
      aria-label={`${routine.title} 타이머`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-lg)",
        background: "var(--accent-soft)",
        color: "var(--ink)",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: routineColorVar(routine), flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{routine.title}</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
          {timer.date === today ? "기록 중" : `${routineDayLabel(timer.date)}에 기록 중`} · 그날 합계 {formatSecs(baseSecs + elapsed)}
        </span>
      </div>
      <span style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", color: "var(--accent)" }}>{formatClock(elapsed)}</span>
      <button
        onClick={onStop}
        disabled={busy}
        style={{ height: 28, padding: "0 12px", borderRadius: "var(--radius)", border: 0, background: "var(--accent)", color: "var(--on-accent)", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
      >
        멈추기
      </button>
    </div>
  );
}

function MinutesDialog({
  routine,
  day,
  current,
  narrow,
  onClose,
  onSave,
}: {
  routine: RoutineItem;
  day: string;
  current: number;
  narrow: boolean;
  onClose: () => void;
  onSave: (minutes: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(Math.round(current / 60)));
  const [saving, setSaving] = useState(false);
  const minutes = Number.parseInt(value, 10);
  const valid = Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440;
  return (
    <Dialog label="기록 시간" onClose={onClose} narrow={narrow}>
      <strong style={{ fontSize: 15 }}>{routine.title}</strong>
      <span style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: -6 }}>{routineDayLabel(day)}에 쓴 시간</span>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input
          autoFocus
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && valid) {
              setSaving(true);
              void onSave(minutes).finally(() => setSaving(false));
            }
          }}
          style={{ ...inputStyle, width: 96 }}
        />
        분
      </label>
      {routine.goalMin ? (
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>목표 {routine.goalMin}분 — 채우면 완료로 표시돼요.</span>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <SmallButton onClick={onClose}>취소</SmallButton>
        <SmallButton
          primary
          disabled={!valid || saving}
          busy={saving}
          onClick={() => {
            setSaving(true);
            void onSave(minutes).finally(() => setSaving(false));
          }}
        >
          저장
        </SmallButton>
      </div>
    </Dialog>
  );
}

function EmptyStart({ onPick }: { onPick: (template: RoutineTemplateChoice | undefined) => void }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8, borderTop: "1px solid var(--line)" }}>
      <div>
        <strong style={{ fontSize: 16 }}>첫 루틴을 만들어 볼까요</strong>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
          매일 체크하면 연속 기록과 요일별 패턴, 쓴 시간을 정리해 보여 드려요. 목표 시간을 정하면 타이머로 채울 때
          자동으로 완료돼요. 맥 Bento·아이폰 앱과 같은 루틴을 써요.
        </p>
      </div>
      <TemplateChips onPick={onPick} />
      <div>
        <SmallButton primary onClick={() => onPick(undefined)}>
          직접 만들기
        </SmallButton>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 작은 것들 */

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: 28,
        height: 28,
        display: "grid",
        placeItems: "center",
        borderRadius: "var(--radius)",
        border: 0,
        background: "transparent",
        color: "var(--ink-2)",
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
