"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 이 기기에서 알림을 켜고 끈다.
 *
 * 구매 승인처럼 **가족 누구든 한 명이 답하면 되는 일**에 쓴다. 알림이 없으면 승인을 기다리는
 * 동안 앱을 계속 들여다봐야 하므로, 이 기능 없이는 구매 자동화가 뜻이 없다.
 *
 * iOS 는 조건이 하나 더 있다: **홈 화면에 추가한 뒤에야** 푸시를 받는다 (16.4+).
 * Safari 탭에서는 `Notification` 조차 없는 척하므로, 그걸 "지원 안 함"으로 보여 주면
 * 사용자는 뭘 해야 할지 알 수 없다. 그래서 iOS 이면서 홈 화면이 아니면 **설치를 안내한다.**
 */

type State =
  | "checking"
  | "unsupported" // 이 브라우저는 웹 푸시를 못 한다
  | "needs-install" // iOS: 홈 화면에 추가해야 한다
  | "blocked" // 사용자가 거절했다 — 브라우저 설정에서 풀어야 한다
  | "off"
  | "on"
  | "working";

/** iOS·iPadOS 인가. 아이패드는 데스크탑 Safari 로 위장하므로 터치 여부까지 본다. */
function isApple(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** 홈 화면에서 연 상태인가. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari 만 쓰는 옛 방식.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** 사람이 알아볼 기기 이름. 알림을 어디서 켰는지 나중에 구분하려고 남긴다. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua)
    ? "아이폰"
    : /iPad/.test(ua)
      ? "아이패드"
      : /Android/.test(ua)
        ? "안드로이드"
        : /Macintosh/.test(ua)
          ? "맥"
          : "PC";
  const browser = /Edg\//.test(ua)
    ? "엣지"
    : /Chrome\//.test(ua)
      ? "크롬"
      : /Firefox\//.test(ua)
        ? "파이어폭스"
        : /Safari\//.test(ua)
          ? "사파리"
          : "브라우저";
  return `${device} ${browser}`;
}

/**
 * base64url 공개키 → ArrayBuffer. `applicationServerKey` 는 이 모양만 받는다.
 * (Uint8Array 로 돌려주면 타입이 SharedArrayBuffer 까지 열려 있어 맞지 않는다.)
 */
function decodeKey(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

export function NotificationsButton({
  publicKey,
}: {
  publicKey: string | null;
}) {
  const [state, setState] = useState<State>("checking");
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (publicKey === null) {
      setState("unsupported");
      setProblem("서버에 알림 키가 없습니다. 관리자가 VAPID 키를 넣어야 해요.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS 는 홈 화면에 추가하기 전까지 PushManager 를 아예 감춘다.
      setState(isApple() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (!("Notification" in window)) {
      setState(isApple() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }

    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setState(subscription === null ? "off" : "on"))
      .catch(() => setState("off"));
  }, [publicKey]);

  const turnOn = useCallback(async () => {
    if (publicKey === null) return;
    setState("working");
    setProblem(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // 반드시 true — 조용한 푸시는 브라우저가 거부한다.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          label: deviceLabel(),
        }),
      });
      if (!response.ok)
        throw new Error(`서버가 받지 않았습니다 (${response.status})`);

      setState("on");
    } catch (error) {
      setState("off");
      setProblem(
        error instanceof Error ? error.message : "알림을 켜지 못했어요.",
      );
    }
  }, [publicKey]);

  const turnOff = useCallback(async () => {
    setState("working");
    setProblem(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription !== null) {
        // 서버를 먼저 지운다 — 브라우저 구독만 남으면 다시 켤 때 덮어쓰면 되지만,
        // 서버에만 남으면 죽은 곳으로 계속 보내게 된다.
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          {
            method: "DELETE",
          },
        );
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
      setProblem("알림을 끄지 못했어요.");
    }
  }, []);

  if (state === "checking") return null;

  if (state === "needs-install") {
    return (
      <Note>
        아이폰·아이패드는{" "}
        <b style={{ fontWeight: 500 }}>홈 화면에 추가한 뒤에야</b> 알림을 받을
        수 있어요. 위 안내대로 추가하고 홈 화면의 아이콘으로 다시 열어 주세요.
      </Note>
    );
  }

  if (state === "unsupported") {
    return <Note>{problem ?? "이 브라우저는 알림을 지원하지 않아요."}</Note>;
  }

  if (state === "blocked") {
    return (
      <Note>
        알림이 <b style={{ fontWeight: 500 }}>차단</b>돼 있어요. 브라우저
        설정에서 이 사이트의 알림을 허용한 뒤 다시 시도해 주세요.
      </Note>
    );
  }

  const busy = state === "working";
  const on = state === "on";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => void (on ? turnOff() : turnOn())}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 34,
            padding: "0 14px",
            borderRadius: "var(--radius)",
            fontSize: 13.5,
            fontWeight: 500,
            background: on ? "transparent" : "var(--ink)",
            color: on ? "var(--ink-2)" : "var(--paper)",
            border: on ? "1px solid var(--line-strong)" : "none",
            opacity: busy ? 0.55 : 1,
          }}
        >
          {busy ? "잠시만요…" : on ? "알림 끄기" : "알림 켜기"}
        </button>

        {on && <TestButton onProblem={setProblem} />}
      </div>

      <p
        style={{
          fontSize: 12.5,
          lineHeight: 1.7,
          color: "var(--ink-3)",
          marginTop: 8,
        }}
      >
        {on
          ? "이 기기로 알림이 옵니다. 구매 승인처럼 누군가 답해야 하는 일이 생기면 알려 드려요."
          : "구매 승인처럼 누군가 답해야 하는 일을 이 기기로 알려 드립니다."}
      </p>

      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>
          {problem}
        </p>
      )}
    </div>
  );
}

/** 진짜 오는지 한 번 보내 본다. 켜 두기만 하고 확인 못 하면 믿을 수 없다. */
function TestButton({
  onProblem,
}: {
  onProblem: (message: string | null) => void;
}) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <button
      onClick={() => {
        setBusy(true);
        onProblem(null);
        void fetch("/api/push/test", { method: "POST" })
          .then(async (response) => {
            if (!response.ok) {
              const body: unknown = await response.json().catch(() => ({}));
              const message = (body as { error?: unknown }).error;
              throw new Error(
                typeof message === "string" ? message : "보내지 못했어요.",
              );
            }
            setSent(true);
            // 몇 초 뒤 원래대로 — 다시 눌러 볼 수 있게.
            setTimeout(() => setSent(false), 4000);
          })
          .catch((error: unknown) =>
            onProblem(
              error instanceof Error ? error.message : "보내지 못했어요.",
            ),
          )
          .finally(() => setBusy(false));
      }}
      disabled={busy}
      style={{
        height: 34,
        padding: "0 14px",
        borderRadius: "var(--radius)",
        fontSize: 13.5,
        color: "var(--ink-2)",
        border: "1px solid var(--line-strong)",
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy ? "보내는 중…" : sent ? "보냈어요" : "시험 알림"}
    </button>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 13,
        lineHeight: 1.75,
        color: "var(--ink-2)",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}
