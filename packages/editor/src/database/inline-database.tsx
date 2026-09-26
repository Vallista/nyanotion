"use client";

import { useCallback, useEffect, useState } from "react";
import { usePorts } from "../context";
import { BoardIcon, CalendarIcon, TableIcon } from "../icons";
import type { DatabaseView, DatabaseViewKind } from "../ports";
import { DatabaseBoard } from "./board";
import { DatabaseCalendar } from "./calendar";
import { DatabaseTable } from "./table";

/**
 * 본문 한 줄에 끼운 데이터베이스.
 *
 * 표의 실체는 모음(collection)이고 블록은 그 id 만 들고 있다 — 노션과 같다. 그래서 같은 표를
 * 여러 문서에 끼워도 한 벌이고, 모음 페이지에서 열어도 같은 것이 보인다.
 *
 * 데이터는 호스트(`ports.database.load`)가 준다. 고치면 그 자리에서 다시 받아 온다 —
 * 페이지 전체를 다시 그리는 것으로는 이 블록 안이 갱신되지 않기 때문이다.
 */
export function InlineDatabase({
  collectionId,
  editable,
  framed = true,
}: {
  collectionId: string;
  editable: boolean;
  /** 본문에 끼울 때는 테두리를 두르고, 모음 페이지에서는 두르지 않는다. */
  framed?: boolean;
}) {
  const ports = usePorts();
  const [data, setData] = useState<DatabaseView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  const load = useCallback(async () => {
    if (collectionId === "") {
      setState("missing");
      return;
    }
    try {
      const found = await ports.database.load(collectionId);
      if (found === null) {
        setState("missing");
        return;
      }
      setData(found);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [collectionId, ports]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <Note>표를 여는 중…</Note>;
  if (state === "missing") return <Note>표를 찾을 수 없어요. 지워졌거나 볼 수 없는 표입니다.</Note>;
  if (state === "failed" || data === null) return <Note>표를 가져오지 못했어요.</Note>;

  const canWrite = editable && data.canWrite;
  const refresh = () => void load();
  const view = data.view;

  /** 뷰는 표에 저장한다 — 에디터 문서를 건드리지 않는다. */
  async function pickView(next: DatabaseViewKind): Promise<void> {
    setData({ ...data!, view: next }); // 먼저 바꿔 보여 주고
    try {
      await ports.database.setView(collectionId, next);
    } catch {
      await load(); // 실패하면 서버 값으로 되돌린다
    }
  }

  return (
    <div
      // 에디터가 이 안의 클릭·타이핑을 블록 조작으로 가로채지 않게 한다.
      contentEditable={false}
      /**
       * **마우스 이벤트를 에디터에 넘기지 않는다.**
       *
       * 넘기면 ProseMirror 가 이 블록을 통째로 고른 상태(NodeSelection)가 되고,
       * 그 뒤에 문단을 눌러도 내부 선택이 그대로 남아 `/` 가 먹히지 않는다 —
       * 슬래시 메뉴는 선택 위치에 글자를 직접 넣는 방식이라 그렇다.
       * `preventDefault` 는 하지 않으므로 안의 단추·입력칸은 평소대로 동작한다.
       */
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        border: framed ? "1px solid var(--line)" : "none",
        borderRadius: framed ? "var(--radius)" : 0,
        padding: framed ? "10px 12px 12px" : 0,
        margin: framed ? "6px 0" : 0,
        background: framed ? "var(--card)" : "transparent",
        // 좁은 화면에서 표가 넓어도 페이지가 통째로 밀리지 않게 — 표는 제 안에서 스크롤한다.
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        {framed ? (
          <ports.Link
            href={ports.hrefForCollection(data.collectionId)}
            style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)", borderBottom: "none" }}
          >
            {data.name}
          </ports.Link>
        ) : (
          <span />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {canWrite && <ViewSwitch current={view} onPick={(next) => void pickView(next)} />}
          <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            줄 {data.rows.length}
          </span>
        </div>
      </div>

      {view === "board" ? (
        <DatabaseBoard view={data} canWrite={canWrite} onChanged={refresh} />
      ) : view === "calendar" ? (
        <DatabaseCalendar view={data} canWrite={canWrite} onChanged={refresh} />
      ) : (
        <DatabaseTable
          collectionId={data.collectionId}
          columns={data.columns}
          rows={data.rows}
          people={data.people}
          canWrite={canWrite}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

const VIEWS: { kind: DatabaseViewKind; label: string; Icon: typeof TableIcon }[] = [
  { kind: "table", label: "표", Icon: TableIcon },
  { kind: "board", label: "보드", Icon: BoardIcon },
  { kind: "calendar", label: "달력", Icon: CalendarIcon },
];

function ViewSwitch({
  current,
  onPick,
}: {
  current: DatabaseViewKind;
  onPick: (next: DatabaseViewKind) => void;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {VIEWS.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          onClick={() => onPick(kind)}
          title={label}
          aria-label={label}
          aria-pressed={kind === current}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "3px 5px",
            borderRadius: "var(--radius-sm)",
            color: kind === current ? "var(--ink)" : "var(--ink-4)",
            background: kind === current ? "var(--surface)" : "transparent",
          }}
        >
          <Icon size={14} />
        </button>
      ))}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      contentEditable={false}
      style={{
        fontSize: 13,
        color: "var(--ink-3)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "12px 14px",
        margin: "6px 0",
      }}
    >
      {children}
    </p>
  );
}
