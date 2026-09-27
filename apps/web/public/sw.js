/*
 * Nyanotion 서비스 워커.
 *
 * 목적은 딱 둘이다: (1) 서버가 꺼져 있어도 앱 껍데기가 뜨게 하고, (2) 정적 파일을 아껴 받는 것.
 * **문서 내용은 여기서 캐시하지 않는다** — 그건 Yjs 가 IndexedDB 에 들고 있다.
 *
 * 건드리면 안 되는 것: /api/* (인증·표) 는 절대 캐시하지 않는다. 오래된 표를 돌려주면
 * 동기화가 조용히 실패한다.
 */
const VERSION = "v2";
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

/* ── 알림 ──────────────────────────────────────────────────────────────────
 * 서버가 보낸 것을 그대로 띄운다. 모양은 packages/notify 의 `Notification` 타입이다.
 *
 * `tag` 가 같은 알림은 **먼저 온 것을 대체한다.** 구매 승인처럼 "가족 누구든 한 명이
 * 답하면 되는" 일에서, 한 사람이 답한 뒤 다른 기기에 남은 알림이 새 내용으로 바뀐다.
 *
 * 내용을 못 읽어도 **무언가는 띄운다.** 조용히 넘어가면 사용자는 알림이 온 줄도 모르고,
 * 일부 브라우저는 push 를 받고 알림을 안 띄우면 구독을 끊어 버린다.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = typeof data.title === "string" && data.title !== "" ? data.title : "Nyanotion";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    tag: typeof data.tag === "string" && data.tag !== "" ? data.tag : "nyanotion",
    // 같은 tag 라도 새 내용이면 한 번 더 알린다 — 승인 결과를 놓치면 안 된다.
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: typeof data.url === "string" ? data.url : "/", kind: data.kind ?? "" },
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * 알림을 누르면 **이미 열린 창이 있으면 그리로 옮기고**, 없을 때만 새로 연다.
 * 폰에서 누를 때마다 창이 쌓이면 금세 쓸 수 없게 된다.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url ?? "/", self.location.origin);
  // 단추를 누른 경우 그 값을 주소에 실어 보낸다 — 화면이 열리면서 바로 처리한다.
  if (event.action) target.searchParams.set("action", event.action);

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin && "focus" in client) {
          return client.navigate(target.href).then((c) => (c ?? client).focus());
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

/**
 * 푸시 서비스가 구독을 갈아 끼울 때가 있다. 그냥 두면 그 기기는 조용히 알림을 못 받는다.
 * 새 구독을 서버에 다시 등록한다.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
      if (!applicationServerKey) return;
      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: fresh.toJSON(), label: "" }),
      });
    })(),
  );
});
