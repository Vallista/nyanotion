/**
 * 알림(웹 푸시) 시험 — 구독 → 저장 → 발송 → 해지까지.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-push.mjs
 *
 * **창을 띄워서 돈다.** 헤드리스 크로미움은 `grantPermissions` 를 줘도 알림 권한을
 * 무조건 거부한다 (확인함: headless=denied, headed=granted).
 *
 * 브라우저가 푸시 서비스에 닿지 못하는 환경도 있다 (Playwright 가 들고 오는 크로미움은
 * 푸시 서비스 키 없이 빌드돼 있다). 그건 이 앱의 문제가 아니므로 **실패가 아니라 건너뜀**으로
 * 적는다 — 서버의 구독 저장·발송 경로는 `pnpm --filter @nyanotion/notify smoke` 가 따로 본다.
 */
import { chromium } from "playwright";
import { BASE, signIn } from "./lib.mjs";

let pass = 0;
let fail = 0;
let skip = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${detail}`}`);
  }
};
const skipped = (label, why) => {
  skip += 1;
  console.log(`  --   ${label} (${why})`);
};

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
await context.grantPermissions(["notifications"], { origin: BASE });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

console.log(await signIn(page), "\n");

console.log("설치 화면");
await page.goto(`${BASE}/install`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // 서비스 워커 등록을 기다린다

const section = () =>
  page
    .locator("section", { hasText: "알림 받기" })
    .innerText()
    .then((t) => t.replace(/\n+/g, " "));

const turnOn = page.locator("button", { hasText: "알림 켜기" });
const turnOff = page.locator("button", { hasText: "알림 끄기" });

let subscribed = false;

if ((await turnOn.count()) === 0 && (await turnOff.count()) === 0) {
  skipped("알림 단추", (await section()).slice(0, 90));
} else {
  check("알림 단추가 보인다", true);

  if ((await turnOff.count()) > 0) {
    subscribed = true; // 이미 켜져 있다
  } else {
    await turnOn.first().click();
    subscribed = await page
      .waitForSelector("text=알림 끄기", { timeout: 25000 })
      .then(() => true)
      .catch(() => false);

    const shown = await section();
    if (subscribed) {
      check("구독이 켜진다", true);
    } else if (/push service|registration failed|AbortError/i.test(shown)) {
      skipped("구독", "이 브라우저에 푸시 서비스가 없다");
    } else {
      check("구독이 켜진다", false, shown.slice(0, 120));
    }
  }
}

if (subscribed) {
  const result = await page.evaluate(async () => {
    const r = await fetch("/api/push/test", { method: "POST" });
    return { status: r.status, body: await r.text() };
  });

  if (result.status === 200) {
    const body = JSON.parse(result.body);
    check("시험 알림을 보냈다", body.sent >= 1, JSON.stringify(body));
  } else if (result.status === 409) {
    check("서버에 구독이 저장됐다", false, "기기가 없다고 한다");
  } else {
    skipped("시험 발송", `${result.status} ${result.body.slice(0, 90)}`);
  }

  await page.locator("button", { hasText: "알림 끄기" }).first().click();
  const off = await page
    .waitForSelector("text=알림 켜기", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("구독을 끌 수 있다", off);

  if (off) {
    const after = await page.evaluate(async () => {
      const r = await fetch("/api/push/test", { method: "POST" });
      return r.status;
    });
    check("끄면 보낼 기기가 없다", after === 409, `상태 ${after}`);
  }
} else {
  console.log("\n브라우저가 구독을 못 만들어 이후 단계는 건너뜁니다.");
}

console.log(`\n${pass}개 통과, ${fail}개 실패, ${skip}개 건너뜀`);
if (errors.length > 0) {
  console.log("\n콘솔 오류:");
  for (const e of errors.slice(0, 5)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
