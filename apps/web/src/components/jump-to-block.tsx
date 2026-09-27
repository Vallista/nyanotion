"use client";

import { useEffect } from "react";

/**
 * `#block-<id>` 로 들어오면 그 블록까지 데려가서 잠깐 표시해 준다.
 * 근거 링크(`/ask`)가 쓴다.
 *
 * **에디터가 뜬 뒤에야 찾을 수 있다.** BlockNote 는 클라이언트에서만 렌더되고, Yjs 가 붙는 데
 * 시간이 걸린다 — 집 서버가 게임과 모델을 같이 돌리고 있으면 몇 초가 더 걸린다. 그래서
 * 정해진 시간만 기다리지 않고 **블록이 생기는 것을 지켜본다**(MutationObserver).
 * 그래도 안 나타나면 조용히 포기한다 — 문서 맨 위에 있는 것이 아무 일도 안 하는 것보다 낫다.
 */

const PREFIX = "#block-";
const GIVE_UP_MS = 30_000;
const FLASH_MS = 1800;

export function JumpToBlock() {
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let giveUp: ReturnType<typeof setTimeout> | null = null;
    let flash: ReturnType<typeof setTimeout> | null = null;
    let marked: HTMLElement | null = null;

    const stopWatching = () => {
      observer?.disconnect();
      observer = null;
      if (giveUp !== null) clearTimeout(giveUp);
      giveUp = null;
    };

    const go = () => {
      stopWatching();
      const hash = window.location.hash;
      if (!hash.startsWith(PREFIX)) return;
      const id = decodeURIComponent(hash.slice(PREFIX.length));
      if (id === "") return;

      const reveal = (target: HTMLElement) => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        if (marked !== null && marked !== target) marked.classList.remove("block-flash");
        target.classList.add("block-flash");
        marked = target;
        if (flash !== null) clearTimeout(flash);
        flash = setTimeout(() => {
          target.classList.remove("block-flash");
          if (marked === target) marked = null;
        }, FLASH_MS);
      };

      // BlockNote 는 블록 바깥 요소에 data-id 를 단다.
      const find = (): HTMLElement | null =>
        document.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);

      const now = find();
      if (now !== null) {
        reveal(now);
        return;
      }

      observer = new MutationObserver(() => {
        const later = find();
        if (later === null) return;
        stopWatching();
        reveal(later);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      giveUp = setTimeout(stopWatching, GIVE_UP_MS);
    };

    go();
    window.addEventListener("hashchange", go);
    return () => {
      window.removeEventListener("hashchange", go);
      stopWatching();
      if (flash !== null) clearTimeout(flash);
      if (marked !== null) marked.classList.remove("block-flash");
    };
  }, []);

  return null;
}
