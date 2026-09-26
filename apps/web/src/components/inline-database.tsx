"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DatabaseView } from "@/lib/collection-view";
import { DatabaseTable } from "./database-table";

/**
 * 본문 한 줄에 끼운 데이터베이스.
 *
 * 표의 실체는 `collection` 이고 블록은 그 id 만 들고 있다 — 노션과 같다. 그래서 같은 표를
 * 여러 문서에 끼워도 한 벌이고, 모음 페이지(`/c/[id]`)에서 열어도 같은 것이 보인다.
 *
 * 문서 페이지는 서버 컴포넌트지만 에디터 블록은 브라우저에서 그려지므로 데이터를 직접 받아 온다.
 * 표를 고치면 서버 액션이 돌고, `onChanged` 로 다시 받아 온다.
 */
export function InlineDatabase({
  collectionId,
  editable,
}: {
  collectionId: string;
  editable: boolean;
}) {
  const [view, setView] = useState<DatabaseView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");

  const load = useCallback(async () => {
    if (collectionId === "") {
      setState("missing");
      return;
    }
    try {
      const response = await fetch(`/api/collection/${encodeURIComponent(collectionId)}`, {
        cache: "no-store",
      });
      if (response.status === 404) {
        setState("missing");
        return;
      }
      if (!response.ok) {
        setState("failed");
        return;
      }
      setView((await response.json()) as DatabaseView);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") return <Note>표를 여는 중…</Note>;
  if (state === "missing") return <Note>표를 찾을 수 없어요. 지워졌거나 볼 수 없는 표입니다.</Note>;
  if (state === "failed" || view === null) return <Note>표를 가져오지 못했어요.</Note>;

  return (
    <div
      // 에디터가 이 안의 클릭·타이핑을 블록 조작으로 가로채지 않게 한다.
      contentEditable={false}
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "10px 12px 12px",
        margin: "6px 0",
        background: "var(--card)",
        // 좁은 화면에서 표가 넓어도 페이지가 통째로 밀리지 않게 — 표는 제 안에서 스크롤한다.
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <Link
          href={`/c/${view.collectionId}`}
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--ink)",
            borderBottom: "none",
          }}
        >
          {view.name}
        </Link>
        <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          줄 {view.rows.length} · 속성 {view.columns.length}
        </span>
      </div>

      <DatabaseTable
        collectionId={view.collectionId}
        columns={view.columns}
        rows={view.rows}
        people={view.people}
        canWrite={editable && view.canWrite}
        onChanged={() => void load()}
      />
    </div>
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
