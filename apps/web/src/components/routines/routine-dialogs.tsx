"use client";

import {
  ROUTINE_COLOR_KEYS,
  ROUTINE_COLOR_LABEL,
  ROUTINE_SLOT_KEYS,
  ROUTINE_SLOT_LABEL,
  describeSchedule,
  routineDayLabel,
  slotOf,
  colorOf,
  weekdayLabel,
  type RoutineColorKey,
  type RoutineItem,
  type RoutineSlotKey,
} from "@nyanotion/shared";
import { useEffect, useState } from "react";
import {
  routineArchiveAction,
  routineDeleteAction,
  routineReorderAction,
  routineSaveAction,
} from "@/lib/routine-actions";
import { Dialog } from "../calendar-dialogs";
import { SmallButton, inputStyle } from "../checklist-item";
import { TemplateChips, linkButton, type RoutineTemplateChoice } from "./routine-ui";

export type EditorTarget = { kind: "new"; template?: RoutineTemplateChoice } | { kind: "edit"; routine: RoutineItem };

const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6];

const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5, color: "var(--ink-3)" };

/** 새 루틴 · 고치기. 고칠 때는 보관·삭제도 여기서. */
export function RoutineEditor({
  target,
  routines,
  today,
  narrow,
  onClose,
  onNotice,
}: {
  target: EditorTarget;
  routines: RoutineItem[];
  today: string;
  narrow: boolean;
  onClose: () => void;
  onNotice: (text: string) => void;
}) {
  const editing = target.kind === "edit" ? target.routine : null;
  const freeColor = (): RoutineColorKey => {
    const used = new Set(routines.filter((r) => r.archivedAt === null).map((r) => colorOf(r)));
    return ROUTINE_COLOR_KEYS.find((c) => !used.has(c)) ?? "blue";
  };
  const [title, setTitle] = useState(editing?.title ?? "");
  const [color, setColor] = useState<RoutineColorKey>(editing ? colorOf(editing) : freeColor());
  const [slot, setSlot] = useState<RoutineSlotKey>(editing ? slotOf(editing) : "anytime");
  const [weekly, setWeekly] = useState(editing?.schedule.freq === "weekly");
  const [weekdays, setWeekdays] = useState<number[]>(editing?.schedule.weekdays ?? [1, 2, 3, 4, 5]);
  const [goal, setGoal] = useState(editing?.goalMin ? String(editing.goalMin) : "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? today);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = (t: RoutineTemplateChoice) => {
    setTitle(t.title);
    setSlot(t.slot);
    setGoal(t.goalMin ? String(t.goalMin) : "");
    setWeekly(t.weekdays !== undefined);
    if (t.weekdays) setWeekdays(t.weekdays);
  };

  useEffect(() => {
    if (target.kind === "new" && target.template) apply(target.template);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!confirmDelete) return;
    const id = window.setTimeout(() => setConfirmDelete(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirmDelete]);

  const goalMin = goal.trim() === "" ? null : Number.parseInt(goal, 10);
  const goalOk = goalMin === null || (Number.isFinite(goalMin) && goalMin >= 1 && goalMin <= 600);
  const canSave = title.trim() !== "" && (!weekly || weekdays.length > 0) && goalOk && startDate !== "";

  const save = async () => {
    if (!canSave) return;
    setSaving("save");
    setError(null);
    try {
      const result = await routineSaveAction(editing?.id ?? null, {
        title,
        color,
        slot,
        schedule: weekly ? { freq: "weekly", weekdays } : { freq: "daily", weekdays: [] },
        goalMin,
        startDate,
      });
      if (result.ok) onClose();
      else setError(result.message ?? "저장하지 못했어요.");
    } catch {
      setError("서버에 닿지 못했어요.");
    } finally {
      setSaving(null);
    }
  };

  const archive = async () => {
    if (!editing) return;
    setSaving("archive");
    const result = await routineArchiveAction(editing.id, editing.archivedAt === null).catch(() => null);
    setSaving(null);
    if (result?.ok) onClose();
    else setError(result?.message ?? "서버에 닿지 못했어요.");
  };

  const remove = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving("delete");
    const result = await routineDeleteAction(editing.id).catch(() => null);
    setSaving(null);
    if (result?.ok) {
      onClose();
      onNotice(`‘${editing.title}’과 그 기록을 지웠어요.`);
    } else setError(result?.message ?? "서버에 닿지 못했어요.");
  };

  return (
    <Dialog label={editing ? "루틴 고치기" : "새 루틴"} onClose={onClose} narrow={narrow}>
      <strong style={{ fontSize: 15 }}>{editing ? "루틴 고치기" : "새 루틴"}</strong>
      {!editing && <TemplateChips onPick={apply} />}

      <label style={label}>
        이름
        <input
          autoFocus
          value={title}
          maxLength={60}
          placeholder="예: 독서 30분"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void save();
          }}
          style={{ ...inputStyle, width: "100%" }}
        />
      </label>

      <div style={label}>
        색
        <div style={{ display: "flex", gap: 8 }}>
          {ROUTINE_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={ROUTINE_COLOR_LABEL[c]}
              aria-pressed={color === c}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: `var(--routine-${c})`,
                border: 0,
                outline: color === c ? `2px solid var(--routine-${c})` : "none",
                outlineOffset: 2,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      </div>

      <div style={label}>
        시간대
        <Segmented
          value={slot}
          options={ROUTINE_SLOT_KEYS.map((s) => ({ value: s, label: ROUTINE_SLOT_LABEL[s] }))}
          onChange={(v) => setSlot(v as RoutineSlotKey)}
        />
      </div>

      <div style={label}>
        반복
        <Segmented
          value={weekly ? "weekly" : "daily"}
          options={[
            { value: "daily", label: "매일" },
            { value: "weekly", label: "요일 고르기" },
          ]}
          onChange={(v) => setWeekly(v === "weekly")}
        />
        {weekly && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {WEEK_ORDER.map((d) => {
                const on = weekdays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWeekdays((list) => (on ? list.filter((x) => x !== d) : [...list, d].sort()))}
                    style={{
                      height: 32,
                      borderRadius: "var(--radius)",
                      border: `1px solid ${on ? "var(--accent-line)" : "var(--line)"}`,
                      background: on ? "var(--accent-soft)" : "var(--card)",
                      color: on ? "var(--accent-hover)" : "var(--ink-3)",
                      fontWeight: on ? 600 : 400,
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    {weekdayLabel(d)}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" style={{ ...linkButton, fontSize: 12 }} onClick={() => setWeekdays([1, 2, 3, 4, 5])}>
                평일
              </button>
              <button type="button" style={{ ...linkButton, fontSize: 12 }} onClick={() => setWeekdays([0, 6])}>
                주말
              </button>
              {weekdays.length === 0 && <span style={{ fontSize: 12, color: "var(--late)" }}>요일을 하나 이상 골라 주세요</span>}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={label}>
          하루 목표 (분, 비우면 없음)
          <input
            inputMode="numeric"
            value={goal}
            placeholder="없음"
            onChange={(event) => setGoal(event.target.value.replace(/[^0-9]/g, ""))}
            style={{ ...inputStyle, width: "100%", borderColor: goalOk ? undefined : "var(--late)" }}
          />
        </label>
        <label style={label}>
          시작일
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ ...inputStyle, width: "100%" }} />
        </label>
      </div>
      <span style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: -4 }}>
        목표를 정하면 타이머나 직접 입력으로 채울 때 자동으로 완료돼요. 시작일 전 날짜는 통계에 넣지 않아요.
      </span>

      {error && <span style={{ fontSize: 12.5, color: "var(--late)" }}>{error}</span>}

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {editing && (
          <>
            <SmallButton onClick={() => void archive()} busy={saving === "archive"} disabled={saving !== null}>
              {editing.archivedAt === null ? "보관하기" : "보관에서 꺼내기"}
            </SmallButton>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={saving !== null}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: "var(--radius)",
                fontSize: 12.5,
                border: `1px solid ${confirmDelete ? "var(--late)" : "var(--line)"}`,
                background: confirmDelete ? "var(--late)" : "var(--card)",
                color: confirmDelete ? "var(--on-accent)" : "var(--late)",
                cursor: "pointer",
              }}
            >
              {confirmDelete ? "기록까지 지워요 — 한 번 더" : "삭제"}
            </button>
          </>
        )}
        <span style={{ flexGrow: 1 }} />
        <SmallButton onClick={onClose}>취소</SmallButton>
        <SmallButton primary onClick={() => void save()} disabled={!canSave || saving !== null} busy={saving === "save"}>
          {editing ? "저장" : "추가"}
        </SmallButton>
      </div>
      {editing && (
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {editing.archivedAt === null
            ? "보관하면 오늘부터 예정에서 빠지고, 지난 기록과 통계는 남아요. 삭제는 기록까지 지우고 되돌릴 수 없어요."
            : `${routineDayLabel(editing.archivedAt)}에 보관했어요. 꺼내면 그동안은 놓친 날로 세지 않아요.`}
        </span>
      )}
    </Dialog>
  );
}

/** 루틴 관리 — 순서 바꾸기 · 보관 · 꺼내기. */
export function RoutineManager({
  routines,
  narrow,
  onClose,
  onEdit,
  onNotice,
}: {
  routines: RoutineItem[];
  narrow: boolean;
  onClose: () => void;
  onEdit: (r: RoutineItem) => void;
  onNotice: (text: string) => void;
}) {
  const [order, setOrder] = useState(routines.filter((r) => r.archivedAt === null).map((r) => r.id));
  const [busy, setBusy] = useState<string | null>(null);
  const archived = routines.filter((r) => r.archivedAt !== null);
  const byId = new Map(routines.map((r) => [r.id, r]));

  useEffect(() => {
    setOrder(routines.filter((r) => r.archivedAt === null).map((r) => r.id));
  }, [routines]);

  const move = async (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    setBusy("order");
    const result = await routineReorderAction([...next, ...archived.map((r) => r.id)]).catch(() => null);
    setBusy(null);
    if (!result?.ok) onNotice(result?.message ?? "순서를 저장하지 못했어요.");
  };

  const toggleArchive = async (r: RoutineItem) => {
    setBusy(r.id);
    const result = await routineArchiveAction(r.id, r.archivedAt === null).catch(() => null);
    setBusy(null);
    if (!result?.ok) onNotice(result?.message ?? "저장하지 못했어요.");
  };

  const row = (r: RoutineItem, index: number | null) => (
    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: `var(--routine-${colorOf(r)})`, flexShrink: 0 }} />
      <button type="button" onClick={() => onEdit(r)} style={{ ...linkButton, flexGrow: 1, minWidth: 0, textAlign: "left", display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 14, color: r.archivedAt ? "var(--ink-3)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
        <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
          {ROUTINE_SLOT_LABEL[slotOf(r)]} · {describeSchedule(r.schedule)}
          {r.goalMin ? ` · ${r.goalMin}분` : ""}
        </span>
      </button>
      {index !== null && (
        <>
          <IconButton label="위로" disabled={index === 0 || busy !== null} onClick={() => void move(index, -1)}>
            ↑
          </IconButton>
          <IconButton label="아래로" disabled={index === order.length - 1 || busy !== null} onClick={() => void move(index, 1)}>
            ↓
          </IconButton>
        </>
      )}
      <SmallButton onClick={() => void toggleArchive(r)} busy={busy === r.id} disabled={busy !== null}>
        {r.archivedAt === null ? "보관" : "꺼내기"}
      </SmallButton>
    </div>
  );

  return (
    <Dialog label="루틴 관리" onClose={onClose} narrow={narrow}>
      <strong style={{ fontSize: 15 }}>루틴 관리</strong>
      <div>
        <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>진행 중 · {order.length}</span>
        {order.map((id, i) => {
          const r = byId.get(id);
          return r ? row(r, i) : null;
        })}
      </div>
      {archived.length > 0 && (
        <div>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>보관함 · {archived.length}</span>
          {archived.map((r) => row(r, null))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SmallButton onClick={onClose}>닫기</SmallButton>
      </div>
    </Dialog>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" style={{ display: "flex", padding: 2, gap: 2, background: "var(--chip)", borderRadius: "var(--radius)" }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              height: 28,
              border: 0,
              borderRadius: "var(--radius-sm)",
              background: on ? "var(--card)" : "transparent",
              boxShadow: on ? "var(--shadow-control)" : "none",
              color: on ? "var(--ink)" : "var(--ink-3)",
              fontWeight: on ? 500 : 400,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: "var(--radius)",
        border: "1px solid var(--line)",
        background: "var(--paper)",
        color: "var(--ink-3)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "default" : "pointer",
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}
