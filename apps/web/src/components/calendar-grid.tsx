"use client";

import { minutesOf, timeOf } from "@nyanotion/shared";
import { useEffect, useRef, useState } from "react";
import {
  MIN_VISIBLE_MIN,
  eventColor,
  weekdayLabel,
  type DayBuckets,
  type Entry,
  type Placed,
} from "./calendar-model";
import { CheckBoxIcon } from "./icons";

/**
 * 캘린더의 칸들 — 시간 칸(하루·주)과 달 격자.
 *
 * 칸을 누르면 그 자리(30분 단위)를 위로 알린다: 놓을 할 일을 골라 둔 상태면 거기에 놓고, 아니면 새 할 일을 적는다.
 * 데스크탑은 백로그에서 **끌어다 놓아도** 같다. 폰은 끌기가 불편하므로 "고르고 → 칸 누르기" 가 기본이다.
 */

export const HOUR_PX = 48;
const SLOT_MIN = 30;
/** 끌어다 놓는 것을 알아보는 표. 같은 페이지 안에서만 쓴다. */
export const DRAG_TYPE = "application/x-nyanotion-item";

export type GridHandlers = {
  /** 빈 칸을 눌렀다. 시간 칸이면 `HH:MM`, 종일 줄·달 칸이면 null. */
  onSlot: (day: string, time: string | null) => void;
  /** 백로그·다른 칸에서 끌어 온 할 일을 놓았다. */
  onDrop: (itemId: string, day: string, time: string | null) => void;
  onOpen: (entry: Entry) => void;
  onToggle: (entry: Entry) => void;
  onDay: (day: string) => void;
  onDragItem: (itemId: string | null) => void;
  /** 할 일의 색 — 개인·가족이 다르다 (그 할 일의 space 로 정한다). */
  todoColor: (spaceId: string) => string;
};

function dayNumber(day: string): number {
  return Number(day.slice(8, 10));
}

/* ------------------------------------------------------------------ 시간 칸 (하루 · 주) */

export function TimeGrid({
  days,
  today,
  nowTime,
  buckets,
  handlers,
  draggingMin,
  placing,
}: {
  days: string[];
  today: string;
  nowTime: string;
  buckets: Map<string, DayBuckets>;
  handlers: GridHandlers;
  /** 끌고 있는 할 일의 길이 — 놓일 자리를 그만큼 그려 준다. 끌고 있지 않으면 null. */
  draggingMin: number | null;
  placing: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ day: string; minute: number } | null>(null);
  const columns = `44px repeat(${days.length}, minmax(0, 1fr))`;

  // 처음에는 아침(또는 지금 한 시간 전)이 맨 위에 오게.
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const start = days.includes(today) ? Math.max(0, minutesOf(nowTime) - 90) : 7 * 60;
    el.scrollTop = (start / 60) * HOUR_PX;
    // 날짜가 바뀔 때만 — 일 분마다 바뀌는 지금 시각으로 화면을 끌어올리지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  useEffect(() => {
    if (draggingMin === null) setHover(null);
  }, [draggingMin]);

  function slotAt(event: React.MouseEvent | React.DragEvent, element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const minute = ((event.clientY - rect.top) / HOUR_PX) * 60;
    return Math.max(0, Math.min(24 * 60 - SLOT_MIN, Math.floor(minute / SLOT_MIN) * SLOT_MIN));
  }

  return (
    <div ref={scroller} style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
      {/* 머리: 날짜와 종일 줄. 스크롤해도 위에 붙어 있다. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 3,
          background: "var(--paper)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: columns }}>
          <div />
          {days.map((day) => {
            const isToday = day === today;
            const weekday = weekdayLabel(day);
            return (
              <button
                key={day}
                onClick={() => handlers.onDay(day)}
                aria-label={`${day} 하루 보기`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "center",
                  gap: 4,
                  padding: "8px 0 6px",
                  fontSize: 12,
                  color: weekday === "일" ? "var(--late)" : "var(--ink-3)",
                }}
              >
                <span>{weekday}</span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: isToday ? 600 : 500,
                    color: isToday ? "var(--paper)" : "var(--ink)",
                    background: isToday ? "var(--accent)" : "transparent",
                    borderRadius: 999,
                    minWidth: 26,
                    padding: "1px 6px",
                  }}
                >
                  {dayNumber(day)}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: columns, borderTop: "1px solid var(--line-soft)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ink-4)", padding: "6px 4px 0 0", textAlign: "right" }}>종일</div>
          {days.map((day) => (
            <div
              key={day}
              onClick={(event) => {
                if (event.target === event.currentTarget) handlers.onSlot(day, null);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData(DRAG_TYPE);
                if (id !== "") handlers.onDrop(id, day, null);
              }}
              data-day={day}
              data-allday=""
              style={{
                minHeight: 30,
                maxHeight: 108,
                overflowY: "auto",
                padding: "3px 2px",
                borderLeft: "1px solid var(--line-soft)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                cursor: placing ? "copy" : "default",
              }}
            >
              {(buckets.get(day)?.allDay ?? []).map((entry) => (
                <Chip key={entry.key} entry={entry} handlers={handlers} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* 몸: 시간 칸 */}
      <div style={{ display: "grid", gridTemplateColumns: columns, position: "relative" }}>
        <div style={{ position: "relative", height: 24 * HOUR_PX }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              style={{
                position: "absolute",
                top: hour * HOUR_PX - 6,
                right: 6,
                fontSize: 10.5,
                color: "var(--ink-4)",
                display: hour === 0 ? "none" : "block",
              }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day) => {
          const bucket = buckets.get(day);
          return (
            <div
              key={day}
              data-day={day}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                handlers.onSlot(day, timeOf(slotAt(event, event.currentTarget)));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                const minute = slotAt(event, event.currentTarget);
                if (hover?.day !== day || hover.minute !== minute) setHover({ day, minute });
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHover(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setHover(null);
                const id = event.dataTransfer.getData(DRAG_TYPE);
                if (id !== "") handlers.onDrop(id, day, timeOf(slotAt(event, event.currentTarget)));
              }}
              style={{
                position: "relative",
                height: 24 * HOUR_PX,
                borderLeft: "1px solid var(--line-soft)",
                background: `repeating-linear-gradient(to bottom, var(--line-soft) 0 1px, transparent 1px ${HOUR_PX}px)`,
                cursor: placing ? "copy" : "default",
              }}
            >
              {hover !== null && hover.day === day && draggingMin !== null && (
                <div
                  style={{
                    position: "absolute",
                    left: 2,
                    right: 2,
                    top: (hover.minute / 60) * HOUR_PX,
                    height: (draggingMin / 60) * HOUR_PX,
                    border: "1.5px dashed var(--accent)",
                    borderRadius: "var(--radius)",
                    background: "var(--accent-soft)",
                    pointerEvents: "none",
                    fontSize: 11,
                    color: "var(--accent)",
                    padding: "2px 4px",
                  }}
                >
                  {timeOf(hover.minute)}
                </div>
              )}
              {(bucket?.timed ?? []).map((placed) => (
                <Block key={placed.key} placed={placed} handlers={handlers} />
              ))}
              {day === today && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: (minutesOf(nowTime) / 60) * HOUR_PX,
                    borderTop: "1.5px solid var(--late)",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 시간 칸 안의 일정·할 일 하나. */
function Block({ placed, handlers }: { placed: Placed; handlers: GridHandlers }) {
  const top = (placed.start / 60) * HOUR_PX;
  const height = (Math.max(placed.end - placed.start, MIN_VISIBLE_MIN) / 60) * HOUR_PX - 2;
  const width = 100 / placed.cols;
  const position: React.CSSProperties = {
    position: "absolute",
    top: top + 1,
    height,
    left: `calc(${placed.col * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
    borderRadius: "var(--radius)",
    padding: "2px 5px",
    fontSize: 11.5,
    lineHeight: 1.3,
    overflow: "hidden",
    textAlign: "left",
    zIndex: 1,
  };
  const short = height < 30;

  if (placed.kind === "event") {
    const color = eventColor(placed.event);
    return (
      <button
        onClick={() => handlers.onOpen(placed)}
        title={placed.event.title}
        style={{
          ...position,
          background: `color-mix(in srgb, ${color} 16%, var(--card))`,
          borderLeft: `3px solid ${color}`,
          color: "var(--ink)",
        }}
      >
        <span style={{ fontWeight: 500 }}>{placed.event.title}</span>
        {!short && (
          <span style={{ display: "block", color: "var(--ink-3)" }}>
            {placed.event.startTime}
            {placed.event.endTime !== null && placed.event.endTime !== placed.event.startTime && `–${placed.event.endTime}`}
          </span>
        )}
      </button>
    );
  }

  const tone = handlers.todoColor(placed.item.spaceId);
  const done = placed.item.done && !placed.ghost;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!placed.ghost}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, placed.item.id);
        event.dataTransfer.effectAllowed = "move";
        handlers.onDragItem(placed.item.id);
      }}
      onDragEnd={() => handlers.onDragItem(null)}
      onClick={() => handlers.onOpen(placed)}
      onKeyDown={(event) => {
        if (event.key === "Enter") handlers.onOpen(placed);
      }}
      title={placed.item.title}
      style={{
        ...position,
        display: "flex",
        gap: 4,
        alignItems: "flex-start",
        cursor: "pointer",
        background: placed.ghost ? "transparent" : "var(--card)",
        border: `1px ${placed.ghost ? "dashed" : "solid"} ${tone}`,
        color: done ? "var(--ink-4)" : "var(--ink)",
        opacity: placed.ghost ? 0.7 : 1,
      }}
    >
      <TodoBox entry={placed} handlers={handlers} tone={tone} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontWeight: 500, textDecoration: done ? "line-through" : "none" }}>
          {placed.ghost && "↻ "}
          {placed.item.title}
        </span>
        {!short && (
          <span style={{ display: "block", color: "var(--ink-3)" }}>
            {placed.item.dueTime}
            {placed.item.estMin !== null && `–${timeOf(minutesOf(placed.item.dueTime ?? "00:00") + placed.item.estMin)}`}
          </span>
        )}
      </span>
    </div>
  );
}

/** 할 일의 체크 상자. 앞날(반복)은 아직 줄이 없으니 누르면 열기만 한다. */
function TodoBox({
  entry,
  handlers,
  tone,
  size = 13,
}: {
  entry: Extract<Entry, { kind: "todo" }>;
  handlers: GridHandlers;
  tone: string;
  size?: number;
}) {
  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        if (entry.ghost) handlers.onOpen(entry);
        else handlers.onToggle(entry);
      }}
      aria-label={entry.item.done && !entry.ghost ? "안 한 것으로" : "했음"}
      style={{ display: "flex", flexShrink: 0, color: tone, marginTop: 1, padding: 0 }}
    >
      <CheckBoxIcon size={size} checked={entry.item.done && !entry.ghost} />
    </button>
  );
}

/** 종일 줄·달 칸의 한 줄짜리. */
function Chip({
  entry,
  handlers,
  withTime = false,
}: {
  entry: Entry;
  handlers: GridHandlers;
  withTime?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    width: "100%",
    minWidth: 0,
    fontSize: 11.5,
    lineHeight: 1.35,
    padding: "1px 4px",
    borderRadius: "var(--radius-sm)",
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: "pointer",
  };

  if (entry.kind === "event") {
    const color = eventColor(entry.event);
    return (
      <button
        onClick={(event) => {
          event.stopPropagation();
          handlers.onOpen(entry);
        }}
        title={entry.event.title}
        style={{
          ...base,
          background: entry.event.startTime === null ? `color-mix(in srgb, ${color} 18%, var(--card))` : "transparent",
          color: "var(--ink)",
        }}
      >
        {entry.event.startTime !== null && (
          <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {withTime && entry.event.startTime !== null && (
            <span style={{ color: "var(--ink-3)" }}>{entry.event.startTime} </span>
          )}
          {entry.event.title}
        </span>
      </button>
    );
  }

  const tone = handlers.todoColor(entry.item.spaceId);
  const done = entry.item.done && !entry.ghost;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!entry.ghost}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData(DRAG_TYPE, entry.item.id);
        handlers.onDragItem(entry.item.id);
      }}
      onDragEnd={() => handlers.onDragItem(null)}
      onClick={(event) => {
        event.stopPropagation();
        handlers.onOpen(entry);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") handlers.onOpen(entry);
      }}
      title={entry.item.title}
      style={{
        ...base,
        color: done ? "var(--ink-4)" : "var(--ink)",
        opacity: entry.ghost ? 0.65 : 1,
      }}
    >
      <TodoBox entry={entry} handlers={handlers} tone={tone} size={12} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", textDecoration: done ? "line-through" : "none" }}>
        {withTime && entry.item.dueTime !== null && (
          <span style={{ color: "var(--ink-3)" }}>{entry.item.dueTime} </span>
        )}
        {entry.ghost && "↻ "}
        {entry.item.title}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ 달 격자 */

export function MonthGrid({
  days,
  month,
  today,
  buckets,
  handlers,
  placing,
  compact,
}: {
  days: string[];
  /** 지금 보는 달 `YYYY-MM` — 앞뒤 달의 날은 옅게. */
  month: string;
  today: string;
  buckets: Map<string, DayBuckets>;
  handlers: GridHandlers;
  placing: boolean;
  compact: boolean;
}) {
  const [over, setOver] = useState<string | null>(null);
  const shown = compact ? 2 : 4;
  return (
    <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--line)" }}>
        {["일", "월", "화", "수", "목", "금", "토"].map((label) => (
          <div
            key={label}
            style={{
              fontSize: 11.5,
              textAlign: "center",
              padding: "6px 0",
              color: label === "일" ? "var(--late)" : "var(--ink-3)",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        style={{
          flexGrow: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gridAutoRows: `minmax(${compact ? 72 : 104}px, 1fr)`,
        }}
      >
        {days.map((day) => {
          const bucket = buckets.get(day);
          const entries: Entry[] = [
            ...(bucket?.allDay ?? []),
            ...[...(bucket?.timed ?? [])].sort((a, b) => a.start - b.start),
          ];
          const outside = !day.startsWith(month);
          return (
            <div
              key={day}
              data-day={day}
              onClick={() => (placing ? handlers.onSlot(day, null) : handlers.onDay(day))}
              onDragOver={(event) => {
                event.preventDefault();
                if (over !== day) setOver(day);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                const id = event.dataTransfer.getData(DRAG_TYPE);
                if (id !== "") handlers.onDrop(id, day, null);
              }}
              style={{
                minWidth: 0,
                borderRight: "1px solid var(--line-soft)",
                borderBottom: "1px solid var(--line-soft)",
                padding: "4px 3px",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                cursor: placing ? "copy" : "pointer",
                background: over === day ? "var(--accent-soft)" : outside ? "var(--surface)" : "transparent",
              }}
            >
              <span
                style={{
                  alignSelf: "flex-start",
                  fontSize: 12,
                  fontWeight: day === today ? 600 : 400,
                  color: day === today ? "var(--paper)" : outside ? "var(--ink-4)" : "var(--ink-2)",
                  background: day === today ? "var(--accent)" : "transparent",
                  borderRadius: 999,
                  padding: "0 6px",
                  marginBottom: 2,
                }}
              >
                {dayNumber(day)}
              </span>
              {entries.slice(0, shown).map((entry) => (
                <Chip key={entry.key} entry={entry} handlers={handlers} withTime={!compact} />
              ))}
              {entries.length > shown && (
                <span style={{ fontSize: 11, color: "var(--ink-3)", paddingLeft: 4 }}>+{entries.length - shown}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
