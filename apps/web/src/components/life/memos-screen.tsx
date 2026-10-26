"use client";

import type { MemoRow } from "@nyanotion/db";
import { useState } from "react";
import { Card, useNarrow } from "../routines/routine-ui";
import { MemoCapture, MemoList, type MemoSpace } from "./memo-box";

/** 메모함 전체 — 위에 적는 칸, 아래에 남은 메모, 맨 아래 끝낸 메모(접힘). */
export function MemosScreen({ open, done, spaces, serverNow }: { open: MemoRow[]; done: MemoRow[]; spaces: MemoSpace[]; serverNow: number }) {
  const narrow = useNarrow();
  const [showDone, setShowDone] = useState(false);
  return (
    <div style={{ flexGrow: 1, overflowY: "auto" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: narrow ? "18px 16px 48px" : "28px 32px 64px", display: "flex", flexDirection: "column", gap: 16 }}>
        <header>
          <h1 style={{ fontSize: narrow ? 22 : 26, fontWeight: 700, letterSpacing: "-0.02em" }}>메모함</h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>
            떠오른 것을 일단 적어 두는 곳 — 나만 봐요. 정리할 때 할 일·문서로 옮기거나 끝냈다고 표시하세요.
          </p>
        </header>
        <Card>
          <MemoCapture autoFocus={narrow === false} />
        </Card>
        <Card title={`남은 메모 ${open.length}`}>
          <MemoList memos={open} spaces={spaces} now={serverNow} />
        </Card>
        {done.length > 0 && (
          <Card>
            <button onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 600, color: "var(--ink-2)" }}>
              {showDone ? "▾" : "▸"} 끝낸 메모 {done.length}
            </button>
            {showDone && <MemoList memos={done} spaces={spaces} now={serverNow} done />}
          </Card>
        )}
      </div>
    </div>
  );
}
