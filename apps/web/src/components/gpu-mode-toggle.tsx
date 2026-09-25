"use client";

import { useState, useTransition } from "react";
import { setGpuModeAction } from "@/lib/actions";
import { CatMark } from "./cat-mark";

/**
 * 집 한 대의 공용 스위치. 게임을 켤 때 넘기면 냥이가 VRAM 에서 비켜난다.
 * 상태는 색이 아니라 문구로 말한다 — 시안 09.
 */
export function GpuModeToggle({ mode, reachable }: { mode: "free" | "gaming"; reachable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(mode);
  const gaming = optimistic === "gaming";

  return (
    <button
      onClick={() => {
        const next = gaming ? "free" : "gaming";
        setOptimistic(next);
        startTransition(() => void setGpuModeAction(next));
      }}
      disabled={pending}
      title={
        gaming
          ? "게임이 그래픽카드를 쓰는 중입니다. 눌러서 냥이를 다시 부릅니다."
          : "게임을 켤 때 누르면 냥이가 그래픽카드에서 비켜납니다."
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        height: 28,
        padding: "0 6px 0 8px",
        borderRadius: "var(--radius)",
        fontSize: 12.5,
        color: "var(--ink-3)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span style={{ display: "flex", color: gaming ? "var(--ink-4)" : "var(--accent)" }}>
        <CatMark size={14} color="currentColor" />
      </span>
      <span
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {gaming ? "냥이는 잠시 후" : reachable ? "냥이 대기 중" : "냥이 꺼짐"}
      </span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>
        {gaming ? "게임 중" : "켜짐"}
      </span>
    </button>
  );
}
