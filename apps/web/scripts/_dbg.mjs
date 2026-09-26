import { chromium, devices } from "playwright";
const B = "http://localhost:3000";
const br = await chromium.launch();
const p = await br.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 950 } });
p.on("console", (m) => {
  const t = m.text();
  if (t.startsWith("EV ")) console.log(t);
});
await p.goto(`${B}/login`, { waitUntil: "networkidle" });
await p.fill('input[name="email"]', "mgh950714@gmail.com");
await p.fill('input[name="password"]', "nyanotion-first");
await p.click('button[type="submit"]');
await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
await p.goto(`${B}/`, { waitUntil: "networkidle" });
await p.locator('button[aria-label="새 문서"]').first().click();
await p.waitForURL(/\/d\/[a-z0-9]+/, { timeout: 20000 });
console.log("문서:", p.url().split("/d/")[1]);
await p.waitForSelector(".bn-editor", { timeout: 30000 });
await p.waitForTimeout(2500);

// 표 + 줄 + 뷰 전환 — e2e 와 같은 순서
await p.locator('.bn-editor [data-content-type="paragraph"]').last().click();
await p.keyboard.press("End");
await p.keyboard.type("/데이터", { delay: 45 });
await p.waitForSelector(".bn-suggestion-menu", { timeout: 8000 });
await p.keyboard.press("Enter");
await p.waitForSelector("table", { timeout: 20000 });
await p.waitForTimeout(1800);

const DO_ROW = process.env.ROW !== "0";
const DO_VIEW = process.env.VIEW !== "0";
if (DO_ROW) {
await p.locator("button", { hasText: "줄 추가" }).first().click();
await p.locator('[aria-label="새 줄 제목"]').fill("우유");
await p.keyboard.press("Enter");
await p.waitForTimeout(2500);
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
}

if (DO_VIEW) {
for (const v of ["보드", "달력", "표"]) {
  await p.locator(`button[aria-label="${v}"]`).first().click();
  await p.waitForTimeout(900);
}
}
console.log(`(줄추가=${DO_ROW} 뷰전환=${DO_VIEW})`);

// 이벤트 도청
await p.evaluate(() => {
  const log = (phase) => (e) => {
    if (e.key === "/" || e.data === "/" || e.inputType !== undefined) {
      console.log(
        `EV ${phase} ${e.type} key=${e.key ?? ""} data=${e.data ?? ""} inputType=${e.inputType ?? ""} defaultPrevented=${e.defaultPrevented} target=${e.target?.className?.toString?.().slice(0, 30)}`,
      );
    }
  };
  window.addEventListener("keydown", log("capture"), true);
  window.addEventListener("keydown", log("bubble"), false);
  window.addEventListener("beforeinput", log("capture"), true);
  window.addEventListener("input", log("bubble"), false);
});

const line = p.locator('.bn-editor [data-content-type="paragraph"]').last();
await line.scrollIntoViewIfNeeded();
await line.click();
await p.keyboard.press("End");
await p.waitForTimeout(900);
console.log("--- / 를 친다 ---");
await p.keyboard.type("/", { delay: 45 });
await p.waitForTimeout(1500);

const after = await p.evaluate(() => ({
  text: [...document.querySelectorAll(".bn-editor .bn-block-content")].map((b) => (b.textContent ?? "").slice(0, 20)),
  menu: document.querySelectorAll(".bn-suggestion-menu").length,
}));
console.log("결과:", JSON.stringify(after));
await br.close();
