"use client";

import { useMemo, useState, useTransition } from "react";
import { displayTitle, usePorts } from "../context";
import { PageIcon, PlusIcon } from "../icons";
import type { Column, DatabaseView, Row } from "../ports";

/**
 * 보드 뷰 — 선택 속성 하나로 줄을 묶어 칸에 늘어놓는다. 노션의 보드와 같은 규칙이다.
 *
 * 묶을 속성이 없으면 만들라고 알려 준다. 억지로 첫 속성을 쓰면 뜻이 없는 칸이 나온다.
 * 카드를 끌어 다른 칸에 놓으면 그 속성 값이 바뀐다 — 그게 보드에서 할 수 있는 유일한 편집이다.
 */
export function DatabaseBoard({
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
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const selects = useMemo(() => view.columns.filter((c) => c.type === "select"), [view.columns]);
  const [groupById, setGroupBy] = useState<string>(selects[0]?.id ?? "");
  const groupBy = selects.find((c) => c.id === groupById) ?? selects[0];

  if (groupBy === undefined) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.75, padding: "8px 0" }}>
        보드로 보려면 <b style={{ fontWeight: 500 }}>선택</b> 속성이 하나 있어야 해요. 표 뷰에서
        속성을 더해 주세요.
      </p>
    );
  }

  /** 칸 목록 = 선택지들 + 값이 없는 줄을 담을 "없음". */
  const lanes: { id: string; name: string }[] = [
    ...groupBy.options.map((o) => ({ id: o.id, name: o.name })),
    { id: "", name: "없음" },
  ];

  const rowsIn = (optionId: string): Row[] =>
    view.rows.filter((row) => {
      const value = row.values[groupBy.id];
      return (typeof value === "string" ? value : "") === optionId;
    });

  function moveTo(documentId: string, laneId: string): void {
    const option = groupBy!.options.find((o) => o.id === laneId);
    startTransition(async () => {
      if (option === undefined) {
        // "없음" 으로 옮기면 값을 지운다.
        await ports.database.setValue(view.collectionId, documentId, groupBy!.id, null);
      } else {
        await ports.database.setSelectValue(
          view.collectionId,
          documentId,
          groupBy!.id,
          option.name,
        );
      }
      onChanged();
    });
  }

  return (
    <div>
      {selects.length > 1 && (
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--ink-3)",
            marginBottom: 8,
          }}
        >
          묶기
          <select
            value={groupBy.id}
            onChange={(event) => setGroupBy(event.target.value)}
            style={{
              font: "inherit",
              color: "var(--ink-2)",
              background: "transparent",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 4px",
            }}
          >
            {selects.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {lanes.map((lane) => {
          const rows = rowsIn(lane.id);
          return (
            <section
              key={lane.id || "none"}
              onDragOver={(event) => {
                if (!canWrite || dragging === null) return;
                event.preventDefault();
                setOver(lane.id);
              }}
              onDragLeave={() => setOver((v) => (v === lane.id ? null : v))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (canWrite && dragging !== null) moveTo(dragging, lane.id);
                setDragging(null);
              }}
              style={{
                flex: "0 0 auto",
                width: 210,
                background: over === lane.id ? "var(--accent-soft)" : "var(--surface)",
                borderRadius: "var(--radius)",
                padding: 8,
                minHeight: 90,
              }}
            >
              <header
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                  marginBottom: 6,
                  fontSize: 12,
                  color: "var(--ink-2)",
                }}
              >
                <span style={{ fontWeight: 500 }}>{lane.name}</span>
                <span style={{ color: "var(--ink-4)" }}>{rows.length}</span>
              </header>

              {rows.map((row) => (
                <article
                  key={row.documentId}
                  draggable={canWrite}
                  onDragStart={() => setDragging(row.documentId)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    padding: "7px 9px",
                    marginBottom: 6,
                    cursor: canWrite ? "grab" : "default",
                    opacity: dragging === row.documentId ? 0.5 : 1,
                  }}
                >
                  <ports.Link
                    href={ports.hrefForDocument(row.documentId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      border: 0,
                      color: "var(--ink)",
                      fontSize: 13,
                    }}
                  >
                    <span style={{ display: "flex", color: "var(--ink-4)" }}>
                      <PageIcon size={13} />
                    </span>
                    {displayTitle(row.title)}
                  </ports.Link>
                  <CardMeta row={row} columns={view.columns} skip={groupBy.id} people={view.people} />
                </article>
              ))}

              {canWrite && lane.id !== "" && (
                <AddCard
                  onAdd={(title) =>
                    startTransition(async () => {
                      await ports.database.addRow(view.collectionId, title);
                      onChanged();
                    })
                  }
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** 카드 아래 한 줄 요약 — 묶는 속성 말고 값이 있는 것 두 개까지. */
function CardMeta({
  row,
  columns,
  skip,
  people,
}: {
  row: Row;
  columns: Column[];
  skip: string;
  people: { id: string; name: string }[];
}) {
  const shown = columns
    .filter((column) => column.id !== skip)
    .map((column) => ({ column, text: cellText(column, row.values[column.id], people) }))
    .filter((item) => item.text !== "")
    .slice(0, 2);
  if (shown.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 5, fontSize: 11.5, color: "var(--ink-3)" }}>
      {shown.map(({ column, text }) => (
        <span key={column.id} style={{ whiteSpace: "nowrap" }}>
          {text}
        </span>
      ))}
    </div>
  );
}

function cellText(
  column: Column,
  value: unknown,
  people: { id: string; name: string }[],
): string {
  if (value === null || value === undefined || value === "") return "";
  if (column.type === "checkbox") return value === true ? "✓" : "";
  if (column.type === "select") {
    return column.options.find((o) => o.id === value)?.name ?? "";
  }
  if (column.type === "person") {
    return people.find((p) => p.id === value)?.name ?? "";
  }
  if (column.type === "number") return typeof value === "number" ? value.toLocaleString("ko-KR") : "";
  return typeof value === "string" ? value : "";
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  function commit(text: string): void {
    const clean = text.trim();
    setDraft("");
    setOpen(false);
    if (clean !== "") onAdd(clean);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          color: "var(--ink-4)",
          padding: "3px 2px",
        }}
      >
        <PlusIcon size={12} />새 카드
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget.value);
        if (event.key === "Escape") {
          setDraft("");
          setOpen(false);
        }
      }}
      placeholder="무엇을 더할까요"
      aria-label="새 카드 제목"
      style={{
        width: "100%",
        height: 28,
        padding: "0 7px",
        fontSize: 13,
        color: "var(--ink)",
        background: "var(--card)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--radius-sm)",
        outline: "none",
      }}
    />
  );
}
