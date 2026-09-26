/**
 * 에디터를 실제로 띄워 DOM 과 계산된 스타일을 본다. 추측으로 CSS 를 고치지 않기 위해서.
 *   node apps/web/scripts/inspect-editor.mjs [문서id]
 */
// 주의: 이 스크립트는 **실제 문서**를 연다. 편집을 남기지 말 것 —
// Enter 금지, 친 글자는 반드시 Backspace 로 되돌린다.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.INSPECT_URL ?? "http://localhost:3000";
const EMAIL = process.env.INSPECT_EMAIL ?? "mgh950714@gmail.com";
const PASSWORD = process.env.INSPECT_PASSWORD ?? "nyanotion-first";
const DOC = process.argv[2] ?? "e73wf6yxkrnps6cwfped7od9";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on("console", (msg) => {
  if (msg.type() === "error") problems.push(`console: ${msg.text().slice(0, 200)}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${String(err).slice(0, 200)}`));

console.log("로그인...");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });

console.log(`문서 열기: /d/${DOC}`);
await page.goto(`${BASE}/d/${DOC}`, { waitUntil: "networkidle" });
await page.waitForSelector(".bn-editor", { timeout: 20000 }).catch(() => {
  problems.push("'.bn-editor' 를 못 찾음 — 에디터가 안 떴다");
});
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const out = {};
  const pick = (el) => {
    if (el === null) return null;
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      cls: el.className?.toString().slice(0, 120),
      box: { w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x) },
      font: `${cs.fontSize} / ${cs.lineHeight}`,
      border: cs.border,
      outline: cs.outline,
      background: cs.backgroundColor,
      padding: cs.padding,
      display: cs.display,
    };
  };

  out.article = pick(document.querySelector("article"));
  out.view = pick(document.querySelector(".bn-container") ?? document.querySelector(".nyan-editor"));
  out.editor = pick(document.querySelector(".bn-editor"));
  out.firstBlock = pick(document.querySelector(".bn-block-content"));
  out.inlineContent = pick(document.querySelector(".bn-inline-content"));

  // 플레이스홀더
  const ph = document.querySelector("[data-is-empty-and-focused], .bn-block-content");
  out.placeholder = ph === null ? null : getComputedStyle(ph, "::before").content;

  // 편집 영역의 폰트 크기 — iOS 는 16px 미만이면 확대한다
  const editable = document.querySelector('[contenteditable="true"]');
  out.editable = pick(editable);

  // 에디터 안의 버튼·링크·리스트가 전역 리셋에 먹혔는지
  const btn = document.querySelector(".bn-container button");
  out.innerButton = pick(btn);

  out.classesOnEditor = Array.from(document.querySelector(".bn-editor")?.classList ?? []);
  out.containerChain = (() => {
    let el = document.querySelector(".bn-editor");
    const chain = [];
    while (el !== null && chain.length < 6) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className?.toString().slice(0, 80),
        w: Math.round(el.getBoundingClientRect().width),
        border: cs.borderWidth === "0px" ? "-" : `${cs.borderWidth} ${cs.borderColor}`,
      });
      el = el.parentElement;
    }
    return chain;
  })();
  return out;
});

console.log("\n=== 구조와 스타일 ===");
console.log(JSON.stringify(report, null, 2));

console.log("\n=== 슬래시 메뉴 ===");
await page.click(".bn-editor");
await page.keyboard.press("End");
await page.keyboard.type("/");
await page.waitForTimeout(1200);
const slash = await page.evaluate(() => {
  const candidates = [
    "[class*='suggestion']",
    "[class*='slash']",
    "[role='listbox']",
    "[role='menu']",
    ".bn-suggestion-menu",
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el !== null) {
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        selector: sel,
        cls: el.className?.toString().slice(0, 160),
        box: { w: Math.round(box.width), h: Math.round(box.height) },
        position: cs.position,
        background: cs.backgroundColor,
        border: cs.border,
        boxShadow: cs.boxShadow.slice(0, 60),
        items: el.querySelectorAll("[class*='item'], button, li").length,
        text: (el.textContent ?? "").slice(0, 160),
      };
    }
  }
  return { found: false, bodyTail: document.body.innerHTML.slice(-400) };
});
console.log(JSON.stringify(slash, null, 2));

await page.screenshot({ path: "apps/web/scripts/editor.png", fullPage: false });

// 점검이 문서를 바꾸면 안 된다 — 친 "/" 를 도로 지운다.
await page.keyboard.press("Escape");
await page.keyboard.press("Backspace");
await page.waitForTimeout(400);
console.log("\n스크린샷: apps/web/scripts/editor.png");

if (problems.length > 0) {
  console.log("\n=== 콘솔 오류 ===");
  for (const p of problems.slice(0, 10)) console.log("  " + p);
}

writeFileSync(
  "apps/web/scripts/editor-report.json",
  JSON.stringify({ report, slash, problems }, null, 2),
);
await browser.close();
