"use client";

import type { ChecklistItemRow, PurchaseState } from "@nyanotion/db";
import {
  REPEAT_LABEL,
  describeDue,
  shoppingSearchUrl,
  type ChecklistRepeat,
} from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import {
  removeChecklistItemAction,
  sendToPurchaseAction,
  toggleChecklistItemAction,
  updateChecklistItemAction,
} from "@/lib/checklist-actions";
import { CartIcon, CheckBoxIcon, DotsIcon } from "./icons";
import { Spinner } from "./pending";

/**
 * 체크리스트 항목 한 줄. 체크리스트 화면과 "모아 보기"의 일정이 같이 쓴다.
 *
 * 줄은 **체크 상자 · 할 일 · 언제/누가** 만 보여 준다. 고치기·사기·지우기는 `⋯` 를 눌러야 열린다 —
 * 폰에서 한 줄에 단추가 다섯 개면 체크 상자를 잘못 누른다.
 */

const PURCHASE_LABEL: Record<PurchaseState, string> = {
  listed: "살 것에 적힘",
  searching: "값 찾는 중",
  proposed: "승인 기다림",
  approved: "승인됨",
  carted: "장바구니에 담김",
  ordered: "주문함",
  done: "받음",
  rejected: "안 사기로 함",
  failed: "찾기 실패",
};

export type Person = { id: string; name: string };

/** 서버에 다녀올 일. `before` 는 기다리기 전에 화면에 먼저 그려 둘 것(낙관적 갱신). */
type RunTask = (key: string, task: () => Promise<unknown>, before?: () => void) => void;

export function ChecklistItem({
  item,
  today,
  canWrite: allowed,
  nameOf,
  members = [],
  context,
  folders = [],
}: {
  item: ChecklistItemRow;
  today: string;
  canWrite: boolean;
  nameOf: (id: string) => string;
  /** 담당자로 고를 수 있는 사람들. 둘 이상일 때만 고르는 칸을 보여 준다. */
  members?: Person[];
  /** 모아 보기에서 쓸 때 — 어느 체크리스트의 항목인지 보여 준다. */
  context?: { title: string; href: string };
  /** 그 체크리스트의 폴더들 — 주면 `⋯` 에서 폴더를 옮길 수 있다. */
  folders?: { id: string; label: string }[];
}) {
  const router = useRouter();
  // 방금 적어서 아직 서버가 id 를 주지 않은 줄 — 보여만 주고 누르지는 못한다.
  const saving = item.id.startsWith("pending:");
  const canWrite = allowed && !saving;
  const [busy, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [, startToggle] = useTransition();
  const [open, setOpen] = useState(false);
  // 고치기·지우기는 줄부터 바뀌고 서버는 뒤따른다. 실패하면 서버 값으로 돌아가고 문구가 뜬다.
  const [shown, patch] = useOptimistic(item, (current, change: Partial<ChecklistItemRow>) => ({
    ...current,
    ...change,
  }));
  const [removed, markRemoved] = useOptimistic(false);
  const [problem, setProblem] = useState<string | null>(null);
  // 화면이 서버를 기다리지 않고 먼저 체크된다 — 체크는 가장 자주 누르는 단추다.
  const [checked, setChecked] = useState(item.done);
  // 다른 기기·가족이 바꾼 것을 새로고침으로 받으면 그걸 따른다.
  useEffect(() => setChecked(item.done), [item.done]);

  const run: RunTask = (key, task, before) => {
    setBusyKey(key);
    startTransition(async () => {
      setProblem(null);
      before?.();
      try {
        await task();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });
  };
  const isBusy = (key: string) => busy && busyKey === key;

  function toggle(): void {
    if (!canWrite) return;
    const next = !checked;
    setChecked(next);
    startToggle(async () => {
      setProblem(null);
      try {
        await toggleChecklistItemAction(item.id, next);
        router.refresh();
      } catch (error) {
        setChecked(!next);
        setProblem(error instanceof Error ? error.message : "체크하지 못했어요.");
      }
    });
  }

  const due = shown.dueOn === null ? null : describeDue(shown.dueOn, today);
  const dueColor =
    checked || due === null
      ? "var(--ink-4)"
      : due.tone === "late"
        ? "var(--late)"
        : due.tone === "today"
          ? "var(--accent)"
          : "var(--ink-3)";

  if (removed) return null;

  return (
    <li
      style={{
        listStyle: "none",
        borderBottom: "1px solid var(--line-soft)",
        opacity: saving ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 2px" }}>
        <button
          onClick={toggle}
          disabled={!canWrite}
          aria-label={checked ? "안 한 것으로" : "했음"}
          aria-pressed={checked}
          style={{
            display: "flex",
            flexShrink: 0,
            // 손가락으로 누를 자리 — 상자는 18px 이지만 누르는 곳은 더 넓게.
            padding: 6,
            margin: -6,
            marginTop: -4,
            color: checked ? "var(--accent)" : "var(--ink-4)",
            cursor: canWrite ? "pointer" : "default",
          }}
        >
          <CheckBoxIcon checked={checked} />
        </button>

        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              lineHeight: 1.5,
              color: checked ? "var(--ink-4)" : "var(--ink)",
              textDecoration: checked ? "line-through" : "none",
              wordBreak: "break-word",
            }}
          >
            {shown.title}
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "2px 10px",
              marginTop: 2,
              fontSize: 12,
              color: "var(--ink-3)",
            }}
          >
            {context !== undefined && (
              <Link href={context.href} style={{ border: 0, color: "var(--ink-3)" }}>
                {context.title}
              </Link>
            )}
            {due !== null && (
              <span style={{ color: dueColor, fontWeight: due.tone === "late" ? 500 : 400 }}>
                {due.label}
                {shown.dueTime !== null && ` ${shown.dueTime}`}
              </span>
            )}
            {shown.repeat !== "none" && <span>↻ {REPEAT_LABEL[shown.repeat]}</span>}
            {shown.assigneeId !== null && <span>@{nameOf(shown.assigneeId)}</span>}
            {item.purchaseState !== null && (
              <Link
                href={`/buy?item=${item.purchaseItemId}`}
                style={{
                  border: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  color: item.purchaseState === "proposed" ? "var(--accent)" : "var(--ink-3)",
                }}
              >
                <CartIcon size={12} />
                {PURCHASE_LABEL[item.purchaseState]}
              </Link>
            )}
            {checked && item.doneBy !== null && <span>{nameOf(item.doneBy)} 님이 함</span>}
          </div>
        </div>

        <button
          onClick={() => setOpen((value) => !value)}
          disabled={saving}
          aria-label="더 보기"
          aria-expanded={open}
          style={{
            display: "flex",
            flexShrink: 0,
            padding: 6,
            margin: -4,
            borderRadius: "var(--radius)",
            color: "var(--ink-4)",
          }}
        >
          <DotsIcon size={16} />
        </button>
      </div>

      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--late)", margin: "0 0 8px 30px" }}>{problem}</p>
      )}

      {open && (
        <ItemPanel
          item={item}
          canWrite={canWrite}
          members={members}
          folders={folders}
          isBusy={isBusy}
          run={run}
          patch={patch}
          markRemoved={() => markRemoved(true)}
          close={() => setOpen(false)}
        />
      )}
    </li>
  );
}

function ItemPanel({
  item,
  canWrite,
  members,
  folders,
  isBusy,
  run,
  patch,
  markRemoved,
  close,
}: {
  item: ChecklistItemRow;
  canWrite: boolean;
  members: Person[];
  folders: { id: string; label: string }[];
  isBusy: (key: string) => boolean;
  run: RunTask;
  patch: (change: Partial<ChecklistItemRow>) => void;
  markRemoved: () => void;
  close: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [dueOn, setDueOn] = useState(item.dueOn ?? "");
  const [dueTime, setDueTime] = useState(item.dueTime ?? "");
  const [repeat, setRepeat] = useState<ChecklistRepeat>(item.repeat);
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [maxPrice, setMaxPrice] = useState("");

  const changed =
    title.trim() !== item.title ||
    dueOn !== (item.dueOn ?? "") ||
    dueTime !== (item.dueTime ?? "") ||
    repeat !== item.repeat ||
    assigneeId !== (item.assigneeId ?? "");

  return (
    <div
      style={{
        margin: "0 0 12px 30px",
        padding: 12,
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {canWrite && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="할 일"
            style={{ ...inputStyle, width: "100%" }}
          />
          {folders.length > 0 && (
            <select
              value={item.folderId ?? ""}
              onChange={(event) => {
                const folderId = event.target.value === "" ? null : event.target.value;
                // 다른 폴더로 가면 이 줄은 여기서 빠진다 — 서버가 새 자리에 그려 준다.
                run(
                  "folder",
                  () => updateChecklistItemAction(item.id, { folderId }),
                  () => patch({ folderId }),
                );
              }}
              aria-label="폴더로 옮기기"
              style={{ ...inputStyle, width: "100%" }}
            >
              <option value="">📁 맨 위</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  📁 {f.label}
                </option>
              ))}
            </select>
          )}
          <ScheduleFields
            dueOn={dueOn}
            dueTime={dueTime}
            repeat={repeat}
            assigneeId={assigneeId}
            members={members}
            onDueOn={setDueOn}
            onDueTime={setDueTime}
            onRepeat={setRepeat}
            onAssignee={setAssigneeId}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <SmallButton
              primary
              disabled={!changed || title.trim() === ""}
              onClick={() => {
                const change = {
                  title,
                  dueOn: dueOn === "" ? null : dueOn,
                  dueTime: dueTime === "" ? null : dueTime,
                  repeat,
                  assigneeId: assigneeId === "" ? null : assigneeId,
                };
                // 줄에 먼저 그리고 칸을 닫는다. 서버는 뒤따른다.
                close();
                run("save", () => updateChecklistItemAction(item.id, change), () => patch(change));
              }}
            >
              저장
            </SmallButton>
            <SmallButton
              onClick={() => {
                if (window.confirm(`"${item.title}" 을 지울까요?`)) {
                  run("remove", () => removeChecklistItemAction(item.id), markRemoved);
                }
              }}
            >
              지우기
            </SmallButton>
          </div>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h3 style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)" }}>사기</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {/* 사람이 직접 보는 검색 화면이다. 자동 접속이 아니다. */}
          <ExternalButton href={shoppingSearchUrl("naver", item.title)}>네이버에서 보기</ExternalButton>
          <ExternalButton href={shoppingSearchUrl("coupang", item.title)}>쿠팡에서 보기</ExternalButton>
        </div>

        {item.purchaseItemId !== null ? (
          <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.6 }}>
            구매로 넘겼어요.{" "}
            <Link href={`/buy?item=${item.purchaseItemId}`}>살 것에서 보기</Link> — 받음으로 바꾸면 이
            항목도 체크됩니다.
          </p>
        ) : (
          canWrite &&
          !item.done && (
            <>
              <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
                구매로 넘기면 네이버·쿠팡에서 가장 싼 것을 찾아 옵니다. 실제로 사려면 가족 중 한 명이
                승인해야 하고, 결제 단추는 사람이 누릅니다.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <input
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ""))}
                  aria-label="수량"
                  title="수량"
                  style={{ ...inputStyle, width: 56 }}
                />
                <input
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="한도(원)"
                  aria-label="가격 한도"
                  inputMode="numeric"
                  style={{ ...inputStyle, width: 110 }}
                />
                <SmallButton
                  primary
                  disabled={isBusy("purchase")}
                  busy={isBusy("purchase")}
                  onClick={() =>
                    run("purchase", () =>
                      sendToPurchaseAction(item.id, {
                        quantity: Number(quantity) || 1,
                        maxPriceKrw:
                          maxPrice.trim() === "" ? null : Number(maxPrice.replace(/[^\d]/g, "")),
                      }),
                    )
                  }
                >
                  {isBusy("purchase") ? "넘기는 중…" : "구매로 넘기기"}
                </SmallButton>
              </div>
            </>
          )
        )}
      </section>
    </div>
  );
}

/** 날짜 · 시간 · 반복 · 담당자. 새 항목 칸과 고치기 칸이 같이 쓴다. */
export function ScheduleFields({
  dueOn,
  dueTime,
  repeat,
  assigneeId,
  members,
  onDueOn,
  onDueTime,
  onRepeat,
  onAssignee,
}: {
  dueOn: string;
  dueTime: string;
  repeat: ChecklistRepeat;
  assigneeId: string;
  members: Person[];
  onDueOn: (value: string) => void;
  onDueTime: (value: string) => void;
  onRepeat: (value: ChecklistRepeat) => void;
  onAssignee: (value: string) => void;
}) {
  const noDay = dueOn === "";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <input
        type="date"
        value={dueOn}
        onChange={(event) => onDueOn(event.target.value)}
        aria-label="날짜"
        style={{ ...inputStyle, width: 140 }}
      />
      <input
        type="time"
        value={dueTime}
        onChange={(event) => onDueTime(event.target.value)}
        disabled={noDay}
        aria-label="시간"
        title={noDay ? "날짜를 먼저 정하세요" : "시간"}
        style={{ ...inputStyle, width: 110, opacity: noDay ? 0.5 : 1 }}
      />
      <select
        value={noDay ? "none" : repeat}
        onChange={(event) => onRepeat(event.target.value as ChecklistRepeat)}
        disabled={noDay}
        aria-label="반복"
        style={{ ...inputStyle, width: 110, opacity: noDay ? 0.5 : 1 }}
      >
        {(Object.keys(REPEAT_LABEL) as ChecklistRepeat[]).map((key) => (
          <option key={key} value={key}>
            {REPEAT_LABEL[key]}
          </option>
        ))}
      </select>
      {members.length > 1 && (
        <select
          value={assigneeId}
          onChange={(event) => onAssignee(event.target.value)}
          aria-label="담당"
          style={{ ...inputStyle, width: 120 }}
        >
          <option value="">누구든</option>
          {members.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  height: 34,
  padding: "0 9px",
  background: "var(--card)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius)",
  fontSize: "var(--input-font)",
  color: "var(--ink)",
};

export function SmallButton({
  children,
  onClick,
  primary = false,
  disabled = false,
  busy = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  /** 서버가 답해야 끝나는 일 — 글자 앞에 원을 띄운다. */
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 12px",
        borderRadius: "var(--radius)",
        fontSize: 12.5,
        fontWeight: primary ? 500 : 400,
        background: primary ? "var(--ink)" : "var(--card)",
        color: primary ? "var(--paper)" : "var(--ink-2)",
        border: primary ? "none" : "1px solid var(--line)",
        opacity: disabled && !busy ? 0.45 : 1,
      }}
    >
      {busy && <Spinner size={11} />}
      {children}
    </button>
  );
}

function ExternalButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 30,
        padding: "0 12px",
        borderRadius: "var(--radius)",
        fontSize: 12.5,
        color: "var(--ink-2)",
        background: "var(--card)",
        border: "1px solid var(--line)",
      }}
    >
      {children} ↗
    </a>
  );
}
