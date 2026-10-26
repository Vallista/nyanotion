"use client";

import { PLAN_COLORS, PLAN_DEFAULT_COLOR, minutesOf, timeOf } from "@nyanotion/shared";
import { useState } from "react";
import type { PlanEventDraft } from "@/lib/life-actions";
import { Dialog } from "./calendar-dialogs";
import { dayLabel, type CalEvent, type CalSpace } from "./calendar-model";
import { SmallButton, inputStyle } from "./checklist-item";

/**
 * 여기서 적는 일정 — 새로 적기 · 고치기 · 지우기 (`docs/15-today.md`).
 * 할 일과 달리 체크하지 않는다. 약속·수업·여행처럼 "그 시간에 있는 일"이다.
 */

const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-3)" };

/** 빈 칸을 눌렀을 때 맨 위의 [할 일 | 일정] 전환. */
export function KindSwitch({ value, onChange }: { value: "todo" | "event"; onChange: (value: "todo" | "event") => void }) {
  return (
    <div role="tablist" aria-label="무엇을 적을까요" style={{ display: "flex", background: "var(--chip)", borderRadius: "var(--radius)", padding: 2, alignSelf: "flex-start" }}>
      {(
        [
          ["todo", "할 일"],
          ["event", "일정"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          style={{
            height: 26,
            padding: "0 14px",
            fontSize: 12.5,
            borderRadius: 3,
            background: value === key ? "var(--card)" : "transparent",
            color: value === key ? "var(--ink)" : "var(--ink-3)",
            fontWeight: value === key ? 500 : 400,
            boxShadow: value === key ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function PlanEventDialog({
  event,
  day,
  time,
  spaces,
  narrow,
  switcher,
  onClose,
  onSave,
  onRemove,
}: {
  /** 고칠 일정. 없으면 새로 적는다. */
  event: CalEvent | null;
  /** 새로 적을 때의 날·시각. */
  day: string;
  time: string | null;
  spaces: CalSpace[];
  narrow: boolean;
  switcher?: React.ReactNode;
  onClose: () => void;
  /** 실패하면 사람에게 보일 말을 돌려준다. */
  onSave: (spaceId: string, draft: PlanEventDraft) => Promise<string | null>;
  onRemove?: () => Promise<string | null>;
}) {
  const plan = event?.plan ?? null;
  const writable = spaces.filter((space) => space.canWrite);
  const [spaceId, setSpaceId] = useState(plan?.spaceId ?? writable[0]?.id ?? "");
  const [title, setTitle] = useState(plan?.title ?? "");
  const [allDay, setAllDay] = useState(plan ? plan.startTime === null : time === null);
  const [startsOn, setStartsOn] = useState(plan?.startsOn ?? day);
  const [endsOn, setEndsOn] = useState(plan?.endsOn ?? day);
  const [startTime, setStartTime] = useState(plan?.startTime ?? time ?? "09:00");
  const [endTime, setEndTime] = useState(
    plan?.endTime ?? timeOf(minutesOf(time ?? "09:00") + 60),
  );
  const [color, setColor] = useState<string>(plan?.color ?? PLAN_DEFAULT_COLOR);
  const [location, setLocation] = useState(plan?.location ?? "");
  const [note, setNote] = useState(plan?.note ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const canWrite = plan === null ? writable.length > 0 : writable.some((space) => space.id === plan.spaceId);

  const save = async () => {
    if (title.trim() === "" || spaceId === "" || saving) return;
    setSaving(true);
    setProblem(null);
    const message = await onSave(spaceId, {
      title,
      startsOn,
      startTime: allDay ? null : startTime,
      endsOn: endsOn < startsOn ? startsOn : endsOn,
      endTime: allDay ? null : endTime,
      color,
      location,
      note,
    });
    setSaving(false);
    if (message !== null) setProblem(message);
  };

  const remove = async () => {
    if (onRemove === undefined) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setSaving(true);
    const message = await onRemove();
    setSaving(false);
    if (message !== null) setProblem(message);
  };

  // 시작 시각을 옮기면 끝 시각도 같은 길이만큼 따라간다(같은 날일 때).
  const moveStart = (value: string) => {
    if (value !== "" && startsOn === endsOn && startTime !== "" && endTime !== "") {
      const length = Math.max(15, minutesOf(endTime) - minutesOf(startTime));
      setEndTime(timeOf(minutesOf(value) + length));
    }
    setStartTime(value);
  };
  const moveStartDay = (value: string) => {
    if (value !== "" && endsOn < value) setEndsOn(value);
    setStartsOn(value);
  };

  return (
    <Dialog label={plan === null ? "새 일정" : "일정"} onClose={onClose} narrow={narrow}>
      {switcher}
      {plan === null && <h2 style={{ fontSize: 14, fontWeight: 600 }}>{dayLabel(startsOn || day)}</h2>}
      <input
        autoFocus={plan === null}
        value={title}
        disabled={!canWrite}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void save();
        }}
        placeholder="어떤 일정인가요?"
        aria-label="일정 이름"
        style={{ ...inputStyle, width: "100%", height: 38, fontWeight: 500 }}
      />

      {writable.length > 1 && canWrite && (
        <div role="radiogroup" aria-label="누구의 일정" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
              {space.kind === "personal" ? "나만 봄" : `${space.name} 함께 봄`}
            </button>
          ))}
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
        <input type="checkbox" checked={allDay} disabled={!canWrite} onChange={(e) => setAllDay(e.target.checked)} />
        종일
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={labelStyle}>
          시작
          <input type="date" value={startsOn} required disabled={!canWrite} onChange={(e) => moveStartDay(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </label>
        <label style={labelStyle}>
          {allDay ? " " : "시각"}
          <input
            type="time"
            value={startTime}
            step={300}
            disabled={!canWrite || allDay}
            onChange={(e) => moveStart(e.target.value)}
            style={{ ...inputStyle, width: "100%", opacity: allDay ? 0.4 : 1 }}
            aria-label="시작 시각"
          />
        </label>
        <label style={labelStyle}>
          끝
          <input type="date" value={endsOn} min={startsOn} disabled={!canWrite} onChange={(e) => setEndsOn(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </label>
        <label style={labelStyle}>
          {allDay ? " " : "시각"}
          <input
            type="time"
            value={endTime}
            step={300}
            disabled={!canWrite || allDay}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ ...inputStyle, width: "100%", opacity: allDay ? 0.4 : 1 }}
            aria-label="끝 시각"
          />
        </label>
      </div>

      <div role="radiogroup" aria-label="색" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {PLAN_COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={`색 ${c}`}
            disabled={!canWrite}
            onClick={() => setColor(c)}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: c,
              border: "2px solid var(--paper)",
              boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
            }}
          />
        ))}
      </div>

      <input
        value={location}
        disabled={!canWrite}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="장소 (선택)"
        aria-label="장소"
        style={{ ...inputStyle, width: "100%" }}
      />
      <textarea
        value={note}
        disabled={!canWrite}
        onChange={(e) => setNote(e.target.value)}
        placeholder="메모 (선택)"
        aria-label="메모"
        rows={3}
        style={{ ...inputStyle, width: "100%", height: "auto", padding: "8px 10px", resize: "vertical", lineHeight: 1.5 }}
      />

      {problem !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--late)" }}>
          {problem}
        </p>
      )}

      {canWrite ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <SmallButton primary disabled={saving || title.trim() === "" || startsOn === ""} onClick={() => void save()}>
            {plan === null ? "캘린더에 적기" : "저장"}
          </SmallButton>
          {plan !== null && onRemove !== undefined && (
            <SmallButton disabled={saving} onClick={() => void remove()}>
              {confirmRemove ? "정말 지우기" : "지우기"}
            </SmallButton>
          )}
          <SmallButton onClick={onClose}>닫기</SmallButton>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>이 공간의 일정은 볼 수만 있어요.</p>
      )}
    </Dialog>
  );
}
