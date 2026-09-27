"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  archiveDocumentAction,
  createDocumentAction,
  moveDocumentAction,
  renameDocumentAction,
} from "@/lib/actions";
import { buildTree, displayTitle, flattenVisible, subtreeIds, type TreeItem } from "@/lib/tree";
import { CatMark } from "./cat-mark";
import { GpuModeToggle } from "./gpu-mode-toggle";
import { openCommandPalette } from "./command-palette";
import { NewDatabaseButton } from "./new-database-button";
import { NewFamilyButton } from "./new-family-button";
import { SignOutButton } from "./sign-out-button";
import {
  ChevronDown,
  ChevronRight,
  ChuruIcon,
  CollectionIcon,
  DotsIcon,
  FamilyIcon,
  AskIcon,
  CartIcon,
  InstallIcon,
  LitterBoxIcon,
  PageIcon,
  PlusIcon,
  SearchIcon,
  TowerIcon,
} from "./icons";

const EXPANDED_KEY = "nyanotion.expanded";

/** 행 안에서 어디에 놓았는가. 위/아래 25% 는 형제, 가운데는 자식으로 넣는다. */
type DropZone = "before" | "after" | "into";

export type SidebarNode = {
  id: string;
  parentId: string | null;
  position: string;
  title: string;
  icon: string | null;
  type: string;
  spaceId: string;
};

export type SidebarSpace = {
  id: string;
  name: string;
  kind: "personal" | "org";
  organizationId: string | null;
};

function readExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((x): x is string => typeof x === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    // 시크릿 창이나 저장소 차단 — 접힘 상태는 없어도 되는 편의라 무시한다.
  }
}

export function Sidebar({
  spaces,
  nodes,
  archivedCount,
  awaitingApproval,
  favorites,
  tags,
  collections,
  email,
  gpuMode,
  aiReachable,
}: {
  spaces: SidebarSpace[];
  nodes: SidebarNode[];
  archivedCount: number;
  /** 승인을 기다리는 살 것 수. 0 이면 배지를 안 단다. */
  awaitingApproval: number;
  favorites: { id: string; title: string; icon: string | null }[];
  tags: { id: string; name: string; count: number }[];
  collections: { id: string; name: string }[];
  email: string;
  gpuMode: "free" | "gaming";
  aiReachable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const activeId = pathname.startsWith("/d/") ? (pathname.split("/")[2] ?? null) : null;

  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: DropZone } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => setExpanded(readExpanded()), []);

  const blocked = useMemo(
    () => (dragId === null ? new Set<string>() : subtreeIds(nodes, dragId)),
    [nodes, dragId],
  );
  const draggingSpace = useMemo(
    () => (dragId === null ? null : (nodes.find((n) => n.id === dragId)?.spaceId ?? null)),
    [nodes, dragId],
  );

  // 열려 있는 문서의 조상은 자동으로 펼친다.
  useEffect(() => {
    if (activeId === null) return;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const toOpen: string[] = [];
    let cursor = byId.get(activeId)?.parentId ?? null;
    const guard = new Set<string>();
    while (cursor !== null && !guard.has(cursor)) {
      guard.add(cursor);
      toOpen.push(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    if (toOpen.length === 0) return;
    setExpanded((prev) => {
      if (toOpen.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of toOpen) next.add(id);
      writeExpanded(next);
      return next;
    });
  }, [activeId, nodes]);

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeExpanded(next);
      return next;
    });
  }

  function onDrop(target: TreeItem, zone: DropZone) {
    const moving = dragId;
    setDragId(null);
    setDrop(null);
    if (moving === null || blocked.has(target.id)) return;

    let parentId: string | null;
    let afterId: string | null;
    if (zone === "into") {
      parentId = target.id;
      const kids = nodes.filter((n) => n.parentId === target.id);
      afterId = kids.length === 0 ? null : (kids[kids.length - 1]?.id ?? null);
      setExpanded((prev) => {
        const next = new Set(prev).add(target.id);
        writeExpanded(next);
        return next;
      });
    } else {
      parentId = target.parentId;
      const siblings = nodes.filter((n) => n.parentId === target.parentId && n.id !== moving);
      const index = siblings.findIndex((s) => s.id === target.id);
      afterId = zone === "after" ? target.id : index <= 0 ? null : (siblings[index - 1]?.id ?? null);
    }

    startTransition(async () => {
      const result = await moveDocumentAction(moving, parentId, afterId);
      if (!result.ok) router.refresh();
    });
  }

  const orgSpaces = spaces.filter((item) => item.kind === "org");
  const personalSpace = spaces.find((item) => item.kind === "personal");

  function renderTree(spaceId: string) {
    const scoped = nodes.filter((n) => n.spaceId === spaceId);
    const rows = flattenVisible(buildTree(scoped), expanded);
    if (rows.length === 0) {
      return (
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", padding: "4px 12px", lineHeight: 1.6 }}>
          아직 문서가 없어요.
        </p>
      );
    }
    return (
      <div style={{ padding: "0 8px" }}>
        {rows.map((item) => (
          <Row
            key={item.id}
            item={item}
            active={item.id === activeId}
            expanded={expanded.has(item.id)}
            dragging={dragId === item.id}
            dropZone={drop?.id === item.id ? drop.zone : null}
            // 문서는 자기 space 안에서만 움직인다 — 공간을 건너뛰는 건 이동이 아니라 공유다.
            forbidden={dragId !== null && (blocked.has(item.id) || draggingSpace !== spaceId)}
            menuOpen={menuFor === item.id}
            renaming={renaming === item.id}
            onToggle={() => toggle(item.id)}
            onDragStart={() => setDragId(item.id)}
            onDragEnd={() => {
              setDragId(null);
              setDrop(null);
            }}
            onDragOver={(zone) => setDrop({ id: item.id, zone })}
            onDrop={(zone) => onDrop(item, zone)}
            onMenu={() => setMenuFor((prev) => (prev === item.id ? null : item.id))}
            onCloseMenu={() => setMenuFor(null)}
            onStartRename={() => {
              setMenuFor(null);
              setRenaming(item.id);
            }}
            onRename={(title) => {
              setRenaming(null);
              if (title !== item.title) {
                startTransition(() => void renameDocumentAction(item.id, title));
              }
            }}
            onCancelRename={() => setRenaming(null)}
            onAddChild={() => {
              setMenuFor(null);
              startTransition(() => void createDocumentAction(item.id));
            }}
            onArchive={() => {
              setMenuFor(null);
              startTransition(() => void archiveDocumentAction(item.id));
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <nav
      aria-label="문서 트리"
      style={{
        width: 248,
        flexShrink: 0,
        height: "100%",
        background: "var(--surface)",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 46,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 8px 0 14px",
        }}
      >
        <CatMark size={19} color="var(--ink)" />
        <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.012em" }}>Nyanotion</span>
      </div>

      <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 1 }}>
        <SideLink icon={<SearchIcon />} label="검색" shortcut="⌘K" onClick={openCommandPalette} />
        <SideLink href="/" icon={<TowerIcon />} label="캣타워" active={pathname === "/"} />
      </div>

      <div style={{ flexGrow: 1, overflowY: "auto", paddingBottom: 12 }}>
        {favorites.length > 0 && (
          <>
            <SectionLabel>츄르</SectionLabel>
            <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 1 }}>
              {favorites.map((item) => (
                <SideLink
                  key={item.id}
                  href={`/d/${item.id}`}
                  icon={<ChuruIcon size={14} filled />}
                  label={displayTitle(item.title)}
                  active={item.id === activeId}
                />
              ))}
            </div>
          </>
        )}

        {orgSpaces.map((item) => (
          <div key={item.id}>
            <SectionLabel
              action={
                <span style={{ display: "flex", gap: 1 }}>
                  {item.organizationId !== null && (
                    <Link
                      href={`/family/${item.organizationId}`}
                      aria-label={`${item.name} 관리`}
                      title="가족 관리"
                      style={{
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 3,
                        color: "var(--ink-3)",
                        border: 0,
                      }}
                    >
                      <FamilyIcon size={13} />
                    </Link>
                  )}
                  <RowButton
                    label="새 문서"
                    onClick={() => startTransition(() => void createDocumentAction(null, item.id))}
                  >
                    <PlusIcon size={13} />
                  </RowButton>
                </span>
              }
            >
              {item.name}
            </SectionLabel>
            {renderTree(item.id)}
          </div>
        ))}

        {personalSpace !== undefined && (
          <>
            <SectionLabel
              action={
                <RowButton
                  label="새 문서"
                  onClick={() =>
                    startTransition(() => void createDocumentAction(null, personalSpace.id))
                  }
                >
                  <PlusIcon size={13} />
                </RowButton>
              }
            >
              내 문서
            </SectionLabel>
            {renderTree(personalSpace.id)}
          </>
        )}

        <SectionLabel>모음</SectionLabel>
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 1 }}>
          {collections.map((item) => (
            <SideLink
              key={item.id}
              href={`/c/${item.id}`}
              icon={<CollectionIcon size={14} />}
              label={item.name}
              active={pathname === `/c/${item.id}`}
            />
          ))}
          <NewDatabaseButton spaceId={personalSpace?.id} />
        </div>

        {tags.length > 0 && (
          <>
            <SectionLabel>태그</SectionLabel>
            <div style={{ padding: "0 10px", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {tags.map((item) => (
                <Link
                  key={item.id}
                  href={`/t/${item.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    height: 22,
                    padding: "0 8px",
                    borderRadius: "var(--radius-sm)",
                    background: pathname === `/t/${item.id}` ? "var(--accent-soft)" : "var(--chip)",
                    fontSize: 11.5,
                    color: "var(--ink-2)",
                    border: 0,
                  }}
                  title={`문서 ${item.count}개`}
                >
                  {item.name}
                  <span style={{ color: "var(--ink-4)" }}>{item.count}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <SectionLabel>가족</SectionLabel>
        <div style={{ padding: "0 8px" }}>
          <NewFamilyButton />
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          padding: 8,
          borderTop: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          gap: 1,
        }}
      >
        <SideLink
          href="/trash"
          icon={<LitterBoxIcon />}
          label="모래상자"
          trailing={archivedCount > 0 ? String(archivedCount) : undefined}
        />
        <SideLink
          href="/buy"
          icon={<CartIcon />}
          label="살 것"
          trailing={awaitingApproval > 0 ? String(awaitingApproval) : undefined}
        />
        <SideLink href="/ask" icon={<AskIcon />} label="물어보기" />
        <SideLink href="/install" icon={<InstallIcon />} label="앱으로 설치" />
        <GpuModeToggle mode={gpuMode} reachable={aiReachable} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: 28,
            padding: "0 6px",
            fontSize: 11.5,
            color: "var(--ink-3)",
          }}
        >
          <span className="dot dot-synced" />
          <span
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={email}
          >
            {email}
          </span>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- 행 */

function Row({
  item,
  active,
  expanded,
  dragging,
  dropZone,
  forbidden,
  menuOpen,
  renaming,
  onToggle,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMenu,
  onCloseMenu,
  onStartRename,
  onRename,
  onCancelRename,
  onAddChild,
  onArchive,
}: {
  item: TreeItem;
  active: boolean;
  expanded: boolean;
  dragging: boolean;
  dropZone: DropZone | null;
  forbidden: boolean;
  menuOpen: boolean;
  renaming: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (zone: DropZone) => void;
  onDrop: (zone: DropZone) => void;
  onMenu: () => void;
  onCloseMenu: () => void;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onAddChild: () => void;
  onArchive: () => void;
}) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  function zoneFrom(event: React.DragEvent<HTMLDivElement>): DropZone {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - box.top) / box.height;
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  }

  const indent = 6 + item.depth * 12;
  const showControls = hover || menuOpen;

  return (
    <div
      style={{ position: "relative", opacity: dragging ? 0.4 : 1 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDragOver={(e) => {
        if (forbidden) return;
        e.preventDefault();
        onDragOver(zoneFrom(e));
      }}
      onDrop={(e) => {
        if (forbidden) return;
        e.preventDefault();
        onDrop(zoneFrom(e));
      }}
    >
      {dropZone === "before" && <DropLine offset={indent} position="top" />}
      {dropZone === "after" && <DropLine offset={indent} position="bottom" />}

      <div
        draggable={!renaming}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          height: 28,
          paddingRight: 4,
          paddingLeft: indent,
          borderRadius: "var(--radius)",
          fontSize: 13.5,
          position: "relative",
          background:
            dropZone === "into" || active
              ? "var(--accent-soft)"
              : hover
                ? "rgba(47,46,43,0.045)"
                : "transparent",
          color: active ? "var(--ink)" : "var(--ink-2)",
          fontWeight: active ? 500 : 400,
          cursor: renaming ? "text" : "pointer",
        }}
      >
        <span
          style={{ width: 14, display: "flex", justifyContent: "center", color: "var(--ink-4)" }}
        >
          {item.children.length > 0 ? (
            <button
              aria-label={expanded ? "접기" : "펼치기"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              style={{ display: "flex", padding: 2, margin: -2, borderRadius: 3 }}
            >
              {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : null}
        </span>

        <span style={{ display: "flex", color: active ? "var(--accent)" : "var(--ink-4)" }}>
          <PageIcon size={14} />
        </span>

        {renaming ? (
          <input
            ref={inputRef}
            defaultValue={item.title}
            autoFocus
            onBlur={(e) => onRename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename(e.currentTarget.value);
              if (e.key === "Escape") onCancelRename();
            }}
            style={{
              flexGrow: 1,
              minWidth: 0,
              height: 22,
              padding: "0 4px",
              background: "var(--card)",
              border: "1px solid var(--accent)",
              borderRadius: 3,
              fontSize: 13.5,
            }}
          />
        ) : (
          <Link
            href={`/d/${item.id}`}
            onDoubleClick={(e) => {
              e.preventDefault();
              onStartRename();
            }}
            style={{
              flexGrow: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "inherit",
              border: 0,
            }}
            title={displayTitle(item.title)}
          >
            {displayTitle(item.title)}
          </Link>
        )}

        {showControls && !renaming && (
          <span style={{ display: "flex", gap: 1, marginLeft: 2 }}>
            <RowButton label="안에 새 문서" onClick={onAddChild}>
              <PlusIcon size={13} />
            </RowButton>
            <RowButton label="더 보기" onClick={onMenu}>
              <DotsIcon size={13} />
            </RowButton>
          </span>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 4,
            top: 28,
            zIndex: 20,
            minWidth: 150,
            background: "var(--card)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-float)",
            padding: 4,
          }}
        >
          <MenuItem onClick={onStartRename}>이름 변경</MenuItem>
          <MenuItem onClick={onAddChild}>안에 새 문서</MenuItem>
          <div style={{ height: 1, background: "var(--line-soft)", margin: "4px 0" }} />
          <MenuItem onClick={onArchive}>모래상자로</MenuItem>
          <MenuItem onClick={onCloseMenu} muted>
            닫기
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function DropLine({ offset, position }: { offset: number; position: "top" | "bottom" }) {
  return (
    <span
      style={{
        position: "absolute",
        left: offset,
        right: 4,
        [position]: -1,
        height: 2,
        background: "var(--accent)",
        borderRadius: 1,
        zIndex: 10,
        pointerEvents: "none",
      }}
    />
  );
}

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 18,
        padding: "0 8px 4px 12px",
        fontSize: 11.5,
        fontWeight: 500,
        color: "var(--ink-3)",
        letterSpacing: "0.01em",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span
        style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {children}
      </span>
      {action !== undefined && <span style={{ marginLeft: "auto" }}>{action}</span>}
    </div>
  );
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 3,
        color: "var(--ink-3)",
      }}
    >
      {children}
    </button>
  );
}

function MenuItem({
  onClick,
  muted = false,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "6px 8px",
        borderRadius: 3,
        fontSize: 13,
        color: muted ? "var(--ink-3)" : "var(--ink-2)",
      }}
    >
      {children}
    </button>
  );
}

function SideLink({
  href,
  icon,
  label,
  shortcut,
  trailing,
  active = false,
  onClick,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  trailing?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span style={{ display: "flex", color: "var(--ink-4)" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {shortcut !== undefined && (
        <span style={{ marginLeft: "auto" }}>
          <kbd>{shortcut}</kbd>
        </span>
      )}
      {trailing !== undefined && (
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)" }}>{trailing}</span>
      )}
    </>
  );

  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    height: 28,
    padding: "0 6px 0 8px",
    borderRadius: "var(--radius)",
    fontSize: 13.5,
    color: "var(--ink-2)",
    background: active ? "var(--accent-soft)" : "transparent",
    fontWeight: active ? 500 : 400,
    border: 0,
    cursor: "pointer",
  };

  if (href === undefined) {
    return (
      <button style={style} onClick={onClick} title={label}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href} style={style}>
      {inner}
    </Link>
  );
}
