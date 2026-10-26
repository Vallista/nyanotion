"use client";

import type { AgendaRow } from "@nyanotion/db";
import {
  BLOCK_MINUTES,
  DEFAULT_BLOCK_MIN,
  REPEAT_LABEL,
  minutesOf,
  timeOf,
  type ChecklistRepeat,
} from "@nyanotion/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dayLabel, durationLabel, eventColor, type CalEvent, type CalSpace } from "./calendar-model";
import { SmallButton, inputStyle } from "./checklist-item";
import { CheckBoxIcon } from "./icons";

/**
 * 캘린더의 작은 창들 — 할 일 고치기 · 구독한 일정 보기 · 빈 칸에 새 할 일. 여기서 적는 일정은 `calendar-plan-dialog.tsx`.
 * 폰에서는 아래에서 올라오고, 넓은 화면에서는 가운데 뜬다. Esc · 바깥을 누르면 닫힌다.
 */

export function Dialog({
  label,
  onClose,
  narrow,
  children,
}: {
  label: string;
  onClose: () => void;
  narrow: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(47,46,43,0.28)",
        display: "flex",
        alignItems: narrow ? "flex-end" : "center",
        justifyContent: "center",
        padding: narrow ? 0 : 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{
          width: "100%",
          maxWidth: narrow ? "none" : 400,
          maxHeight: narrow ? "85dvh" : "80dvh",
          overflowY: "auto",
          background: "var(--paper)",
          borderRadius: narrow ? "12px 12px 0 0" : 8,
          boxShadow: "var(--shadow-float)",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-3)" };

/** 날짜 · 시각 · 길이 · 반복. 고치기와 새로 적기가 같이 쓴다. */
function WhenFields({
  day,
  time,
  minutes,
  repeat,
  onDay,
  onTime,
  onMinutes,
  onRepeat,
  allowNoDay,
}: {
  day: string;
  time: string;
  minutes: number | null;
  repeat: ChecklistRepeat;
  onDay: (value: string) => void;
  onTime: (value: string) => void;
  onMinutes: (value: number | null) => void;
  onRepeat: (value: ChecklistRepeat) => void;
  allowNoDay: boolean;
}) {
  const noDay = day === "";
  const choices = minutes === null || (BLOCK_MINUTES as readonly number[]).includes(minutes)
    ? [...BLOCK_MINUTES]
    : [...BLOCK_MINUTES, minutes].sort((a, b) => a - b);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      <label style={labelStyle}>
        날짜
        <input
          type="date"
          value={day}
          required={!allowNoDay}
          onChange={(event) => onDay(event.target.value)}
          style={{ ...inputStyle, width: "100%" }}
        />
      </label>
      <label style={labelStyle}>
        시각
        <input
          type="time"
          value={time}
          step={300}
          disabled={noDay}
          onChange={(event) => onTime(event.target.value)}
          style={{ ...inputStyle, width: "100%", opacity: noDay ? 0.5 : 1 }}
        />
      </label>
      <label style={labelStyle}>
        걸리는 시간
        <select
          value={minutes === null ? "" : String(minutes)}
          onChange={(event) => onMinutes(event.target.value === "" ? null : Number(event.target.value))}
          style={{ ...inputStyle, width: "100%" }}
        >
          <option value="">안 정함</option>
          {choices.map((value) => (
            <option key={value} value={value}>
              {durationLabel(value)}
            </option>
          ))}
        </select>
      </label>
      <label style={labelStyle}>
        반복
        <select
          value={noDay ? "none" : repeat}
          disabled={noDay}
          onChange={(event) => onRepeat(event.target.value as ChecklistRepeat)}
          style={{ ...inputStyle, width: "100%", opacity: noDay ? 0.5 : 1 }}
        >
          {(Object.keys(REPEAT_LABEL) as ChecklistRepeat[]).map((key) => (
            <option key={key} value={key}>
              {REPEAT_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export type TodoPatch = {
  title: string;
  dueOn: string | null;
  dueTime: string | null;
  estMin: number | null;
  repeat: ChecklistRepeat;
};

/** 할 일 하나 — 캘린더 칸이나 백로그에서 눌렀을 때. */
export function TodoDialog({
  item,
  ghostDay,
  canWrite,
  narrow,
  busy,
  spaceName,
  nameOf,
  onClose,
  onSave,
  onToggle,
  onUnschedule,
  onMove,
  onRemove,
}: {
  item: AgendaRow;
  /** 반복의 앞날을 눌렀으면 그 날. */
  ghostDay: string | null;
  canWrite: boolean;
  narrow: boolean;
  busy: boolean;
  spaceName: string;
  nameOf: (id: string) => string;
  onClose: () => void;
  onSave: (patch: TodoPatch) => void;
  onToggle: () => void;
  onUnschedule: () => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [day, setDay] = useState(item.dueOn ?? "");
  const [time, setTime] = useState(item.dueTime ?? "");
  const [minutes, setMinutes] = useState<number | null>(item.estMin);
  const [repeat, setRepeat] = useState<ChecklistRepeat>(item.repeat);

  const changed =
    title.trim() !== item.title ||
    day !== (item.dueOn ?? "") ||
    time !== (item.dueTime ?? "") ||
    minutes !== item.estMin ||
    (day !== "" && repeat !== item.repeat);

  return (
    <Dialog label="할 일" onClose={onClose} narrow={narrow}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <button
          onClick={onToggle}
          disabled={!canWrite || busy || ghostDay !== null}
          aria-label={item.done ? "안 한 것으로" : "했음"}
          title={ghostDay !== null ? "이 날은 아직 오지 않은 반복이에요" : undefined}
          style={{ display: "flex", padding: 4, margin: -4, marginTop: 2, color: item.done ? "var(--accent)" : "var(--ink-4)" }}
        >
          <CheckBoxIcon size={18} checked={item.done} />
        </button>
        {canWrite ? (
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="할 일"
            style={{ ...inputStyle, flexGrow: 1, minWidth: 0, fontWeight: 500 }}
          />
        ) : (
          <h2 style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{item.title}</h2>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
        {spaceName} ·{" "}
        <Link href={`/lists/${item.checklistId}`}>{item.checklistTitle.trim() || "제목 없음"}</Link>
        {item.assigneeId !== null && ` · @${nameOf(item.assigneeId)}`}
        {item.done && item.doneBy !== null && ` · ${nameOf(item.doneBy)} 님이 함`}
      </p>

      {ghostDay !== null && (
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, background: "var(--surface)", padding: "8px 10px", borderRadius: "var(--radius)" }}>
          ↻ {dayLabel(ghostDay)}은 <strong style={{ fontWeight: 500 }}>{REPEAT_LABEL[item.repeat]}</strong> 반복으로
          올 날이에요. 지금 할 차례는 {item.dueOn === null ? "" : dayLabel(item.dueOn)} — 그걸 체크하면 다음 날이
          새로 생깁니다. 아래에서 고치면 반복 전체가 바뀝니다.
        </p>
      )}

      {canWrite && (
        <>
          <WhenFields
            day={day}
            time={time}
            minutes={minutes}
            repeat={repeat}
            onDay={setDay}
            onTime={setTime}
            onMinutes={setMinutes}
            onRepeat={setRepeat}
            allowNoDay
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <SmallButton
              primary
              disabled={busy || !changed || title.trim() === ""}
              onClick={() =>
                onSave({
                  title,
                  dueOn: day === "" ? null : day,
                  dueTime: day === "" || time === "" ? null : time,
                  estMin: minutes,
                  repeat: day === "" ? "none" : repeat,
                })
              }
            >
              저장
            </SmallButton>
            {!item.done && <SmallButton disabled={busy} onClick={onMove}>다른 칸으로 옮기기</SmallButton>}
            {item.dueOn !== null && <SmallButton disabled={busy} onClick={onUnschedule}>백로그로</SmallButton>}
            <SmallButton
              disabled={busy}
              onClick={() => {
                if (window.confirm(`"${item.title}" 을 지울까요?`)) onRemove();
              }}
            >
              지우기
            </SmallButton>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** 구독한 캘린더의 일정 — 읽기만. 고치려면 그 캘린더(구글·애플)에서. */
export function EventDialog({
  event,
  narrow,
  spaceName,
  onClose,
}: {
  event: CalEvent;
  narrow: boolean;
  spaceName: string;
  onClose: () => void;
}) {
  const sameDay = event.startsOn === event.endsOn;
  const when =
    event.startTime === null
      ? sameDay
        ? `${dayLabel(event.startsOn)} 종일`
        : `${dayLabel(event.startsOn)} – ${dayLabel(event.endsOn)}`
      : sameDay
        ? `${dayLabel(event.startsOn)} ${event.startTime}${event.endTime !== null && event.endTime !== event.startTime ? `–${event.endTime}` : ""}`
        : `${dayLabel(event.startsOn)} ${event.startTime} – ${dayLabel(event.endsOn)} ${event.endTime ?? ""}`;
  return (
    <Dialog label="일정" onClose={onClose} narrow={narrow}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: eventColor(event), flexShrink: 0 }} />
        <h2 style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.45 }}>{event.title}</h2>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-2)" }}>{when}</p>
      {event.location !== null && <p style={{ fontSize: 13, color: "var(--ink-2)" }}>📍 {event.location}</p>}
      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
        {event.calendarName} · {spaceName}
        <br />
        구독한 캘린더의 일정이라 여기서는 고치지 않아요. 원래 캘린더에서 고치면 곧 따라옵니다.
      </p>
    </Dialog>
  );
}

/** 빈 칸을 눌렀다 — 그 날·시각에 새 할 일. */
export function NewTodoDialog({
  day: initialDay,
  time: initialTime,
  spaces,
  narrow,
  busy,
  switcher,
  onClose,
  onCreate,
}: {
  day: string;
  time: string | null;
  spaces: CalSpace[];
  narrow: boolean;
  busy: boolean;
  /** 맨 위의 [할 일 | 일정] 전환. */
  switcher?: React.ReactNode;
  onClose: () => void;
  onCreate: (spaceId: string, patch: TodoPatch) => void;
}) {
  const writable = spaces.filter((space) => space.canWrite);
  const [spaceId, setSpaceId] = useState(writable[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime ?? "");
  const [minutes, setMinutes] = useState<number | null>(initialTime === null ? null : DEFAULT_BLOCK_MIN);
  const [repeat, setRepeat] = useState<ChecklistRepeat>("none");

  const submit = () => {
    if (title.trim() === "" || spaceId === "" || day === "") return;
    onCreate(spaceId, {
      title,
      dueOn: day,
      dueTime: time === "" ? null : time,
      estMin: minutes,
      repeat,
    });
  };

  const end = time !== "" && minutes !== null ? timeOf(minutesOf(time) + minutes) : null;

  return (
    <Dialog label="새 할 일" onClose={onClose} narrow={narrow}>
      {switcher}
      <h2 style={{ fontSize: 14, fontWeight: 600 }}>
        {dayLabel(day || initialDay)}
        {time !== "" && ` ${time}${end !== null ? `–${end}` : ""}`}
      </h2>
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
        }}
        placeholder="무엇을 할까요?"
        aria-label="할 일"
        style={{ ...inputStyle, width: "100%", height: 38 }}
      />
      {writable.length > 1 && (
        <div role="radiogroup" aria-label="누구의 할 일" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {writable.map((space) => (
            <button
              key={space.id}
              role="radio"
              aria-checked={space.id === spaceId}
              onClick={() => setSpaceId(space.id)}
              style={{
                height: 28,
                padding: "0 11px",
                borderRadius: 999,
                fontSize: 12.5,
                border: `1px solid ${space.id === spaceId ? "var(--accent-line)" : "var(--line)"}`,
                background: space.id === spaceId ? "var(--accent-soft)" : "var(--card)",
                color: space.id === spaceId ? "var(--accent)" : "var(--ink-3)",
              }}
            >
              {space.kind === "personal" ? "내 할 일" : `${space.name} 할 일`}
            </button>
          ))}
        </div>
      )}
      <WhenFields
        day={day}
        time={time}
        minutes={minutes}
        repeat={repeat}
        onDay={setDay}
        onTime={setTime}
        onMinutes={setMinutes}
        onRepeat={setRepeat}
        allowNoDay={false}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <SmallButton primary disabled={busy || title.trim() === "" || day === ""} onClick={submit}>
          캘린더에 적기
        </SmallButton>
        <SmallButton onClick={onClose}>닫기</SmallButton>
      </div>
    </Dialog>
  );
}
