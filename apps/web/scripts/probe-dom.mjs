/** 에디터 DOM 을 있는 그대로 본다 — 플레이스홀더·제목 블록·포탈 메뉴의 조상 사슬. */
import { chromium, devices } from "playwright";

const BASE = process.env.INSPECT_URL ?? "http://localhost:3000";
const EMAIL = process.env.INSPECT_EMAIL ?? "mgh950714@gmail.com";
const PASSWORD = process.env.INSPECT_PASSWORD ?? "nyanotion-first";
const DOC = process.argv[2] ?? "e73wf6yxkrnps6cwfped7od9";

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["iPhone 13"] });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
await page.goto(`${BASE}/d/${DOC}`, { waitUntil: "networkidle" });
await page.waitForSelector(".bn-editor", { timeout: 20000 });
await page.waitForTimeout(1200);

// 커서만 놓는다. **블록을 만들지 않는다** — 실제 문서다.
await page.click(".bn-editor");
await page.keyboard.press("End");
await page.waitForTimeout(500);

const dom = await page.evaluate(() => {
  const out = {};
  const ed = document.querySelector(".bn-editor");
  out.editorParents = (() => {
    const chain = [];
    let el = ed;
    while (el && chain.length < 5) { chain.push(el.className?.toString().slice(0, 90)); el = el.parentElement; }
    return chain;
  })();
  // 커서가 있는 블록의 outerHTML
  const sel = window.getSelection();
  let node = sel?.anchorNode ?? null;
  while (node && node.nodeType !== 1) node = node.parentNode;
  const block = node?.closest?.(".bn-block-outer") ?? null;
  out.focusedBlockHTML = block?.outerHTML.slice(0, 700) ?? null;
  const content = block?.querySelector(".bn-block-content") ?? null;
  if (content) {
    const cs = getComputedStyle(content);
    out.focusedBlock = { attrs: [...content.attributes].map((a) => `${a.name}="${a.value}"`), fontSize: cs.fontSize };
    const before = getComputedStyle(content, "::before");
    out.beforeOnContent = { content: before.content, whiteSpace: before.whiteSpace, position: before.position };
    const inline = content.querySelector(".bn-inline-content");
    if (inline) {
      const ib = getComputedStyle(inline, "::before");
      out.beforeOnInline = { content: ib.content, whiteSpace: ib.whiteSpace, position: ib.position, color: ib.color };
      out.inlineAttrs = [...inline.attributes].map((a) => `${a.name}="${a.value}"`);
    }
  }
  // 제목 블록
  const h = document.querySelector('[data-content-type="heading"]');
  if (h) {
    const cs = getComputedStyle(h);
    out.heading = { attrs: [...h.attributes].map((a) => `${a.name}="${a.value}"`), fontSize: cs.fontSize, level: cs.getPropertyValue("--level"), paddingTop: cs.paddingTop, cls: h.className };
  }
  // 우리 CSS 변수가 먹었는지
  const root = document.querySelector(".bn-root") ?? ed;
  const rs = getComputedStyle(root);
  out.vars = {};
  for (const v of ["--bn-colors-editor-background", "--bn-colors-selected-background", "--bn-font-family", "--bn-colors-border"]) out.vars[v] = rs.getPropertyValue(v).trim();
  out.editorBg = getComputedStyle(ed).backgroundColor;
  out.editorFont = getComputedStyle(ed).fontFamily.slice(0, 60);
  return out;
});
console.log(JSON.stringify(dom, null, 1));

// 슬래시 메뉴의 조상 사슬 — portal 이 .bn-root 밖인지
await page.keyboard.type("/");
await page.waitForSelector(".bn-suggestion-menu", { timeout: 6000 }).catch(() => {});
await page.waitForTimeout(400);
const menu = await page.evaluate(() => {
  const m = document.querySelector(".bn-suggestion-menu");
  if (!m) return null;
  const chain = []; let el = m;
  while (el && chain.length < 7) { chain.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 70)}`); el = el.parentElement; }
  const item = m.querySelector("[class*='bn-ak-menu-item'], [role='option'], [class*='suggestion-menu-item']");
  const active = m.querySelector(".bn-ak-primary, [data-active-item], [aria-selected='true']");
  return {
    chain,
    itemHTML: item?.outerHTML.slice(0, 400) ?? null,
    activeCls: active?.className?.toString() ?? null,
    activeBg: active ? getComputedStyle(active).backgroundColor : null,
    menuVars: { bg: getComputedStyle(m).getPropertyValue("--bn-colors-menu-background").trim() },
    groupLabel: m.querySelector("[class*='label'], [class*='group']")?.className?.toString() ?? null,
  };
});
console.log("\n=== 슬래시 메뉴 ===");
console.log(JSON.stringify(menu, null, 1));
await page.keyboard.press("Escape");
await page.keyboard.press("Backspace");
await page.waitForTimeout(400);
await browser.close();