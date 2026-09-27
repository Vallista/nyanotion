/**
 * 알림 보내기 경로 점검.
 *
 *   pnpm --filter @nyanotion/notify smoke
 *
 * 브라우저 없이 서버 쪽만 본다. 진짜 기기가 없으므로 **가짜 구독**을 넣고 보내 본다 —
 * 푸시 서비스가 404 를 주면 그 줄이 지워져야 한다. 그 정리 경로가 이 기능에서 가장 조용히
 * 망가지는 곳이다 (죽은 구독이 쌓이면 보낼 때마다 헛일을 한다).
 *
 * Playwright 의 크로미움에는 푸시 서비스가 없어서 브라우저 쪽 e2e 로는 여기까지 못 온다.
 */
import { createECDH, randomBytes } from "node:crypto";
import { db, removeSubscription, saveSubscription, subscriptionsOf, user } from "@nyanotion/db";
import { pushConfigured, publicKey, sendToUser } from "../src/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

/** 브라우저가 주는 것과 같은 모양의 키 한 쌍. web-push 가 길이를 확인하므로 진짜여야 한다. */
function fakeKeys(): { p256dh: string; auth: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}

async function main(): Promise<void> {
  console.log("설정");
  check("VAPID 키가 있다", pushConfigured());
  check("공개키를 읽을 수 있다", (publicKey() ?? "").length > 20);
  if (!pushConfigured()) {
    console.log("\n키가 없어 더 못 봅니다. `pnpm --filter @nyanotion/notify keys` 참고.");
    process.exitCode = 1;
    return;
  }

  const owner = (await db.select({ id: user.id }).from(user).limit(1))[0];
  if (owner === undefined) throw new Error("계정이 없습니다. 먼저 첫 계정을 만드세요.");

  // 이 사람에게 이미 켜 둔 기기가 있으면 그건 건드리지 않는다.
  const before = await subscriptionsOf([owner.id]);
  const endpoint = `https://fcm.googleapis.com/fcm/send/nyanotion-smoke-${randomBytes(8).toString("hex")}`;

  try {
    console.log("\n기기가 없을 때");
    if (before.length === 0) {
      const empty = await sendToUser(owner.id, {
        title: "t",
        body: "b",
        url: "/",
        tag: "smoke",
        kind: "test",
      });
      check("보낼 기기가 없다고 알려 준다", empty.noDevices && empty.sent === 0, empty);
    } else {
      console.log(`  --   건너뜀 (이미 켜 둔 기기 ${before.length}대가 있습니다)`);
    }

    console.log("\n구독 저장");
    await saveSubscription({ endpoint, userId: owner.id, ...fakeKeys(), label: "스모크" });
    const saved = await subscriptionsOf([owner.id]);
    check("구독이 저장된다", saved.some((s) => s.endpoint === endpoint));

    console.log("\n죽은 구독 정리");
    const result = await sendToUser(owner.id, {
      title: "Nyanotion 점검",
      body: "가짜 구독입니다 — 푸시 서비스가 거절해야 정상입니다.",
      url: "/",
      tag: "smoke",
      kind: "test",
    });

    const left = await subscriptionsOf([owner.id]);
    const gone = !left.some((s) => s.endpoint === endpoint);

    if (result.pruned > 0 && gone) {
      check("404/410 을 받은 구독이 지워진다", true);
    } else if (gone) {
      check("죽은 구독이 지워진다", true);
    } else {
      // 망이 막혀 있으면 404 가 아니라 타임아웃이 난다 — 그건 일시적 문제라 남기는 게 맞다.
      console.log(
        `  --   푸시 서비스에 닿지 못한 듯합니다 (보냄 ${result.sent}, 지움 ${result.pruned}). 구독은 남겨 둡니다.`,
      );
    }

    // 남아 있으면 직접 치운다 — 점검이 찌꺼기를 남기면 안 된다.
    if (!gone) await removeSubscription(endpoint);
    check("점검이 남긴 구독이 없다", !(await subscriptionsOf([owner.id])).some((s) => s.endpoint === endpoint));
  } finally {
    await removeSubscription(endpoint);
  }

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
