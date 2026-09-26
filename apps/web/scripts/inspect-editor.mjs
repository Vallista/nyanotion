/**
 * 에디터를 실제로 띄워 계산된 스타일을 본다 — 추측으로 CSS 를 고치지 않기 위해서.
 * 데스크탑과 폰 폭을 한 번에 본다.
 *
 *   node apps/web/scripts/inspect-editor.mjs [문서id]
 *
 * **실제 문서를 연다. 편집을 남기지 않는다** — 친 "/" 는 곧바로 지운다.
 */
import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";
import { BASE, signIn } from "./lib.mjs";

const DOC = process.argv[2] ?? "e73wf6yxkrnps6cwfped7od9";
const browser = await chromium.launch();
const report = {};

for (const shape of [
  { name: "desktop", context: { viewport: { width: 1280, height: 900 } } },
  { name: "phone", context: { ...devices["iPhone 13"] } },
]) {
  const page = await browser.newPage(shape.context);
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 200)));

  await signIn(page);
  await page.goto(`${BASE}/d/${DOC}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bn-editor", { timeout: 20000 }).catch(() => {
    problems.push("'.bn-editor' 를 못 찾음 — 에디터가 안 떴다");
  });
  await page.waitForTimeout(1500);

  const styles = await page.evaluate(() => {
    const look = (selector) => {
      const el = document.querySelector(selector);
      if (el === null) return null;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        font: `${cs.fontSize} / ${cs.lineHeight}`,
        family: cs.fontFamily.slice(0, 40),
        background: cs.backgroundColor,
        border: cs.borderWidth === "0px" ? "-" : `${cs.borderWidth} ${cs.borderColor}`,
        padding: cs.padding,
      };
    };
    const root = document.querySelector(".bn-root");
    const vars = {};
    if (root !== null) {
      const cs = getComputedStyle(root);
      for (const name of [
        "--bn-colors-editor-background",
        "--bn-colors-selected-background",
        "--bn-colors-border",
        "--bn-font-family",
      ]) {
        vars[name] = cs.getPropertyValue(name).trim().slice(0, 40);
      }
    }
    return {
      article: look("article"),
      container: look(".bn-container"),
      editor: look(".bn-editor"),
      block: look(".bn-block-content"),
      // iOS 는 편집 영역 글자가 16px 미만이면 탭할 때 확대한다
      editable: look('[contenteditable="true"]'),
      vars,
    };
  });

  await page.screenshot({ path: `apps/web/scripts/inspect-${shape.name}.png` });

  // 슬래시 메뉴 — 찍고 나서 되돌린다
  await page.locator('.bn-editor [data-content-type="paragraph"]').last().click({ force: true });
  await page.keyboard.press("End");
  await page.keyboard.type("/", { delay: 45 });
  const opened = await page
    .waitForSelector(".bn-suggestion-menu", { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(400);

  let menu = null;
  if (opened) {
    await page.screenshot({ path: `apps/web/scripts/inspect-${shape.name}-slash.png` });
    menu = await page.evaluate(() => {
      const el = document.querySelector(".bn-suggestion-menu");
      if (el === null) return null;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const active = el.querySelector("[aria-selected='true'], [data-active-item]");
      return {
        size: { w: Math.round(box.width), h: Math.round(box.height) },
        background: cs.backgroundColor,
        border: cs.border,
        radius: cs.borderRadius,
        shadow: cs.boxShadow.slice(0, 60),
        selectedBg: active === null ? null : getComputedStyle(active).backgroundColor,
      };
    });
  }

  // 되돌리기 — 문서를 바꾸면 안 된다
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(400);

  report[shape.name] = { styles, menu, problems };
  await page.close();
}

console.log(JSON.stringify(report, null, 2));
writeFileSync("apps/web/scripts/editor-report.json", JSON.stringify(report, null, 2));
console.log("\n스크린샷: inspect-{desktop,phone}[-slash].png · 리포트: editor-report.json");
await browser.close();
