"use client";

import { createContext, useContext } from "react";
import type { EditorPorts } from "./ports";

/**
 * 호스트가 채운 구멍을 트리 아래로 내린다.
 *
 * props 로 줄줄이 내리지 않는 이유: 표 안의 셀, 셀 안의 메뉴처럼 깊은 자리에서 쓰고,
 * BlockNote 의 블록 렌더는 우리가 트리를 직접 못 짜기 때문이다 (그쪽이 호출한다).
 */
const PortsContext = createContext<EditorPorts | null>(null);

export function PortsProvider({
  ports,
  children,
}: {
  ports: EditorPorts;
  children: React.ReactNode;
}) {
  return <PortsContext.Provider value={ports}>{children}</PortsContext.Provider>;
}

export function usePorts(): EditorPorts {
  const ports = useContext(PortsContext);
  if (ports === null) {
    throw new Error("<NyanotionEditor> 밖에서 에디터 부품을 썼습니다 — ports 가 없습니다.");
  }
  return ports;
}

/** 제목이 비어 있을 때 보여 줄 말. 앱의 `lib/tree.ts` 와 같은 값이어야 한다. */
export const UNTITLED = "제목 없음";

export function displayTitle(title: string): string {
  return title.trim() === "" ? UNTITLED : title;
}
