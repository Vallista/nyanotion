"use client";

import { useState } from "react";

type Result = "idle" | "working" | "granted" | "refused" | "unsupported";

/**
 * 영구 저장소를 청한다. Safari 17+ 는 알림 권한이 있어야 받아 주므로 먼저 그것부터 묻는다.
 * 실패해도 앱은 돌아간다 — 다만 오래 안 쓰면 오프라인 사본이 지워질 수 있다.
 */
export function PersistStorageButton() {
  const [result, setResult] = useState<Result>("idle");

  async function request() {
    if (typeof navigator === "undefined" || navigator.storage?.persist === undefined) {
      setResult("unsupported");
      return;
    }
    setResult("working");
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      const granted = await navigator.storage.persist();
      setResult(granted ? "granted" : "refused");
    } catch {
      setResult("refused");
    }
  }

  return (
    <div>
      <button
        onClick={() => void request()}
        disabled={result === "working" || result === "granted"}
        style={{
          height: 34,
          padding: "0 14px",
          borderRadius: "var(--radius)",
          background: result === "granted" ? "var(--chip)" : "var(--ink)",
          color: result === "granted" ? "var(--ink-2)" : "var(--paper)",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {result === "granted" ? "보호되고 있어요" : "저장 공간 지켜 달라고 하기"}
      </button>
      {result === "refused" && (
        <p style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-3)" }}>
          브라우저가 받아들이지 않았습니다. 먼저 홈 화면에 추가한 뒤 그 아이콘으로 열어서 다시
          눌러 보세요.
        </p>
      )}
      {result === "unsupported" && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--ink-3)" }}>
          이 브라우저는 이 기능이 없습니다.
        </p>
      )}
    </div>
  );
}
