"use client";

import { useEffect, useState } from "react";
import { SidebarIcon } from "./icons";

/**
 * 사이드바 + 본문. 좁은 화면(폰)에서는 사이드바가 드로어로 덮는다 —
 * CLAUDE.md 규칙: 모바일 Safari 기준으로 만든다.
 */
export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // 드로어가 열린 상태로 화면을 넓히면 닫는다.
  useEffect(() => {
    if (!narrow) setDrawerOpen(false);
  }, [narrow]);

  return (
    <div style={{ display: "flex", height: "100dvh", overflow: "hidden" }}>
      {!narrow && sidebar}

      {narrow && drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(47,46,43,0.28)",
              zIndex: 40,
            }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              zIndex: 41,
              boxShadow: "var(--shadow-float)",
            }}
            onClick={(e) => {
              // 문서를 고르면 드로어를 닫는다.
              if ((e.target as HTMLElement).closest("a") !== null) setDrawerOpen(false);
            }}
          >
            {sidebar}
          </div>
        </>
      )}

      <main
        style={{
          flexGrow: 1,
          minWidth: 0,
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {narrow && (
          <button
            aria-label="문서 트리 열기"
            onClick={() => setDrawerOpen(true)}
            style={{
              position: "absolute",
              left: 10,
              top: 9,
              zIndex: 30,
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius)",
              color: "var(--ink-2)",
              background: "var(--paper)",
            }}
          >
            <SidebarIcon />
          </button>
        )}
        {children}
      </main>
    </div>
  );
}
