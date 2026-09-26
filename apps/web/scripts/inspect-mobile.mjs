/**
 * 폰 크기에서 에디터를 본다. 사용자가 보는 것과 같은 조건 —
 * iPhone 폭, 터치, 그리고 **빈 문서**(플레이스홀더가 보이는 상태).
 *   node apps/web/scripts/inspect-mobile.mjs
 */
// 주의: 이 스크립트는 **실제 문서**를 연다. 편집을 남기지 말 것 —
// Enter 금지, 친 글자는 반드시 Backspace 로 되돌린다.
import { chromium, devices } from "playwright";

const BASE = process.env.INSPECT_URL ?? "http://localhost:3000";
const EMAIL = process.env.INSPECT_EMAIL ?? "mgh950714@gmail.com";
const PASSWORD = process.env.INSPECT_PASSWORD ?? "nyanotion-first";

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["iPhone 13"] });
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });

// 빈 문서를 새로 만든다 — 플레이스홀더 상태를 보려고.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: "apps/web/scripts/m1-home.png" });

const docId = process.argv[2] ?? "e73wf6yxkrnps6cwfped7od9";
await page.goto(`${BASE}/d/${docId}`, { waitUntil: "networkidle" });
await page.waitForSelector(".bn-editor", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: "apps/web/scripts/m2-doc.png", fullPage: false });

const info = await page.evaluate(() => {
  const cs = (sel) => {
    const el = document.querySelector(sel);
    if (el === null) return null;
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      w: Math.round(b.width),
      x: Math.round(b.x),
      fontSize: s.fontSize,
      background: s.backgroundColor,
      border: s.borderWidth === "0px" ? "-" : `${s.borderWidth} ${s.borderStyle} ${s.borderColor}`,
      padding: s.padding,
    };
  };
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    article: cs("article"),
    title: cs('input[aria-label="문서 제목"]'),
    container: cs(".bn-container"),
    editor: cs(".bn-editor"),
    block: cs(".bn-block-content"),
    // iOS 는 편집 영역 글자가 16px 미만이면 탭할 때 확대한다
    editable: cs('[contenteditable="true"]'),
  };
});
console.log("=== 폰에서 본 값 ===");
console.log(JSON.stringify(info, null, 2));

// 슬래시 메뉴를 확실히 기다렸다가 찍는다
await page.click(".bn-editor");
await page.keyboard.press("End");
await page.keyboard.type("/");
await page
  .waitForSelector("[class*='bn-suggestion-menu'], [role='listbox'], [role='menu']", {
    timeout: 6000,
  })
  .catch(() => console.log("(슬래시 메뉴를 못 찾음)"));
await page.waitForTimeout(600);
await page.screenshot({ path: "apps/web/scripts/m3-slash.png" });

const menu = await page.evaluate(() => {
  const el = document.querySelector("[class*='bn-suggestion-menu'], [role='listbox'], [role='menu']");
  if (el === null) return null;
  const s = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  const selected = el.querySelector("[aria-selected='true'], [data-active-item], .bn-mt-suggestion-menu-item[data-selected]");
  return {
    cls: el.className?.toString().slice(0, 140),
    box: { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) },
    background: s.backgroundColor,
    border: s.border,
    radius: s.borderRadius,
    shadow: s.boxShadow.slice(0, 80),
    selectedBg: selected === null ? null : getComputedStyle(selected).backgroundColor,
    selectedColor: selected === null ? null : getComputedStyle(selected).color,
  };
});
console.log("\n=== 슬래시 메뉴 ===");
console.log(JSON.stringify(menu, null, 2));

console.log("\n스크린샷: m1-home.png / m2-doc.png / m3-slash.png");
await browser.close();
