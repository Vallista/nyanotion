"use client";

import { useState, useTransition } from "react";

/**
 * 서버에 다녀오는 동안 버튼 자리에 띄우는 작은 원. 글자색(currentColor)을 따라가므로
 * 어두운 버튼·옅은 버튼 어디에 넣어도 맞는다. 모양은 globals.css 의 `.spinner`.
 */
export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      className="spinner"
      role="status"
      aria-label="처리 중"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * 서버 액션을 부르고 **끝날 때까지** 대기 상태를 들고 있는다.
 *
 * `startTransition(() => void action())` 은 콜백이 곧바로 끝나서 대기 상태가 한 번도 켜지지
 * 않는다 — 프로미스를 기다려야 한다. 한 컴포넌트에 버튼이 여럿이면 열쇠로 어느 것을
 * 눌렀는지 구분해서 **누른 버튼에만** 원을 띄운다.
 *
 * 액션이 던진 오류는 콘솔로만 보낸다 (전에 `void` 로 버리던 것과 같다) — 화면을 깨지 않는다.
 */
export function usePending() {
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  function run(which: string, action: () => Promise<unknown>) {
    setKey(which);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        console.error(error);
      }
    });
  }

  return {
    /** 무엇이든 돌고 있나 — 버튼을 막을 때. */
    pending,
    /** 이 열쇠의 일이 돌고 있나 — 원을 띄울 때. */
    busy: (which: string) => pending && key === which,
    run,
  };
}
