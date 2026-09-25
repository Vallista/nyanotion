/*
 * Nyanotion 서비스 워커.
 *
 * 목적은 딱 둘이다: (1) 서버가 꺼져 있어도 앱 껍데기가 뜨게 하고, (2) 정적 파일을 아껴 받는 것.
 * **문서 내용은 여기서 캐시하지 않는다** — 그건 Yjs 가 IndexedDB 에 들고 있다.
 *
 * 건드리면 안 되는 것: /api/* (인증·표) 는 절대 캐시하지 않는다. 오래된 표를 돌려주면
 * 동기화가 조용히 실패한다.
 */
const VERSION = "v1";
const SHELL = `nyanotion-shell-${VERSION}`;
const ASSETS = `nyanotion-assets-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // 인증·표·서버 액션은 손대지 않는다.
  if (url.pathname.startsWith("/api/")) return;

  // 정적 파일: 해시가 박혀 있으므로 캐시 먼저.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // 화면 이동: 네트워크 먼저, 안 되면 마지막으로 받아 둔 것, 그것도 없으면 오프라인 안내.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match(OFFLINE_URL))
            .then((hit) => hit ?? Response.error()),
        ),
    );
  }
});
