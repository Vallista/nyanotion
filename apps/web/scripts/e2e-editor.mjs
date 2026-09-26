/**
 * 에디터 전체 시험 — 임시 문서를 만들어서 하고, 끝나면 지운다. 실제 문서를 건드리지 않는다.
 *   node apps/web/scripts/e2e-editor.mjs
 */
import { chromium, devices } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 180)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 180)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "mgh950714@gmail.com");
await page.fill('input[name="password"]', "nyanotion-first");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

// --- 임시 문서 만들기 (사이드바의 + ) ---
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const plus = page.locator('[aria-label*="문서"], button[title*="문서"]').filter({ hasText: "" });
await page.locator('button[aria-label="문서 추가"], button[title="문서 추가"]').first().click({ timeout: 8000 })
  .catch(async () => {
    // 이름이 다르면 사이드바에서 + 아이콘을 가진 버튼을 찾는다
    await page.locator('aside button, nav button').filter({ has: page.locator("svg") }).nth(1).click();
  });
await page.waitForURL(/\/d\/[a-z0-9]+/, { timeout: 15000 });
const docUrl = page.url();
const docId = docUrl.split("/d/")[1];
console.log("임시 문서:", docId);

await page.waitForSelector(".bn-editor", { timeout: 20000 });
await page.waitForTimeout(2000);

// --- 1) 슬래시 메뉴에서 데이터베이스 넣기 ---
await page.click(".bn-editor");
await page.keyboard.type("/데이터");
await page.waitForSelector(".bn-suggestion-menu", { timeout: 8000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "apps/web/scripts/e1-slash-db.png" });
const menuText = await page.locator(".bn-suggestion-menu").innerText();
console.log("메뉴에 보이는 것:", JSON.stringify(menuText.replace(/\n+/g, " | ").slice(0, 120)));
await page.keyboard.press("Enter");

// 표가 뜰 때까지
const ok = await page.waitForSelector("table", { timeout: 20000 }).then(() => true).catch(() => false);
await page.waitForTimeout(1500);
console.log("표가 본문에 들어왔나:", ok);
await page.screenshot({ path: "apps/web/scripts/e2-inline-db.png" });

// --- 2) 표에 줄 추가 ---
if (ok) {
  const add = page.locator("button", { hasText: "줄 추가" });
  if ((await add.count()) > 0) {
    await add.first().click();
    await page.locator('[aria-label="새 줄 제목"]').fill("");
    await page.keyboard.type("우유");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    const body = await page.locator("table").innerText();
    console.log("줄 추가 뒤 표:", JSON.stringify(body.replace(/\n+/g, " | ").slice(0, 160)));
  } else {
    console.log("(줄 추가 버튼을 못 찾음)");
  }
  await page.screenshot({ path: "apps/web/scripts/e3-db-row.png" });
}

// --- 3) 그림 올리기 (API 직접) ---
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoU2NkYGD4z0AEYBxVSFJgYBSCBhgAHJgCAcqGcOMAAAAASUVORK5CYII=",
  "base64",
);
const upload = await page.evaluate(
  async ({ docId, bytes }) => {
    const form = new FormData();
    form.append("documentId", docId);
    form.append("file", new File([new Uint8Array(bytes)], "점.png", { type: "image/png" }));
    const r = await fetch("/api/upload", { method: "POST", body: form });
    return { status: r.status, body: await r.text() };
  },
  { docId, bytes: [...png] },
);
console.log("업로드:", upload.status, upload.body.slice(0, 120));

if (upload.status === 200) {
  const url = JSON.parse(upload.body).url;
  const fetched = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, type: r.headers.get("content-type"), len: (await r.arrayBuffer()).byteLength };
  }, url);
  console.log("내려받기:", JSON.stringify(fetched));
}

// --- 4) 폰 크기에서 한 번 더 ---
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(docUrl, { waitUntil: "networkidle" });
await page.waitForSelector(".bn-editor", { timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: "apps/web/scripts/e4-phone.png" });

// --- 정리: 임시 문서를 모래상자로 ---
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(docUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.locator('[aria-label="더 보기"], button[title="더 보기"]').first().click().catch(() => {});
await page.waitForTimeout(400);
const trash = page.locator("button", { hasText: "모래상자로 보내기" });
if ((await trash.count()) > 0) {
  await trash.first().click();
  await page.waitForTimeout(1500);
  console.log("임시 문서를 모래상자로 보냈습니다.");
} else {
  console.log("!! 임시 문서를 못 지웠습니다:", docId);
}

console.log("\n콘솔 오류:", errors.length === 0 ? "없음" : "");
for (const e of errors.slice(0, 8)) console.log("  ", e);
await browser.close();
