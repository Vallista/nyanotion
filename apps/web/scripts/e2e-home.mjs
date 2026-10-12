/**
 * 첫 화면(캣타워) 시험 — 내 체크리스트 카드에서 바로 적기 · 오늘 · 체크 · 지우기, 그리고 폰 화면.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-home.mjs
 *
 * 적은 시험 항목은 끝에 지운다 (체크한 것은 그 체크리스트의 "한 것"에 남는다).
 */
import { chromium, devices } from "playwright";
import { BASE, signIn } from "./lib.mjs";

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${detail}`}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

console.log(await signIn(page));
const stamp = Date.now().toString().slice(-6);
const TODAY_ITEM = `시험 우유 ${stamp}`;
const PLAIN_ITEM = `시험 빨래 ${stamp}`;
const mine = () => page.locator('section[aria-label="내 체크리스트"]');
const row = (text) => mine().locator("li", { hasText: text });

console.log("\n첫 화면");
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
check("내 체크리스트 카드가 있다", (await mine().count()) === 1);
const firstCard = await page.locator("section[aria-label$='체크리스트']").first().getAttribute("aria-label");
check("내 체크리스트가 맨 앞이다", firstCard === "내 체크리스트", firstCard);
const navOrder = await page.locator("nav a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
check(
  "사이드바에서 체크리스트가 캣타워 바로 밑",
  navOrder.indexOf("/lists") === navOrder.indexOf("/") + 1,
  navOrder.slice(0, 4).join(" "),
);

console.log("\n바로 적기");
await mine().locator('input[aria-label="할 일 적기"]').fill(PLAIN_ITEM);
await page.keyboard.press("Enter");
check("Enter 로 적힌다", await row(PLAIN_ITEM).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false));

await mine().locator('input[aria-label="할 일 적기"]').fill(TODAY_ITEM);
await mine().getByRole("button", { name: "오늘" }).click();
await mine().getByRole("button", { name: "적기" }).click();
await row(TODAY_ITEM).first().waitFor({ timeout: 10000 }).catch(() => {});
const todayText = await row(TODAY_ITEM).first().innerText().catch(() => "");
check("'오늘' 을 누르면 오늘 할 일로", todayText.includes("오늘"), todayText);
const order = await mine().locator("li").allInnerTexts();
check(
  "날짜 있는 것이 위로",
  order.findIndex((t) => t.includes(TODAY_ITEM)) < order.findIndex((t) => t.includes(PLAIN_ITEM)),
);
check("머리말에 오늘 수가 보인다", (await mine().locator("header").innerText()).includes("오늘"));

console.log("\n체크");
await row(TODAY_ITEM).first().locator('button[aria-label="했음"]').click();
await page.waitForTimeout(2000);
await page.reload({ waitUntil: "networkidle" });
check("체크하면 첫 화면에서 빠진다", (await row(TODAY_ITEM).count()) === 0);

console.log("\n지우기");
page.once("dialog", (d) => d.accept());
await row(PLAIN_ITEM).first().locator('button[aria-label="더 보기"]').click();
await row(PLAIN_ITEM).first().getByRole("button", { name: "지우기" }).click();
await page.waitForTimeout(2000);
check("지운 것은 사라진다", (await row(PLAIN_ITEM).count()) === 0);

console.log("\n폰 화면");
{
  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.context().addCookies(await page.context().cookies());
  await phone.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("가로로 넘치지 않는다", overflow <= 0, overflow);
  const box = await phone.locator('section[aria-label="내 체크리스트"]').boundingBox();
  check("카드가 첫 화면 안에 보인다", box !== null && box.y < 500, JSON.stringify(box));
  await phone.screenshot({ path: "apps/web/scripts/e-home-phone.png" });
}
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.screenshot({ path: "apps/web/scripts/e-home.png" });

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (errors.length > 0) {
  console.log("\n페이지 오류:");
  for (const e of errors.slice(0, 6)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
