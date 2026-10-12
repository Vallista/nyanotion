/**
 * 체크리스트 시험 — 만들기 → 적기 → 일정·반복 → 체크 → 구매로 넘기기 → 모아 보기 → 폰 화면.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-checklist.mjs
 *
 * 임시 체크리스트를 만들어 쓰고 끝에 모래상자로 보낸다 (구매로 넘긴 살 것은 그 아래 문서라 같이 간다).
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

/** 이 집 시간대로 오늘. 화면이 "오늘"을 그렇게 센다. */
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 950 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

console.log(await signIn(page));

const NAME = `시험 체크리스트 ${Date.now().toString().slice(-6)}`;
const row = (text) => page.locator("li", { hasText: text });

console.log("\n모아 보기");
await page.goto(`${BASE}/lists`, { waitUntil: "networkidle" });
check("사이드바에 체크리스트가 있다", (await page.locator('a[href="/lists"]').count()) > 0);
check("제목이 뜬다", (await page.locator("h1", { hasText: "체크리스트" }).count()) > 0);

console.log("\n나 · 가족으로 나뉜다");
const mine = page.locator('section[aria-label="나 체크리스트"]');
check(
  "나 덩어리가 맨 앞이다",
  (await page.locator("section[aria-label$=' 체크리스트']").first().getAttribute("aria-label")) === "나 체크리스트",
);

console.log("\n만들기 — 원하는 곳에");
await mine.locator('input[aria-label="새 체크리스트 이름"]').fill(NAME);
await mine.getByRole("button", { name: "새 체크리스트" }).click();
const panel = mine.locator("article", { hasText: NAME });
check(
  "만들면 그 덩어리에 바로 생긴다 (자리를 안 옮긴다)",
  await panel.first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false),
);
await panel.locator('input[aria-label="할 일 적기"]').fill("휴지");
await page.keyboard.press("Enter");
check(
  "목록 화면에서 바로 할 일을 적는다",
  await panel.locator("li", { hasText: "휴지" }).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false),
);
await panel.locator("a", { hasText: "열기" }).click();
await page.waitForURL(/\/lists\/[^/]+$/, { timeout: 15000 }).catch(() => {});
const listUrl = page.url();
await page.waitForTimeout(800);
check("이름이 제목으로", (await page.locator("h1").innerText()).includes(NAME));

console.log("\n적기");
await page.locator('input[aria-label="할 일"]').first().fill("우유");
await page.keyboard.press("Enter");
check("Enter 로 적힌다", await row("우유").first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false));

await page.locator("button", { hasText: "날짜" }).first().click();
await page.locator('input[aria-label="날짜"]').first().fill(today);
await page.locator('input[aria-label="시간"]').first().fill("23:59");
await page.locator('select[aria-label="반복"]').first().selectOption("weekly");
await page.locator('input[aria-label="할 일"]').first().fill("분리수거");
await page.getByRole("button", { name: "적기", exact: true }).click();
await row("분리수거").first().waitFor({ timeout: 10000 }).catch(() => {});
const recycle = await row("분리수거").first().innerText();
check("오늘 · 시간이 보인다", recycle.includes("오늘 23:59"), recycle);
check("반복이 보인다", recycle.includes("매주"), recycle);

console.log("\n체크 (반복)");
await row("분리수거").first().locator('button[aria-label="했음"]').click();
await page.waitForTimeout(2000);
const openRecycle = page.locator("ul").first().locator("li", { hasText: "분리수거" });
check("다음 주 항목이 새로 생긴다", (await openRecycle.count()) === 1, await openRecycle.count());
const nextText = (await openRecycle.first().innerText().catch(() => "")) ?? "";
check("새 항목은 오늘이 아니다", !nextText.includes("오늘"), nextText);
const doneToggle = page.locator("button", { hasText: "한 것 1" });
check("한 것 1 로 내려간다", (await doneToggle.count()) === 1);

console.log("\n사기");
await row("우유").first().locator('button[aria-label="더 보기"]').click();
await page.waitForTimeout(400);
const naver = await page.locator("a", { hasText: "네이버에서 보기" }).first().getAttribute("href");
const coupang = await page.locator("a", { hasText: "쿠팡에서 보기" }).first().getAttribute("href");
check("네이버 쇼핑 검색으로", naver === `https://search.shopping.naver.com/search/all?query=${encodeURIComponent("우유")}`, naver);
check("쿠팡 검색으로", coupang === `https://www.coupang.com/np/search?q=${encodeURIComponent("우유")}`, coupang);
check(
  "새 탭으로 연다",
  (await page.locator("a", { hasText: "네이버에서 보기" }).first().getAttribute("target")) === "_blank",
);
await page.locator('input[aria-label="가격 한도"]').fill("5000");
await page.locator("button", { hasText: "구매로 넘기기" }).click();
await page.waitForTimeout(2200);
const milk = await row("우유").first().innerText();
check("값 찾는 중으로 바뀐다", milk.includes("값 찾는 중"), milk);

await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
const card = page.locator("article", { hasText: "우유" }).first();
const cardText = (await card.innerText().catch(() => "")) ?? "";
check("살 것에 올라온다 (찾는 중 · 한도)", cardText.includes("찾는 중") && cardText.includes("5,000원"), cardText.slice(0, 120));

console.log("\n모아 보기의 일정");
await page.goto(`${BASE}/lists`, { waitUntil: "networkidle" });
const panelText = await mine.locator("article", { hasText: NAME }).first().innerText().catch(() => "");
check("체크리스트 칸에 다음 분리수거가 보인다", panelText.includes("분리수거"), panelText.slice(0, 160));
check("목록 칸이 있다", (await page.locator("a", { hasText: NAME }).count()) > 0);

console.log("\n문서 화면");
await page.goto(listUrl, { waitUntil: "networkidle" });
await page.locator("a", { hasText: "메모 열기" }).click();
await page.waitForURL(/\/d\//, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
check("문서에서 체크리스트로 돌아갈 길이 있다", (await page.locator("a", { hasText: "체크리스트 항목 보기" }).count()) === 1);

console.log("\n탑바의 … 메뉴");
await page.locator('button[aria-label="더 보기"]').first().click();
const docTrash = page.locator("button", { hasText: "모래상자로 보내기" }).first();
const tb = await docTrash.boundingBox().catch(() => null);
// 보이기만 하는 게 아니라 **그 자리에서 눌리는가** — 잘리거나 다른 것에 덮이면 거기 있는 건 다른 요소다.
const onTop =
  tb === null
    ? ""
    : await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
        [tb.x + tb.width / 2, tb.y + tb.height / 2],
      );
check("**문서의 … 를 누르면 메뉴가 잘리지 않고 위에 뜬다**", onTop.includes("모래상자로"), JSON.stringify(tb));

console.log("\n폰 화면");
{
  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.context().addCookies(await page.context().cookies());
  await phone.goto(listUrl, { waitUntil: "networkidle" });
  await phone.waitForTimeout(1000);
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("가로로 넘치지 않는다", overflow <= 0, overflow);
  await phone.screenshot({ path: "apps/web/scripts/e-checklist-phone.png", fullPage: true });
  await phone.close();
}
await page.goto(listUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: "apps/web/scripts/e-checklist.png", fullPage: true });

console.log("\n체크리스트 … — 이름 바꾸기 · 모래상자로");
await page.goto(listUrl, { waitUntil: "networkidle" });
const RENAMED = `${NAME} 바꿈`;
page.once("dialog", (d) => d.accept(RENAMED));
await page.locator('button[aria-label="체크리스트 메뉴"]').click();
await page.getByRole("menuitem", { name: "이름 바꾸기" }).click();
await page.waitForTimeout(1800);
check("이름이 바뀐다", (await page.locator("h1").innerText()).includes(RENAMED));
page.once("dialog", (d) => d.accept());
await page.locator('button[aria-label="체크리스트 메뉴"]').click();
await page.getByRole("menuitem", { name: "모래상자로 보내기" }).click();
await page.waitForURL(/\/lists$/, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1000);
check("모래상자로 보내면 목록에서 빠진다", (await page.locator("a", { hasText: NAME }).count()) === 0);
const gone = await page.goto(listUrl, { waitUntil: "networkidle" });
check("보낸 체크리스트는 주소로도 안 열린다", gone?.status() === 404, gone?.status());

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (errors.length > 0) {
  console.log("\n콘솔 오류:");
  for (const e of errors.slice(0, 6)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
