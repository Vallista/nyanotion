/**
 * 어드민 시험 — 초대 → 가입 → 임시 비밀번호 → 비밀번호 바꾸기 → 막기 → 어드민이 아니면 404.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-admin.mjs
 *
 * **beta 에서만 돌릴 것.** 계정 지우기는 일부러 없으므로, 만든 시험 계정은 끝에 막아 둔다
 * (`e2e-admin-…@example.invalid`). 로그인하는 계정은 `ADMIN_EMAILS` 에 있어야 한다.
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

if (!/localhost:3100|127\.0\.0\.1:3100/.test(BASE)) {
  console.log("beta(3100) 에서만 돌립니다 — 시험 계정이 남기 때문입니다.");
  process.exit(1);
}

const stamp = Date.now().toString().slice(-6);
const NEW_EMAIL = `e2e-admin-${stamp}@example.invalid`;
const FIRST_PASSWORD = `first-${stamp}-pw`;
const CHANGED_PASSWORD = `changed-${stamp}-pw`;

const browser = await chromium.launch();
const admin = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 950 } });
const errors = [];
admin.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

console.log(await signIn(admin));
const card = () => admin.locator("article", { hasText: NEW_EMAIL }).first();

/** 새 사람 — 쿠키를 나누지 않는 다른 브라우저 창. */
async function stranger() {
  const context = await browser.newContext();
  return context.newPage();
}

async function tryLogin(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  return page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
}

console.log("\n어드민 화면");
await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
check("열린다", (await admin.locator("h1", { hasText: "어드민" }).count()) === 1);
check("사이드바에 어드민 링크", (await admin.locator('a[href="/admin"]').count()) > 0);

console.log("\n계정 초대");
await admin.locator('input[aria-label="초대할 이메일"]').fill(NEW_EMAIL);
await admin.getByRole("button", { name: "초대 링크 만들기" }).click();
const linkBox = admin.locator("code").first();
await linkBox.waitFor({ timeout: 10000 }).catch(() => {});
const joinUrl = (await linkBox.innerText().catch(() => "")).trim();
check("/join 링크가 나온다", joinUrl.includes("/join/"), joinUrl);

console.log("\n다른 주소로는 가입 못 한다");
{
  const page = await stranger();
  await page.goto(`${BASE}/login?join=x`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', `e2e-nobody-${stamp}@example.invalid`);
  await page.fill('input[name="password"]', FIRST_PASSWORD);
  const name = page.locator('input[name="name"]');
  if ((await name.count()) > 0) await name.fill("남");
  await page.click('button[type="submit"]');
  const landed = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  check("**초대 없는 주소는 막힌다**", !landed);
  await page.context().close();
}

console.log("\n초대받은 사람이 가입");
{
  const page = await stranger();
  await page.goto(joinUrl, { waitUntil: "networkidle" });
  check("초대받은 주소가 보인다", (await page.locator("text=" + NEW_EMAIL).count()) > 0);
  await page.locator("a", { hasText: "계정 만들기" }).click();
  await page.waitForURL(/\/login/, { timeout: 10000 });
  const emailField = page.locator('input[name="email"]');
  check("주소가 미리 채워진다", (await emailField.inputValue()) === NEW_EMAIL);
  const name = page.locator('input[name="name"]');
  if ((await name.count()) > 0) await name.fill("시험 고양이");
  await page.fill('input[name="password"]', FIRST_PASSWORD);
  await page.click('button[type="submit"]');
  const landed = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("가입되고 들어간다", landed, page.url());

  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const notFound = (await page.locator("h1", { hasText: "어드민" }).count()) === 0;
  check("**어드민이 아니면 /admin 이 없다 (404)**", notFound);
  check("사이드바에도 없다", (await page.locator('a[href="/admin"]').count()) === 0);

  await page.goto(joinUrl, { waitUntil: "networkidle" });
  await page.context().clearCookies();
  await page.goto(joinUrl, { waitUntil: "networkidle" });
  check("**쓴 초대 링크는 다시 안 열린다**", (await page.locator("text=쓸 수 없는 초대장").count()) > 0);
  await page.context().close();
}

console.log("\n임시 비밀번호");
await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
check("새 계정이 목록에 있다", (await card().count()) === 1);
admin.once("dialog", (d) => d.accept());
await card().getByRole("button", { name: "임시 비밀번호" }).click();
const pwBox = card().locator("code");
await pwBox.waitFor({ timeout: 10000 }).catch(() => {});
const temporary = (await pwBox.innerText().catch(() => "")).trim();
check("한 번 보여 준다 (14자)", temporary.length === 14, temporary.length);
{
  const page = await stranger();
  check("옛 비밀번호는 안 된다", !(await tryLogin(page, NEW_EMAIL, FIRST_PASSWORD)));
  check("임시 비밀번호로 들어간다", await tryLogin(page, NEW_EMAIL, temporary));

  console.log("\n비밀번호 바꾸기");
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
  await page.fill('input[aria-label="지금 비밀번호"]', temporary);
  await page.fill('input[aria-label="새 비밀번호"]', CHANGED_PASSWORD);
  await page.fill('input[aria-label="새 비밀번호 확인"]', CHANGED_PASSWORD);
  await page.getByRole("button", { name: "바꾸기" }).click();
  const done = await page
    .locator("text=바꿨어요")
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("바뀐다", done);
  await page.context().close();

  const again = await stranger();
  check("새 비밀번호로 들어간다", await tryLogin(again, NEW_EMAIL, CHANGED_PASSWORD));

  console.log("\n막기");
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  admin.once("dialog", (d) => d.accept());
  await card().getByRole("button", { name: "막기" }).click();
  await admin.waitForTimeout(2000);
  check("막힌 계정으로 내려간다", (await admin.locator("section", { hasText: "막힌 계정" }).locator("article", { hasText: NEW_EMAIL }).count()) === 1);

  await again.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("**들어와 있던 기기도 바로 끊긴다**", again.url().includes("/login"), again.url());
  check("**다시 로그인도 안 된다**", !(await tryLogin(again, NEW_EMAIL, CHANGED_PASSWORD)));
  // 이 시험은 1분 안에 로그인을 여러 번 한다 — 레이트 리밋(분당 10번)에 걸리면 그 문구가 먼저 뜬다.
  // 그때는 1분 쉬고 한 번 더 본다.
  let said = await again.locator("form").innerText();
  if (!said.includes("막혀")) {
    await again.waitForTimeout(61000);
    await tryLogin(again, NEW_EMAIL, CHANGED_PASSWORD);
    said = await again.locator("form").innerText();
  }
  check("막혔다고 말해 준다", said.includes("막혀 있습니다"), said.replace(/s+/g, " ").slice(-80));
  await again.context().close();
}

console.log("\n초대 취소");
{
  const other = `e2e-admin-${stamp}-x@example.invalid`;
  await admin.locator('input[aria-label="초대할 이메일"]').fill(other);
  await admin.getByRole("button", { name: "초대 링크 만들기" }).click();
  await admin.locator("code").first().waitFor({ timeout: 10000 });
  const url = (await admin.locator("code").first().innerText()).trim();
  await admin.reload({ waitUntil: "networkidle" });
  admin.once("dialog", (d) => d.accept());
  await admin.locator("article", { hasText: other }).getByRole("button", { name: "취소" }).click();
  await admin.waitForTimeout(1800);
  const page = await stranger();
  await page.goto(url, { waitUntil: "networkidle" });
  check("**취소한 링크는 안 열린다**", (await page.locator("text=쓸 수 없는 초대장").count()) > 0);
  await page.context().close();
}

console.log("\n폰 화면");
{
  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.context().addCookies(await admin.context().cookies());
  await phone.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const overflow = await phone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("가로로 넘치지 않는다", overflow <= 0, overflow);
  await phone.screenshot({ path: "apps/web/scripts/e-admin-phone.png", fullPage: true });
}
await admin.screenshot({ path: "apps/web/scripts/e-admin.png", fullPage: true });

console.log(`\n${pass}개 통과, ${fail}개 실패`);
console.log(`(시험 계정 ${NEW_EMAIL} 은 막힌 채로 beta 에 남습니다)`);
if (errors.length > 0) {
  console.log("\n페이지 오류:");
  for (const e of errors.slice(0, 6)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
