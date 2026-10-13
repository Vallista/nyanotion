"use client";

import type { ChecklistItemRow, FolderRow } from "@nyanotion/db";
import type { ChecklistRepeat } from "@nyanotion/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addChecklistItemAction,
  addFolderAction,
  clearDoneAction,
  deleteFolderAction,
  renameFolderAction,
  sendToPurchaseAction,
} from "@/lib/checklist-actions";
import {
  ChecklistItem,
  ScheduleFields,
  SmallButton,
  inputStyle,
  type Person,
} from "./checklist-item";
import { CartIcon, PageIcon, PlusIcon } from "./icons";

/**
 * 체크리스트 하나 — **적기 · 할 것 · 한 것.**
 *
 * 적는 칸이 맨 위에 있는 이유: 체크리스트는 생각난 순간 적는 곳이다. 날짜·담당은 펼쳐야 보인다 —
 * 대부분의 항목은 "우유" 한 단어로 끝나기 때문이다.
 */
export function ChecklistBoard({
  checklistId,
  documentId,
  title,
  icon,
  spaceName,
  family,
  canWrite,
  items,
  folders,
  people,
  members,
  today,
  userId,
}: {
  checklistId: string;
  documentId: string;
  title: string;
  icon: string | null;
  spaceName: string;
  family: boolean;
  canWrite: boolean;
  items: ChecklistItemRow[];
  /** 체크리스트 안의 폴더 (중첩). Bento 의 할 일 폴더와 하나씩 맞는다. */
  folders: FolderRow[];
  people: Person[];
  /** 담당자로 고를 수 있는 사람 id (이 체크리스트를 지켜보는 사람). */
  members: string[];
  today: string;
  userId: string;
}) {
  const nameOf = (id: string) =>
    id === userId ? "나" : (people.find((p) => p.id === id)?.name ?? "누군가");
  const memberList = members.map((id) => ({ id, name: nameOf(id) }));

  const open = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);
  const [showDone, setShowDone] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  // ── 폴더 트리. 부모를 못 찾는 폴더(동기화 중 순서가 엇갈린 것)는 맨 위에 둔다.
  const known = new Set(folders.map((f) => f.id));
  const parentOf = (f: FolderRow) => (f.parentId !== null && known.has(f.parentId) ? f.parentId : null);
  const childrenOf = (parentId: string | null) => folders.filter((f) => parentOf(f) === parentId);
  const homeOf = (item: ChecklistItemRow) =>
    item.folderId !== null && known.has(item.folderId) ? item.folderId : null;
  const openIn = (folderId: string | null) => open.filter((item) => homeOf(item) === folderId);
  const countIn = (folderId: string): number =>
    openIn(folderId).length + childrenOf(folderId).reduce((sum, f) => sum + countIn(f.id), 0);
  const folderOptions: { id: string; label: string }[] = [];
  const walk = (parentId: string | null, prefix: string) => {
    for (const f of childrenOf(parentId)) {
      folderOptions.push({ id: f.id, label: prefix + f.name });
      walk(f.id, `${prefix}${f.name} / `);
    }
  };
  walk(null, "");

  function folderTask(task: () => Promise<unknown>): void {
    startTransition(async () => {
      setProblem(null);
      try {
        await task();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });
  }
  function newFolder(parentId: string | null): void {
    const name = window.prompt(parentId === null ? "새 폴더 이름" : "하위 폴더 이름");
    if (name === null || name.trim() === "") return;
    folderTask(() => addFolderAction(checklistId, name, parentId));
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {icon !== null && <span style={{ marginRight: 6 }}>{icon}</span>}
          {title}
        </h1>
        <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
          {spaceName}
          {family && " · 가족이 같이 봐요"}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", margin: "6px 0 24px", lineHeight: 1.7 }}>
        {open.length === 0 ? "다 했어요." : `${open.length}개 남았어요.`}{" "}
        <Link
          href={`/d/${documentId}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          <PageIcon size={12} />
          메모 열기
        </Link>
      </p>

      {canWrite && (
        <AddItem
          checklistId={checklistId}
          members={memberList}
          defaultAssignee=""
          folders={folderOptions}
        />
      )}

      {canWrite && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button
            onClick={() => newFolder(null)}
            style={{ fontSize: 12, color: "var(--ink-3)", padding: "4px 0" }}
          >
            + 폴더
          </button>
        </div>
      )}
      {problem !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--late)", marginBottom: 6 }}>
          {problem}
        </p>
      )}

      <ul style={{ padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)" }}>
        {openIn(null).map((item) => (
          <ChecklistItem
            key={item.id}
            item={item}
            today={today}
            canWrite={canWrite}
            nameOf={nameOf}
            members={memberList}
            folders={folderOptions}
          />
        ))}
      </ul>
      {childrenOf(null).map((folder) => (
        <FolderSection
          key={folder.id}
          folder={folder}
          depth={0}
          childrenOf={childrenOf}
          openIn={openIn}
          countIn={countIn}
          render={(item) => (
            <ChecklistItem
              key={item.id}
              item={item}
              today={today}
              canWrite={canWrite}
              nameOf={nameOf}
              members={memberList}
              folders={folderOptions}
            />
          )}
          canWrite={canWrite}
          onNewChild={(parentId) => newFolder(parentId)}
          onRename={(id, name) => folderTask(() => renameFolderAction(id, name))}
          onDelete={(id) => folderTask(() => deleteFolderAction(id))}
        />
      ))}

      {open.length === 0 && items.length === 0 && (
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.8, marginTop: 12 }}>
          아직 아무것도 없어요. 위에 할 일을 적어 보세요. 날짜를 정하면 그날 알려 드리고,
          {family ? " 가족 중 한 명에게 맡길 수도 있어요." : " 반복도 걸 수 있어요."}
        </p>
      )}

      {done.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowDone((value) => !value)}
              aria-expanded={showDone}
              style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", padding: "4px 0" }}
            >
              {showDone ? "▾" : "▸"} 한 것 {done.length}
            </button>
            {canWrite && showDone && <ClearDone checklistId={checklistId} />}
          </div>
          {showDone && (
            <ul style={{ padding: 0, margin: "6px 0 0" }}>
              {done.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  today={today}
                  canWrite={canWrite}
                  nameOf={nameOf}
                  members={memberList}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function AddItem({
  checklistId,
  members,
  defaultAssignee,
  folders,
}: {
  checklistId: string;
  members: Person[];
  defaultAssignee: string;
  folders: { id: string; label: string }[];
}) {
  const [folderId, setFolderId] = useState("");
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [more, setMore] = useState(false);
  const [dueOn, setDueOn] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [repeat, setRepeat] = useState<ChecklistRepeat>("none");
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [buy, setBuy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        const id = await addChecklistItemAction(checklistId, {
          title: clean,
          dueOn: dueOn === "" ? null : dueOn,
          dueTime: dueTime === "" ? null : dueTime,
          repeat,
          assigneeId: assigneeId === "" ? null : assigneeId,
          folderId: folderId === "" ? null : folderId,
        });
        if (buy) await sendToPurchaseAction(id);
        // 날짜·담당은 남겨 둔다 — 같은 날 장볼 것을 이어서 적는 일이 많다.
        setTitle("");
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "적지 못했어요.");
      }
    });
  }

  return (
    <section style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            // 한글 조합 중의 Enter 는 글자를 확정하는 것이지 제출이 아니다.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
          placeholder="할 일을 적고 Enter"
          aria-label="할 일"
          style={{ ...inputStyle, flex: "1 1 auto", minWidth: 0 }}
        />
        <button
          onClick={submit}
          disabled={busy || title.trim() === ""}
          aria-label="적기"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            flexShrink: 0,
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: busy || title.trim() === "" ? 0.45 : 1,
          }}
        >
          <PlusIcon size={13} />
          적기
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
        <button
          onClick={() => setMore((value) => !value)}
          aria-expanded={more}
          style={{ fontSize: 12, color: "var(--ink-3)", padding: "2px 0" }}
        >
          {more ? "▾" : "▸"} 날짜{members.length > 1 ? " · 담당" : ""}
          {dueOn !== "" && ` (${dueOn}${dueTime === "" ? "" : ` ${dueTime}`})`}
        </button>
        {folders.length > 0 && (
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            aria-label="적을 폴더"
            style={{ ...inputStyle, height: 28, fontSize: "var(--input-font)", maxWidth: 180 }}
          >
            <option value="">📁 맨 위</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                📁 {f.label}
              </option>
            ))}
          </select>
        )}
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: buy ? "var(--accent)" : "var(--ink-3)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={buy} onChange={(event) => setBuy(event.target.checked)} />
          <CartIcon size={12} />
          사야 하는 것 (값 찾아 오기)
        </label>
      </div>

      {more && (
        <div style={{ marginTop: 8 }}>
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
        </div>
      )}

      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--late)", marginTop: 6 }}>{problem}</p>
      )}
    </section>
  );
}

function ClearDone({ checklistId }: { checklistId: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  return (
    <SmallButton
      disabled={busy}
      onClick={() => {
        if (!window.confirm("한 것을 모두 치울까요? 반복 항목의 지난 기록도 사라집니다.")) return;
        startTransition(async () => {
          await clearDoneAction(checklistId);
          router.refresh();
        });
      }}
    >
      한 것 치우기
    </SmallButton>
  );
}

/** 폴더 하나 — 머리(접기 · 이름 · 남은 수 · 하위 폴더 · 이름 바꾸기 · 지우기), 그 안의 할 일, 하위 폴더. */
function FolderSection({
  folder,
  depth,
  childrenOf,
  openIn,
  countIn,
  render,
  canWrite,
  onNewChild,
  onRename,
  onDelete,
}: {
  folder: FolderRow;
  depth: number;
  childrenOf: (parentId: string | null) => FolderRow[];
  openIn: (folderId: string | null) => ChecklistItemRow[];
  countIn: (folderId: string) => number;
  render: (item: ChecklistItemRow) => React.ReactNode;
  canWrite: boolean;
  onNewChild: (parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const items = openIn(folder.id);
  const children = childrenOf(folder.id);
  const linkButton: React.CSSProperties = { fontSize: 12, color: "var(--ink-3)", padding: "2px 4px" };

  return (
    <section aria-label={`폴더 ${folder.name}`} style={{ marginLeft: depth * 16, marginTop: 10 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 2px",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}
        >
          <span style={{ fontSize: 11, color: "var(--ink-4)", width: 10 }}>{open ? "▾" : "▸"}</span>
          📁 {folder.name}
        </button>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{countIn(folder.id)}</span>
        {canWrite && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <button style={linkButton} onClick={() => onNewChild(folder.id)}>
              + 하위
            </button>
            <button
              style={linkButton}
              onClick={() => {
                const name = window.prompt("폴더 이름", folder.name);
                if (name !== null && name.trim() !== "" && name.trim() !== folder.name) onRename(folder.id, name);
              }}
            >
              이름
            </button>
            <button
              style={linkButton}
              onClick={() => {
                if (window.confirm(`"${folder.name}" 폴더를 지울까요? 안의 할 일과 하위 폴더는 위로 올라갑니다.`)) {
                  onDelete(folder.id);
                }
              }}
            >
              지우기
            </button>
          </span>
        )}
      </header>
      {open && (
        <>
          {items.length > 0 && <ul style={{ padding: 0, margin: 0 }}>{items.map(render)}</ul>}
          {children.map((child) => (
            <FolderSection
              key={child.id}
              folder={child}
              depth={1}
              childrenOf={childrenOf}
              openIn={openIn}
              countIn={countIn}
              render={render}
              canWrite={canWrite}
              onNewChild={onNewChild}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </section>
  );
}
