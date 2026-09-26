"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addPropertyAction,
  addRowAction,
  deletePropertyAction,
  moveRowAction,
  removeRowAction,
  setSelectValueAction,
  setValueAction,
  updatePropertyAction,
} from "@/lib/actions";
import { displayTitle } from "@/lib/tree";
import { DotsIcon, PageIcon, PlusIcon } from "./icons";

export type PropertyType = "text" | "number" | "select" | "date" | "checkbox" | "url" | "person";

export type Column = {
  id: string;
  name: string;
  type: PropertyType;
  options: { id: string; name: string }[];
};

export type Row = {
  documentId: string;
  title: string;
  values: Record<string, unknown>;
};

const TYPE_LABELS: Record<PropertyType, string> = {
  text: "글",
  number: "숫자",
  select: "선택",
  date: "날짜",
  checkbox: "체크",
  url: "주소",
  person: "사람",
};

/**
 * 노션식 표. **줄 하나가 문서다** — 제목을 누르면 그 문서가 열리고 본문에 메모를 쓸 수 있다.
 *
 * 표에서 빼는 것과 문서를 지우는 것은 다르다. 빼면 줄만 사라지고 문서는 트리에 그대로 남는다.
 */
export function DatabaseTable({
  collectionId,
  columns,
  rows,
  people,
  canWrite,
}: {
  collectionId: string;
  columns: Column[];
  rows: Row[];
  people: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rowMenuFor, setRowMenuFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function addRow(title: string) {
    const clean = title.trim();
    setDraft("");
    if (clean === "") {
      setAdding(false);
      return;
    }
    startTransition(async () => {
      await addRowAction(collectionId, clean);
      router.refresh();
    });
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={headStyle} />
              <th style={{ ...headStyle, minWidth: 200 }}>제목</th>
              {columns.map((column) => (
                <th key={column.id} style={{ ...headStyle, minWidth: 120, position: "relative" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {column.name}
                    </span>
                    <span style={{ color: "var(--ink-4)", fontSize: 10, flexShrink: 0 }}>
                      {TYPE_LABELS[column.type]}
                    </span>
                    {canWrite && (
                      <button
                        aria-label={`${column.name} 설정`}
                        onClick={() => setMenuFor((v) => (v === column.id ? null : column.id))}
                        style={{ marginLeft: "auto", color: "var(--ink-4)", padding: 2 }}
                      >
                        <DotsIcon size={12} />
                      </button>
                    )}
                  </span>
                  {menuFor === column.id && (
                    <ColumnMenu
                      collectionId={collectionId}
                      column={column}
                      onClose={() => setMenuFor(null)}
                    />
                  )}
                </th>
              ))}
              {canWrite && (
                <th style={{ ...headStyle, width: 36 }}>
                  <AddColumnButton collectionId={collectionId} />
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.documentId} style={{ borderBottom: "1px solid var(--line-soft)" }}>
                <td style={{ ...cellStyle, width: 28, position: "relative" }}>
                  {canWrite && (
                    <button
                      aria-label="줄 설정"
                      onClick={() =>
                        setRowMenuFor((v) => (v === row.documentId ? null : row.documentId))
                      }
                      style={{ color: "var(--ink-4)", padding: 2 }}
                    >
                      <DotsIcon size={12} />
                    </button>
                  )}
                  {rowMenuFor === row.documentId && (
                    <RowMenu
                      collectionId={collectionId}
                      documentId={row.documentId}
                      canMoveUp={index > 0}
                      previousId={index > 1 ? (rows[index - 2]?.documentId ?? null) : null}
                      canMoveDown={index < rows.length - 1}
                      nextId={rows[index + 1]?.documentId ?? null}
                      onClose={() => setRowMenuFor(null)}
                    />
                  )}
                </td>

                <td style={cellStyle}>
                  <Link
                    href={`/d/${row.documentId}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      border: 0,
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  >
                    <span style={{ display: "flex", color: "var(--ink-4)" }}>
                      <PageIcon size={14} />
                    </span>
                    {displayTitle(row.title)}
                  </Link>
                </td>

                {columns.map((column) => (
                  <td key={column.id} style={cellStyle}>
                    <Cell
                      collectionId={collectionId}
                      documentId={row.documentId}
                      column={column}
                      value={row.values[column.id]}
                      people={people}
                      canWrite={canWrite}
                    />
                  </td>
                ))}
                {canWrite && <td style={cellStyle} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <div style={{ marginTop: 6 }}>
          {adding ? (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => addRow(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addRow(event.currentTarget.value);
                if (event.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder="무엇을 더할까요"
              aria-label="새 줄 제목"
              style={{
                width: "100%",
                maxWidth: 320,
                height: 30,
                padding: "0 8px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--accent)",
                background: "var(--card)",
                fontSize: 13.5,
                outline: "none",
              }}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 30,
                padding: "0 8px",
                borderRadius: "var(--radius)",
                fontSize: 13,
                color: "var(--ink-3)",
              }}
            >
              <PlusIcon size={13} />
              줄 추가
            </button>
          )}
        </div>
      )}

      {rows.length === 0 && !adding && (
        <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 14, lineHeight: 1.75 }}>
          아직 줄이 없어요. 줄 하나가 문서라서, 눌러 열면 본문에 메모를 쓸 수 있습니다.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 셀 */

function Cell({
  collectionId,
  documentId,
  column,
  value,
  people,
  canWrite,
}: {
  collectionId: string;
  documentId: string;
  column: Column;
  value: unknown;
  people: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [, startTransition] = useTransition();

  function save(next: unknown) {
    startTransition(() => void setValueAction(collectionId, documentId, column.id, next));
  }

  if (column.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        disabled={!canWrite}
        onChange={(event) => save(event.target.checked ? true : null)}
        aria-label={column.name}
        style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
      />
    );
  }

  if (column.type === "select") {
    const current = typeof value === "string" ? value : "";
    const currentName = column.options.find((o) => o.id === current)?.name ?? "";
    if (!canWrite) return <Chip>{currentName}</Chip>;
    return (
      <SelectCell
        options={column.options}
        currentId={current}
        currentName={currentName}
        onPick={(name) =>
          startTransition(
            () => void setSelectValueAction(collectionId, documentId, column.id, name),
          )
        }
      />
    );
  }

  if (column.type === "person") {
    const current = typeof value === "string" ? value : "";
    if (!canWrite) return <Chip>{people.find((p) => p.id === current)?.name ?? ""}</Chip>;
    return (
      <select
        value={current}
        onChange={(event) => save(event.target.value === "" ? null : event.target.value)}
        aria-label={column.name}
        style={selectStyle}
      >
        <option value="">—</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    );
  }

  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "number"
        ? String(value)
        : typeof value === "string"
          ? value
          : "";

  if (!canWrite) {
    if (column.type === "url" && text !== "") {
      return (
        <a href={text} target="_blank" rel="noreferrer nofollow" style={{ fontSize: 13 }}>
          {text}
        </a>
      );
    }
    return <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>{format(column, text)}</span>;
  }

  return (
    <input
      type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
      defaultValue={text}
      onBlur={(event) => {
        const raw = event.currentTarget.value;
        if (raw === text) return;
        save(column.type === "number" ? (raw === "" ? null : Number(raw)) : raw);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      aria-label={column.name}
      placeholder={column.type === "url" ? "https://" : ""}
      style={{
        width: "100%",
        minWidth: 0,
        height: 26,
        padding: "0 4px",
        border: "1px solid transparent",
        borderRadius: 3,
        background: "transparent",
        fontSize: 13.5,
        color: "var(--ink)",
        outline: "none",
      }}
      onFocus={(event) => {
        event.currentTarget.style.borderColor = "var(--accent)";
        event.currentTarget.style.background = "var(--card)";
      }}
      onBlurCapture={(event) => {
        event.currentTarget.style.borderColor = "transparent";
        event.currentTarget.style.background = "transparent";
      }}
    />
  );
}

function format(column: Column, text: string): string {
  if (text === "") return "";
  if (column.type === "number") {
    const n = Number(text);
    return Number.isFinite(n) ? n.toLocaleString("ko-KR") : text;
  }
  return text;
}

function SelectCell({
  options,
  currentId,
  currentName,
  onPick,
}: {
  options: { id: string; name: string }[];
  currentId: string;
  currentName: string;
  onPick: (name: string) => void;
}) {
  const [typing, setTyping] = useState(false);

  if (typing) {
    return (
      <input
        autoFocus
        defaultValue={currentName}
        onBlur={(event) => {
          setTyping(false);
          const next = event.currentTarget.value.trim();
          if (next !== currentName) onPick(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setTyping(false);
        }}
        placeholder="새 선택지"
        style={{
          width: "100%",
          height: 26,
          padding: "0 6px",
          borderRadius: 3,
          border: "1px solid var(--accent)",
          background: "var(--card)",
          fontSize: 13,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <select
        value={currentId}
        onChange={(event) => {
          const picked = options.find((o) => o.id === event.target.value);
          onPick(picked?.name ?? "");
        }}
        aria-label="선택"
        style={selectStyle}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setTyping(true)}
        title="새 선택지 만들기"
        style={{ color: "var(--ink-4)", padding: 2, flexShrink: 0 }}
      >
        <PlusIcon size={11} />
      </button>
    </span>
  );
}

/* --------------------------------------------------------------- 메뉴 */

function ColumnMenu({
  collectionId,
  column,
  onClose,
}: {
  collectionId: string;
  column: Column;
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <span onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
      <span style={menuStyle}>
        {renaming ? (
          <input
            autoFocus
            defaultValue={column.name}
            onBlur={(event) => {
              const next = event.currentTarget.value.trim();
              onClose();
              if (next !== "" && next !== column.name) {
                startTransition(
                  () => void updatePropertyAction(collectionId, column.id, { name: next }),
                );
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            style={{
              width: "100%",
              height: 26,
              padding: "0 6px",
              borderRadius: 3,
              border: "1px solid var(--accent)",
              fontSize: 13,
              outline: "none",
            }}
          />
        ) : (
          <button onClick={() => setRenaming(true)} style={menuItemStyle}>
            이름 바꾸기
          </button>
        )}

        <span style={{ fontSize: 11, color: "var(--ink-3)", padding: "6px 8px 2px" }}>종류</span>
        {(Object.keys(TYPE_LABELS) as PropertyType[]).map((type) => (
          <button
            key={type}
            onClick={() => {
              onClose();
              if (type !== column.type) {
                startTransition(
                  () => void updatePropertyAction(collectionId, column.id, { type }),
                );
              }
            }}
            style={{
              ...menuItemStyle,
              color: type === column.type ? "var(--ink)" : "var(--ink-2)",
              background: type === column.type ? "var(--accent-soft)" : "transparent",
            }}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}

        <span style={{ height: 1, background: "var(--line-soft)", margin: "4px 0" }} />
        {confirming ? (
          <button
            onClick={() => {
              onClose();
              startTransition(() => void deletePropertyAction(collectionId, column.id));
            }}
            style={{ ...menuItemStyle, color: "var(--ink)" }}
          >
            정말 지울까요?
          </button>
        ) : (
          <button onClick={() => setConfirming(true)} style={menuItemStyle}>
            속성 지우기
          </button>
        )}
        <span style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-3)", padding: "2px 8px 4px" }}>
          값도 함께 사라집니다. 문서는 남아요.
        </span>
      </span>
    </>
  );
}

function RowMenu({
  collectionId,
  documentId,
  canMoveUp,
  previousId,
  canMoveDown,
  nextId,
  onClose,
}: {
  collectionId: string;
  documentId: string;
  canMoveUp: boolean;
  previousId: string | null;
  canMoveDown: boolean;
  nextId: string | null;
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();

  return (
    <>
      <span onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
      <span style={{ ...menuStyle, left: 0, right: "auto", minWidth: 150 }}>
        {canMoveUp && (
          <button
            onClick={() => {
              onClose();
              startTransition(() => void moveRowAction(collectionId, documentId, previousId));
            }}
            style={menuItemStyle}
          >
            위로
          </button>
        )}
        {canMoveDown && (
          <button
            onClick={() => {
              onClose();
              startTransition(() => void moveRowAction(collectionId, documentId, nextId));
            }}
            style={menuItemStyle}
          >
            아래로
          </button>
        )}
        <span style={{ height: 1, background: "var(--line-soft)", margin: "4px 0" }} />
        <button
          onClick={() => {
            onClose();
            startTransition(() => void removeRowAction(collectionId, documentId));
          }}
          style={menuItemStyle}
        >
          표에서 빼기
        </button>
        <span style={{ fontSize: 11, lineHeight: 1.6, color: "var(--ink-3)", padding: "2px 8px 4px" }}>
          문서는 남습니다. 지우려면 문서를 열어 모래상자로.
        </span>
      </span>
    </>
  );
}

function AddColumnButton({ collectionId }: { collectionId: string }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <span style={{ position: "relative", display: "flex" }}>
      <button
        aria-label="속성 추가"
        title="속성 추가"
        onClick={() => setOpen((v) => !v)}
        style={{ color: "var(--ink-3)", padding: 2 }}
      >
        <PlusIcon size={13} />
      </button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <span style={menuStyle}>
            {(Object.keys(TYPE_LABELS) as PropertyType[]).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setOpen(false);
                  startTransition(
                    () => void addPropertyAction(collectionId, TYPE_LABELS[type], type),
                  );
                }}
                style={menuItemStyle}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  if (children === "" || children === null) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: "var(--radius-sm)",
        background: "var(--chip)",
        fontSize: 11.5,
        color: "var(--ink-2)",
      }}
    >
      {children}
    </span>
  );
}

const headStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "0 8px 8px 0",
  fontSize: 11.5,
  fontWeight: 500,
  color: "var(--ink-3)",
  letterSpacing: "0.01em",
  borderBottom: "1px solid var(--line)",
  verticalAlign: "bottom",
};

const cellStyle: React.CSSProperties = {
  padding: "6px 8px 6px 0",
  verticalAlign: "middle",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 26,
  padding: "0 4px",
  borderRadius: 3,
  border: "1px solid transparent",
  background: "transparent",
  fontSize: 13,
  color: "var(--ink-2)",
};

const menuStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: 24,
  zIndex: 26,
  minWidth: 160,
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow-float)",
  padding: 4,
  display: "flex",
  flexDirection: "column",
  fontWeight: 400,
};

const menuItemStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 3,
  fontSize: 13,
  color: "var(--ink-2)",
  textAlign: "left",
};
