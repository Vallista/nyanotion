/**
 * 노션 대조: 슬래시 메뉴에 실제로 어떤 블록이 있는지, 업로드·단축키가 붙어 있는지 본다.
 * 문서를 바꾸지 않는다 — 친 "/" 는 되돌린다.
 */
import { chromium, devices } from "playwright";
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"] });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "mgh950714@gmail.com");
await page.fill('input[name="password"]', "nyanotion-first");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
await page.goto(`${BASE}/d/${process.argv[2] ?? "e73wf6yxkrnps6cwfped7od9"}`, { waitUntil: "networkidle" });
await page.waitForSelector(".bn-editor", { timeout: 20000 });
await page.waitForTimeout(1500);

// 마지막 단락 끝에 커서
await page.locator(".bn-block-content").last().click();
await page.keyboard.press("End");
await page.keyboard.type("/");
await page.waitForSelector(".bn-suggestion-menu", { timeout: 8000 });
await page.waitForTimeout(500);

// 메뉴를 끝까지 스크롤하며 항목을 모은다
const items = await page.evaluate(async () => {
  const menu = document.querySelector(".bn-suggestion-menu");
  const seen = new Map();
  const collect = () => {
    let group = "?";
    for (const el of menu.children) {
      if (el.className.includes("group-label")) { group = el.textContent?.trim() ?? "?"; continue; }
      const title = el.querySelector("[class*='item-title']")?.textContent?.trim();
      if (title) seen.set(title, { group, sub: el.querySelector("[class*='item-subtitle']")?.textContent?.trim() ?? "" });
    }
  };
  for (let i = 0; i < 30; i += 1) { collect(); menu.scrollTop += 200; await new Promise((r) => setTimeout(r, 60)); }
  collect();
  return [...seen.entries()].map(([title, v]) => ({ group: v.group, title, sub: v.sub }));
});
console.log(`=== 슬래시 메뉴 항목 ${items.length}개 ===`);
let g = "";
for (const it of items) {
  if (it.group !== g) { g = it.group; console.log(`\n[${g}]`); }
  console.log(`  ${it.title}${it.sub ? "  — " + it.sub : ""}`);
}

await page.keyboard.press("Escape");
await page.keyboard.press("Backspace");
await page.waitForTimeout(500);
await browser.close();
