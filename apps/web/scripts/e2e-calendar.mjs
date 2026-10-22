/**
 * 첫 화면(캘린더) 시험 — 백로그에 적기 · 놓기로 칸에 놓기 · 끌어다 놓기 · 칸끼리 옮기기 ·
 * 빈 칸에 반복 할 일 · 달 보기의 앞날 · 백로그로 되돌리기 · 체크, 그리고 폰(하루 보기 · 백로그 서랍).
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-calendar.mjs
 *
 * 2주 뒤의 주에 시험 할 일을 만들고 끝에 지운다. 구독한 캘린더에는 손대지 않는다.
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

function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const anchor = addDays(today, 14);

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1360, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

console.log(await signIn(page));
const stamp = Date.now().toString().slice(-6);
const BOOK = `시험 책 반납 ${stamp}`;
const PAPER = `시험 서류 ${stamp}`;
const PLANT = `시험 화분 ${stamp}`;
const PHONE = `시험 폰 ${stamp}`;

const aside = () => page.locator('aside[aria-label="백로그"]');
const backlogRow = (text) => aside().locator("li", { hasText: text });
const col = (day) => page.locator(`main div[data-day="${day}"]:not([data-allday])`);
const block = (day, text) => col(day).locator("[role=button]", { hasText: text });
/** 서버 동작 → 새로 그리기를 기다린다. 정해 둔 시간만 쉬면 dev 서버가 처음 컴파일할 때 엇갈린다. */
async function until(condition, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await condition().catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function addToBacklog(title) {
  await aside().locator('input[aria-label="백로그에 적기"]').fill(title);
  await page.keyboard.press("Enter");
  await backlogRow(title).first().waitFor({ timeout: 10000 }).catch(() => {});
}

console.log("\n첫 화면");
await page.goto(`${BASE}/?view=week&d=${anchor}`, { waitUntil: "networkidle" });
const days = await page.locator("main div[data-day]:not([data-allday])").evaluateAll((els) => els.map((e) => e.dataset.day));
check("일주일 칸 7개, 일요일부터", days.length === 7 && new Date(`${days[0]}T00:00:00Z`).getUTCDay() === 0, days.join());
const [, mon, , wed, thu, fri] = days;
const navOrder = await page.locator("nav a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
check("사이드바 맨 위가 체크리스트(캘린더), 그 밑이 모든 체크리스트", navOrder[0] === "/" && navOrder[1] === "/lists", navOrder.slice(0, 4).join(" "));
check(
  "구매하기는 체크리스트 밑 갈래 — 백로그·이미 구매한 것이 그 아래",
  navOrder.indexOf("/buy") === 2 && navOrder.indexOf("/buy/done") === 3,
  navOrder.slice(0, 5).join(" "),
);

console.log("\n백로그 → 놓기 → 칸");
await addToBacklog(BOOK);
check("백로그에 적힌다", (await backlogRow(BOOK).count()) === 1);
await backlogRow(BOOK).getByRole("button", { name: "놓기" }).click();
check("놓을 칸을 누르라는 안내", await page.getByText("을 놓을 칸을 누르세요").isVisible());
await col(wed).click({ position: { x: 20, y: 14 * 48 + 10 } });
check("수요일 14:00 에 놓인다 (기본 1시간)", await until(async () => (await block(wed, BOOK).innerText()).includes("14:00–15:00")));
check("백로그에서 빠진다", await until(async () => (await backlogRow(BOOK).count()) === 0));

console.log("\n끌어다 놓기");
await addToBacklog(PAPER);
await backlogRow(PAPER).dragTo(col(thu), { targetPosition: { x: 30, y: 10 * 48 + 10 } });
check("목요일 10:00 으로", await until(async () => (await block(thu, PAPER).innerText()).includes("10:00")));
await block(thu, PAPER).dragTo(col(fri), { targetPosition: { x: 30, y: 16 * 48 + 5 } });
check(
  "칸에 있던 것을 금요일 16:00 으로 옮긴다",
  await until(async () => (await block(fri, PAPER).count()) === 1 && (await block(thu, PAPER).count()) === 0),
);

console.log("\n빈 칸에 반복 할 일");
// 이른 새벽 칸 — 사람이 쓰는 반복 할 일과 부딪히지 않게.
await col(mon).click({ position: { x: 20, y: 5 * 48 + 30 } });
const create = page.getByRole("dialog", { name: "새 할 일" });
check("빈 칸을 누르면 그 시각으로 새 할 일 창", (await create.locator("h2").innerText().catch(() => "")).includes("05:30"));
await create.getByRole("textbox", { name: "할 일" }).fill(PLANT);
await create.locator("select").nth(1).selectOption("weekly");
await create.getByRole("button", { name: "캘린더에 적기" }).click();
check("월요일 05:30 에 적힌다", await until(async () => (await block(mon, PLANT).count()) === 1));
await page.goto(`${BASE}/?view=month&d=${anchor}`, { waitUntil: "networkidle" });
check("달 보기에 앞날(↻)이 그려진다", (await page.locator("main [role=button]", { hasText: `↻ ${PLANT}` }).count()) >= 1);
await page.locator("main [role=button]", { hasText: `↻ ${PLANT}` }).first().click();
check("앞날을 누르면 반복 설명", (await page.getByRole("dialog", { name: "할 일" }).innerText()).includes("반복으로"));
await page.keyboard.press("Escape");

console.log("\n되돌리기 · 체크");
await page.goto(`${BASE}/?view=week&d=${anchor}`, { waitUntil: "networkidle" });
await block(wed, BOOK).click();
await page.getByRole("dialog", { name: "할 일" }).getByRole("button", { name: "백로그로" }).click();
check("백로그로 돌아간다", await until(async () => (await backlogRow(BOOK).count()) === 1 && (await block(wed, BOOK).count()) === 0));
await block(fri, PAPER).getByRole("button", { name: "했음" }).click();
check(
  "체크해도 그날 칸에 남는다",
  await until(async () => (await block(fri, PAPER).getByRole("button", { name: "안 한 것으로" }).count()) === 1),
);

console.log("\n폰");
{
  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.context().addCookies(await page.context().cookies());
  await phone.goto(`${BASE}/?d=${wed}`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(800);
  check("보기를 안 정하면 폰은 하루", (await phone.getByRole("button", { name: "하루", exact: true }).getAttribute("aria-pressed")) === "true");
  check("백로그는 옆이 아니라 서랍", (await phone.locator('aside[aria-label="백로그"]').count()) === 0);
  await phone.getByRole("button", { name: /^백로그/ }).click();
  const sheet = phone.locator('aside[aria-label="백로그"]');
  await sheet.locator('input[aria-label="백로그에 적기"]').fill(PHONE);
  await phone.keyboard.press("Enter");
  await sheet.locator("li", { hasText: PHONE }).waitFor({ timeout: 10000 }).catch(() => {});
  await sheet.locator("li", { hasText: PHONE }).getByRole("button", { name: "놓기" }).click();
  check("놓기를 누르면 서랍이 닫힌다", (await phone.locator('aside[aria-label="백로그"]').count()) === 0);
  await phone.locator(`main div[data-day="${wed}"]:not([data-allday])`).click({ position: { x: 40, y: 9 * 48 + 5 } });
  check(
    "칸을 누르면 거기 놓인다",
    await until(async () =>
      (await phone.locator(`main div[data-day="${wed}"]`).locator("[role=button]", { hasText: PHONE }).innerText()).includes("09:00"),
    ),
  );
  const width = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("가로로 넘치지 않는다", width <= 0, String(width));
  await phone.close();
}

console.log("\n치우기");
for (const [day, title] of [[wed, PHONE], [fri, PAPER], [mon, PLANT]]) {
  page.once("dialog", (d) => d.accept());
  await page.goto(`${BASE}/?view=week&d=${anchor}`, { waitUntil: "networkidle" });
  await block(day, title).click();
  await page.getByRole("dialog", { name: "할 일" }).getByRole("button", { name: "지우기" }).click();
  await until(async () => (await block(day, title).count()) === 0);
}
page.once("dialog", (d) => d.accept());
await backlogRow(BOOK).getByRole("button", { name: BOOK }).click();
await page.getByRole("dialog", { name: "할 일" }).getByRole("button", { name: "지우기" }).click();
check(
  "시험 할 일이 남지 않는다",
  await until(async () => (await page.locator("main", { hasText: stamp }).count()) === 0 && (await backlogRow(stamp).count()) === 0),
);

if (errors.length > 0) console.log("\n" + errors.join("\n"));
console.log(`\n${pass} 통과 · ${fail} 실패`);
await browser.close();
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
