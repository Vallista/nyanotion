/**
 * 사이드바 문서 줄의 `⋯` — 데스크탑(지금 연 문서 · 오른쪽 클릭)과 폰(늘 보임)에서 지우기까지.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-sidebar.mjs
 *
 * 시험 문서 둘을 만들어 모래상자로 보낸다.
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
console.log(await signIn(page));

/** 새 문서를 만들고 사이드바에서 그 줄을 찾는다 (제목이 비어 있으니 주소로 찾는다). */
async function newDoc(p) {
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "새 문서" }).first().click();
  await p.waitForURL(/\/d\//, { timeout: 15000 });
  await p.waitForTimeout(1200);
  const id = new URL(p.url()).pathname.split("/")[2];
  const row = p.locator(`nav a[href="/d/${id}"]`).first().locator("xpath=ancestor::div[2]");
  return { id, row };
}

/** 그 단추를 그 자리에서 누르면 정말 그 단추가 눌리는가 (잘리거나 덮이지 않았는가). */
async function onTop(p, locator, text) {
  const box = await locator.boundingBox().catch(() => null);
  if (box === null) return false;
  const hit = await p.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? "",
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  return hit.includes(text);
}

console.log("\n데스크탑");
{
  const { id, row } = await newDoc(page);
  await page.mouse.move(900, 500); // 줄에서 마우스를 치운다
  const dots = row.locator('button[aria-label="더 보기"]');
  check("지금 연 문서 줄에는 마우스를 안 올려도 ⋯ 가 보인다", await dots.isVisible().catch(() => false));

  await row.click({ button: "right" });
  const del = page.getByRole("button", { name: "모래상자로 보내기 (삭제)" });
  check("오른쪽 클릭으로 메뉴가 열린다", await del.isVisible().catch(() => false));
  check("**메뉴의 삭제가 잘리지 않고 눌린다**", await onTop(page, del, "모래상자로"));
  await del.click();
  await page.waitForTimeout(2000);
  check("지우면 사이드바에서 빠진다", (await page.locator(`nav a[href="/d/${id}"]`).count()) === 0);
}

console.log("\n폰");
{
  const phone = await browser.newPage({ ...devices["iPhone 13"] });
  await phone.context().addCookies(await page.context().cookies());
  const { id } = await newDoc(phone);
  await phone.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const toggle = await phone.getByRole("button", { name: "문서 트리 열기" }).boundingBox();
  const crumb = await phone.locator("header span", { hasText: "체크리스트" }).last().boundingBox();
  check(
    "**탑바 글자가 트리 단추 밑에 깔리지 않는다**",
    toggle !== null && crumb !== null && crumb.x >= toggle.x + toggle.width,
    JSON.stringify({ toggle, crumb }),
  );
  await phone.getByRole("button", { name: "문서 트리 열기" }).click();
  await phone.waitForTimeout(600);
  const row = phone.locator(`nav a[href="/d/${id}"]`).first().locator("xpath=ancestor::div[2]");
  const dots = row.locator('button[aria-label="더 보기"]');
  check("**폰에서는 ⋯ 가 늘 보인다**", await dots.isVisible().catch(() => false));
  const box = await dots.boundingBox().catch(() => null);
  check("손가락으로 누를 크기 (28px)", box !== null && box.width >= 27, JSON.stringify(box));
  await dots.tap();
  const del = phone.getByRole("button", { name: "모래상자로 보내기 (삭제)" });
  check("눌러서 메뉴가 열린다", await del.isVisible().catch(() => false));
  check("**메뉴의 삭제가 잘리지 않고 눌린다**", await onTop(phone, del, "모래상자로"));
  await del.tap();
  await phone.waitForTimeout(2000);
  await phone.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("지우면 빠진다", (await phone.locator(`nav a[href="/d/${id}"]`).count()) === 0);
  await phone.screenshot({ path: "apps/web/scripts/e-sidebar-phone.png" });
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
