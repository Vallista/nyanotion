"use client";

import { useMemo, useState, useTransition } from "react";
import { displayTitle, usePorts } from "../context";
import { ChevronLeft, ChevronRight, PlusIcon } from "../icons";
import type { DatabaseView, Row } from "../ports";

/**
 * 달력 뷰 — 날짜 속성 하나를 골라 그 달의 칸에 줄을 놓는다.
 *
 * 날짜는 `YYYY-MM-DD` 문자열로만 다룬다. `new Date("2026-10-03")` 은 UTC 자정으로 읽혀
 * 한국 시간에서 하루 밀리므로, **파싱하지 않고 문자열 그대로 비교한다.**
 * 구매 예정일처럼 "그 날짜" 자체가 뜻인 값에는 시간대가 끼어들면 안 된다.
 */
export function DatabaseCalendar({
  view,
  canWrite,
  onChanged,
}: {
  view: DatabaseView;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const ports = usePorts();
  const [, startTransition] = useTransition();

  const dates = useMemo(() => view.columns.filter((c) => c.type === "date"), [view.columns]);
  const [byId, setBy] = useState<string>(dates[0]?.id ?? "");
  const by = dates.find((c) => c.id === byId) ?? dates[0];

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month 는 0-11
  });

  if (by === undefined) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.75, padding: "8px 0" }}>
        달력으로 보려면 <b style={{ fontWeight: 500 }}>날짜</b> 속성이 하나 있어야 해요. 표 뷰에서
        속성을 더해 주세요.
      </p>
    );
  }

  const byDay = new Map<string, Row[]>();
  for (const row of view.rows) {
    const value = row.values[by.id];
    if (typeof value !== "string" || value === "") continue;
    const day = value.slice(0, 10);
    const list = byDay.get(day);
    if (list === undefined) byDay.set(day, [row]);
    else list.push(row);
  }

  const cells = monthCells(cursor.year, cursor.month);
  const todayKey = dayKey(new Date());

  function shift(by: number): void {
    setCursor((c) => {
      const m = c.month + by;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  function addOn(day: string): void {
    startTransition(async () => {
      await ports.database.addRow(view.collectionId, "");
      // addRow 는 id 를 돌려주지 않는다 — 다시 받아 와서 날짜가 빈 새 줄에 넣는다.
      const fresh = await ports.database.load(view.collectionId);
      const target = fresh?.rows.find(
        (row) => row.title.trim() === "" && (row.values[by!.id] ?? "") === "",
      );
      if (target !== undefined) {
        await ports.database.setValue(view.collectionId, target.documentId, by!.id, day);
      }
      onChanged();
    });
  }

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontSize: 13,
          color: "var(--ink-2)",
        }}
      >
        <button onClick={() => shift(-1)} aria-label="이전 달" style={navStyle}>
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontWeight: 500, minWidth: 92, textAlign: "center" }}>
          {cursor.year}년 {cursor.month + 1}월
        </span>
        <button onClick={() => shift(1)} aria-label="다음 달" style={navStyle}>
          <ChevronRight size={14} />
        </button>

        {dates.length > 1 && (
          <select
            value={by.id}
            onChange={(event) => setBy(event.target.value)}
            aria-label="기준 날짜 속성"
            style={{
              font: "inherit",
              marginLeft: "auto",
              color: "var(--ink-3)",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 4px",
              fontSize: 12,
            }}
          >
            {dates.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
        )}
      </header>

      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(72px, 1fr))",
            gap: 1,
            background: "var(--line)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            minWidth: 520,
          }}
        >
          {["월", "화", "수", "목", "금", "토", "일"].map((name) => (
            <div
              key={name}
              style={{
                background: "var(--surface)",
                padding: "5px 6px",
                fontSize: 11.5,
                color: "var(--ink-3)",
                textAlign: "center",
              }}
            >
              {name}
            </div>
          ))}

          {cells.map((cell) => {
            const key = cell.key;
            const rows = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                style={{
                  background: "var(--card)",
                  minHeight: 76,
                  padding: "4px 5px",
                  opacity: cell.inMonth ? 1 : 0.42,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    color: key === todayKey ? "var(--accent)" : "var(--ink-4)",
                    fontWeight: key === todayKey ? 600 : 400,
                    marginBottom: 3,
                  }}
                >
                  <span>{cell.day}</span>
                  {canWrite && cell.inMonth && (
                    <button
                      onClick={() => addOn(key)}
                      aria-label={`${key} 에 줄 더하기`}
                      title="여기에 줄 더하기"
                      style={{ color: "var(--ink-5)", display: "flex", padding: 1 }}
                    >
                      <PlusIcon size={11} />
                    </button>
                  )}
                </div>

                {rows.map((row) => (
                  <ports.Link
                    key={row.documentId}
                    href={ports.hrefForDocument(row.documentId)}
                    style={{
                      display: "block",
                      border: 0,
                      background: "var(--surface)",
                      borderRadius: 3,
                      padding: "2px 5px",
                      marginBottom: 2,
                      fontSize: 11.5,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayTitle(row.title)}
                  </ports.Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: 3,
  borderRadius: "var(--radius-sm)",
  color: "var(--ink-3)",
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 월요일 시작 6주 격자. 앞뒤 달의 날짜로 채운다. */
function monthCells(
  year: number,
  month: number,
): { key: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  // getDay(): 0=일 … 6=토. 월요일 시작으로 바꾼다.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({ key: dayKey(date), day: date.getDate(), inMonth: date.getMonth() === month });
  }
  return cells;
}
