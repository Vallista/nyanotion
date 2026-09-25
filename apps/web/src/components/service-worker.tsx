"use client";

import { useEffect } from "react";

/**
 * 서비스 워커를 등록하고, 조용히 영구 저장소를 한 번 청해 본다.
 *
 * Safari 는 오래 안 쓴 사이트의 저장소를 지운다. 그러면 **오프라인에서 쓴 글이 날아간다** —
 * 이 앱에서는 그게 가장 큰 사고다. `navigator.storage.persist()` 로 보호를 요청하는데,
 * 홈 화면에 추가돼 있거나 알림 권한이 있으면 조용히 통과한다. 아니면 /install 에서 다시 청한다.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // HTTPS 가 아니거나 막힌 환경 — 앱은 그대로 돌아간다.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    void navigator.storage?.persist?.().catch(() => false);
  }, []);

  return null;
}
