/**
 * 오늘 · 일정 · 메모함 · 기록 시험 (`docs/15-today.md`).
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-life.mjs
 *
 * 캘린더 빈 칸에 일정 적기 → 끌어 옮기기 → 고치기 → 지우기, 오늘 화면에서 메모·오늘 할 일·기분,
 * 메모 → 할 일, ⌘K 로 메모, 기록에서 회고 쓰기. 만든 것은 끝에 지운다(기분·회고는 원래 값으로 되돌린다).
 * 시험은 3주 뒤의 주에 일정을 만든다 — 지금 일정과 겹치지 않게.
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
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const anchor = addDays(today, 21);
const stamp = Date.now().toString().slice(-6);
const EVENT = `시험 치과 ${stamp}`;
const MEMO = `시험 메모 ${stamp}`;
const MEMO2 = `시험 할일로 ${stamp}`;
const PALETTE_MEMO = `시험 팔레트 ${stamp}`;
const TODO = `시험 오늘 할 일 ${stamp}`;
const HOUR_PX = 48;

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1360, height: 950 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
console.log(await signIn(page));

const settle = async (ms = 2500) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
};
const column = (day) => page.locator(`main [data-day="${day}"]:not([data-allday])`).first();
const eventBlock = (name) => page.locator("main [role=button]", { hasText: name }).first();

/* ── 일정 ─────────────────────────────────────────────────────────── */
console.log("\n일정");
await page.goto(`${BASE}/?view=week&d=${anchor}`, { waitUntil: "networkidle" });
const days = await page.locator("main div[data-day]:not([data-allday])").evaluateAll((els) => els.map((e) => e.dataset.day));
const [, mon, tue, , thu] = days;
await column(tue).click({ position: { x: 20, y: 10 * HOUR_PX + 5 } });
await page.getByRole("tab", { name: "일정" }).click();
const create = page.getByRole("dialog", { name: "새 일정" });
check("빈 칸 → [할 일 | 일정] 에서 일정 창", (await create.count()) === 1);
check("누른 시각이 들어간다", (await create.getByLabel("시작 시각").inputValue()) === "10:00");
await create.getByLabel("일정 이름").fill(EVENT);
await create.getByLabel("장소").fill("동네 치과");
await create.getByRole("button", { name: "캘린더에 적기" }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
await settle();
check("캘린더에 그려진다", (await eventBlock(EVENT).count()) === 1);

await eventBlock(EVENT).dragTo(column(thu), { targetPosition: { x: 20, y: 14 * HOUR_PX + 5 } });
await settle(3500);
check("끌어서 목요일 14:00 으로 (길이 그대로)", (await column(thu).locator("[role=button]", { hasText: EVENT }).count()) === 1);
await eventBlock(EVENT).click();
const edit = page.getByRole("dialog", { name: "일정" });
check("옮긴 시각", (await edit.getByLabel("시작 시각").inputValue()) === "14:00" && (await edit.getByLabel("끝 시각").inputValue()) === "15:00");
await edit.getByLabel("일정 이름").fill(`${EVENT} 스케일링`);
await edit.getByRole("button", { name: "저장" }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
await settle();
check("고친 이름", (await eventBlock(`${EVENT} 스케일링`).count()) === 1);

await page.locator(`main [data-day="${mon}"][data-allday]`).first().click({ position: { x: 30, y: 8 } });
await page.getByRole("tab", { name: "일정" }).click();
const trip = page.getByRole("dialog", { name: "새 일정" });
check("종일 줄을 누르면 종일로 시작", await trip.getByRole("checkbox", { name: "종일" }).isChecked());
await trip.getByLabel("일정 이름").fill(`${EVENT} 여행`);
await trip.locator("input[type=date]").nth(1).fill(tue);
await trip.getByRole("button", { name: "캘린더에 적기" }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
await settle();
check("여러 날 종일 일정은 날마다 보인다", (await page.locator("main [data-allday] [role=button]", { hasText: `${EVENT} 여행` }).count()) === 2);

for (const name of [`${EVENT} 스케일링`, `${EVENT} 여행`]) {
  await eventBlock(name).click();
  const d = page.getByRole("dialog", { name: "일정" });
  await d.getByRole("button", { name: "지우기" }).click();
  await d.getByRole("button", { name: "정말 지우기" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  await settle(1500);
}
check("지우기는 두 번 눌러야, 지우면 없다", (await page.locator("main [role=button]", { hasText: EVENT }).count()) === 0);

/* ── 오늘 ─────────────────────────────────────────────────────────── */
console.log("\n오늘");
await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
check("사이드바 맨 위가 오늘", (await page.locator("nav a").first().getAttribute("href")) === "/today");
const memoBox = page.getByLabel("새 메모");
await memoBox.fill(MEMO);
await memoBox.press("Enter");
await settle();
check("Enter 로 메모가 적힌다", (await page.getByText(MEMO).count()) === 1);
await memoBox.fill(`${MEMO2}\n둘째 줄`);
await page.getByRole("button", { name: "메모하기" }).click();
await settle();
check("여러 줄 메모", (await page.getByText("둘째 줄").count()) === 1);

const memoItem = page.locator("li", { hasText: MEMO2 }).first();
await memoItem.getByRole("button", { name: "옮기기" }).click();
await memoItem.getByRole("button", { name: "내 할 일로" }).click();
await settle(3500);
check("메모 → 할 일 (첫 줄이 제목, 메모함에서 빠진다)", (await page.getByText(MEMO2).count()) === 0);

await page.getByLabel("오늘 할 일 적기").fill(TODO);
await page.getByLabel("오늘 할 일 적기").press("Enter");
await settle(3500);
check("오늘 할 일 적기 → 오늘 할 일에", (await page.locator("li", { hasText: TODO }).count()) === 1);
await page.getByRole("button", { name: `"${TODO}" 했음` }).click();
await settle();
check("체크하면 줄이 그어진다", (await page.getByRole("button", { name: `"${TODO}" 안 한 것으로` }).count()) === 1);

// 지금 골라 둔 기분과 다른 것을 눌러 보고, 끝나면 원래대로 돌려 둔다.
const checkedMood = page.getByRole("radio", { checked: true, name: /^기분 / });
const moodBefore = (await checkedMood.count()) > 0 ? await checkedMood.first().getAttribute("aria-label") : null;
const pick = moodBefore === "기분 좋음" ? "기분 보통" : "기분 좋음";
await page.getByRole("radio", { name: pick }).click();
await settle();
check("기분은 누르는 즉시 저장", (await page.getByRole("radio", { name: pick, checked: true }).count()) === 1);
await page.reload({ waitUntil: "networkidle" });
check("다시 열어도 남아 있다", (await page.getByRole("radio", { name: pick, checked: true }).count()) === 1);
// 같은 것을 다시 누르면 지운다 — 없었으면 지우고, 있었으면 그것을 다시 고른다.
await page.getByRole("radio", { name: moodBefore ?? pick }).click();
await settle();

/* ── ⌘K ───────────────────────────────────────────────────────────── */
console.log("\n⌘K");
await page.keyboard.press("Control+k");
await page.getByLabel("문서 찾기").fill(PALETTE_MEMO);
await page.getByRole("button", { name: /메모함에 적기/ }).click();
await settle(3500);
await page.goto(`${BASE}/memos`, { waitUntil: "networkidle" });
check("⌘K 에서 메모함에 적힌다", (await page.getByText(PALETTE_MEMO).count()) === 1);

/* ── 기록 ─────────────────────────────────────────────────────────── */
console.log("\n기록");
await page.goto(`${BASE}/journal`, { waitUntil: "networkidle" });
const review = page.getByLabel("회고", { exact: true });
const before = await review.inputValue();
await review.fill(`${before}\n시험 ${stamp}`.trim());
await page.getByRole("button", { name: "저장", exact: true }).click();
await settle();
await page.reload({ waitUntil: "networkidle" });
check("회고가 저장된다", (await page.getByLabel("회고", { exact: true }).inputValue()).includes(`시험 ${stamp}`));
await page.getByLabel("회고", { exact: true }).fill(before);
await page.getByRole("button", { name: "저장", exact: true }).click();
await settle();

/* ── 치우기 ───────────────────────────────────────────────────────── */
console.log("\n치우기");
await page.goto(`${BASE}/memos`, { waitUntil: "networkidle" });
for (const text of [MEMO, PALETTE_MEMO]) {
  const item = page.locator("li", { hasText: text }).first();
  if ((await item.count()) === 0) continue;
  await item.getByRole("button", { name: "옮기기" }).click();
  await item.getByRole("button", { name: "지우기" }).click();
  await item.getByRole("button", { name: "정말 지우기" }).click();
  await settle(2000);
}
check("시험 메모가 남지 않는다", (await page.getByText(MEMO).count()) + (await page.getByText(PALETTE_MEMO).count()) === 0);

// 할 일은 캘린더의 할 일 창에서 지운다 — 오늘 것은 하루 보기의 종일 줄, 메모에서 온 것은 백로그.
const backlog = () => page.locator('aside[aria-label="백로그"]').first();
page.once("dialog", (d) => d.accept());
await page.goto(`${BASE}/?view=day&d=${today}`, { waitUntil: "networkidle" });
await page.locator("main [role=button]", { hasText: TODO }).first().click();
await page.getByRole("dialog", { name: "할 일" }).getByRole("button", { name: "지우기" }).click();
await settle();
page.once("dialog", (d) => d.accept());
await backlog().locator("li", { hasText: MEMO2 }).getByRole("button", { name: MEMO2 }).click();
await page.getByRole("dialog", { name: "할 일" }).getByRole("button", { name: "지우기" }).click();
await settle();
check("시험 할 일이 남지 않는다", (await page.locator("main", { hasText: stamp }).count()) === 0 && (await backlog().locator("li", { hasText: stamp }).count()) === 0);

check("페이지 오류 없음", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail === 0 ? 0 : 1);
