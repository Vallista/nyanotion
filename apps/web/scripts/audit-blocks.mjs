/**
 * 노션 대조 — 슬래시 메뉴에 실제로 어떤 블록이 있는지 전부 뽑는다.
 * `docs/06-editor.md` 의 표를 갱신할 때 쓴다.
 *
 *   node apps/web/scripts/audit-blocks.mjs [문서id]
 *
 * **문서를 바꾸지 않는다** — 친 "/" 는 되돌린다.
 */
import { chromium, devices } from "playwright";
import { focusLastLine, openDocument, signIn } from "./lib.mjs";

const DOC = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"] });

await signIn(page);
await openDocument(page, DOC);

await focusLastLine(page);
await page.keyboard.type("/", { delay: 45 });
await page.waitForSelector(".bn-suggestion-menu", { timeout: 8000 });
await page.waitForTimeout(500);

// 메뉴를 끝까지 스크롤하며 항목을 모은다 (한 번에 다 보이지 않는다).
const items = await page.evaluate(async () => {
  const menu = document.querySelector(".bn-suggestion-menu");
  if (menu === null) return [];
  const seen = new Map();
  const collect = () => {
    let group = "?";
    for (const el of menu.children) {
      if (el.className.includes("group-label")) {
        group = el.textContent?.trim() ?? "?";
        continue;
      }
      const title = el.querySelector("[class*='item-title']")?.textContent?.trim();
      if (title !== undefined && title !== "") {
        seen.set(title, {
          group,
          sub: el.querySelector("[class*='item-subtitle']")?.textContent?.trim() ?? "",
        });
      }
    }
  };
  for (let i = 0; i < 30; i += 1) {
    collect();
    menu.scrollTop += 200;
    await new Promise((r) => setTimeout(r, 60));
  }
  collect();
  return [...seen.entries()].map(([title, v]) => ({ group: v.group, title, sub: v.sub }));
});

console.log(`=== 슬래시 메뉴 항목 ${items.length}개 ===`);
let group = "";
for (const item of items) {
  if (item.group !== group) {
    group = item.group;
    console.log(`\n[${group}]`);
  }
  console.log(`  ${item.title}${item.sub === "" ? "" : "  — " + item.sub}`);
}

await page.keyboard.press("Escape");
await page.keyboard.press("Backspace");
await page.waitForTimeout(500);
await browser.close();
