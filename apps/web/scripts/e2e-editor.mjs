/**
 * 에디터 전체 시험 — **임시 문서**를 만들어서 하고, 끝나면 모래상자로 보낸다.
 * 실제 문서를 건드리지 않는다.
 *   node apps/web/scripts/e2e-editor.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.INSPECT_URL ?? "http://localhost:3000";
const EMAIL = process.env.INSPECT_EMAIL ?? "mgh950714@gmail.com";
const PASSWORD = process.env.INSPECT_PASSWORD ?? "nyanotion-first";

const browser = await chromium.launch();
const page = await browser.newPage({
  ...devices["Desktop Chrome"],
  viewport: { width: 1280, height: 950 },
});

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 700)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

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

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

// --- 임시 문서 ---
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page
  .locator('button[aria-label="새 문서"]')
  .first()
  .click({ timeout: 10000 })
  .catch(async () => {
    await page.locator("aside button, nav button").filter({ has: page.locator("svg") }).nth(1).click();
  });
await page.waitForURL(/\/d\/[a-z0-9]+/, { timeout: 20000 });
const docUrl = page.url();
const docId = docUrl.split("/d/")[1];
console.log("임시 문서:", docId, "\n");
await page.waitForSelector(".bn-editor", { timeout: 30000 });
await page.waitForTimeout(2500);

/** 글을 칠 수 있는 마지막 줄에 커서를 놓는다 (표·수식 블록은 contenteditable 이 아니다). */
async function focusLastLine() {
  const line = page.locator('.bn-editor [data-content-type="paragraph"]').last();
  // 표·달력이 길면 문단이 화면 밖에 있다 — 그대로 누르면 엉뚱한 곳이 눌린다.
  await line.scrollIntoViewIfNeeded();
  await line.click();
  await page.keyboard.press("End");
  // 표 블록이 다시 그려지는 중이면 첫 글자가 삼켜진다 — 가라앉을 때까지 기다린다.
  await page.waitForTimeout(900);
}

/**
 * 슬래시 메뉴로 블록 하나를 넣는다. 메뉴에 보이던 글을 돌려준다.
 *
 * `delay` 를 주는 이유: BlockNote 의 `/`·`@` 입력 규칙은 ProseMirror 가 한 번 돌아야 걸린다.
 * 지연 없이 치면 첫 글자가 삼켜진다 — 사람은 이렇게 빨리 칠 수 없으므로 제품 문제는 아니다.
 */
async function slash(query) {
  await focusLastLine();
  await page.keyboard.type("/", { delay: 45 });
  await page.waitForTimeout(400);
  // 첫 글자가 삼켜졌으면 한 번 더 — 브라우저가 다시 그리는 중이면 생긴다.
  if ((await page.locator(".bn-suggestion-menu").count()) === 0) {
    await page.keyboard.type("/", { delay: 45 });
    await page.waitForTimeout(400);
  }
  await page.keyboard.type(query, { delay: 45 });
  const shown = await page
    .waitForSelector(".bn-suggestion-menu", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!shown) {
    const info = await page.evaluate(() => ({
      blocks: [...document.querySelectorAll(".bn-editor .bn-block-content")].map(
        (b) => `${b.getAttribute("data-content-type")}:${(b.textContent ?? "").slice(0, 20)}`,
      ),
      active: document.activeElement?.tagName + "." + (document.activeElement?.className ?? "").toString().slice(0, 40),
    }));
    await page.screenshot({ path: "apps/web/scripts/e-slash-fail.png", fullPage: true });
    console.log("콘솔 오류:", errors.slice(-6));
    throw new Error(`슬래시 메뉴가 안 떴다 (/${query}) — ${JSON.stringify(info)}`);
  }
  await page.waitForTimeout(500);
  const text = await page.locator(".bn-suggestion-menu").innerText();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  return text.replace(/\n+/g, " | ");
}

console.log("데이터베이스");
{
  const menu = await slash("데이터");
  check("메뉴에 데이터베이스가 있다", menu.includes("데이터베이스"), menu.slice(0, 80));
  const tableCame = await page
    .waitForSelector("table", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  check("표가 본문에 들어왔다", tableCame);

  const add = page.locator("button", { hasText: "줄 추가" });
  if ((await add.count()) > 0) {
    await add.first().click();
    await page.locator('[aria-label="새 줄 제목"]').fill("우유");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    check("줄이 표에 남는다", (await page.locator("table").innerText()).includes("우유"));
    // 노션처럼 줄을 이어 넣을 수 있게 입력칸이 열린 채로 남는다 — 사람이 하듯 Esc 로 닫는다.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  } else {
    check("줄 추가 버튼", false, "못 찾음");
  }

  await page.locator('button[aria-label="보드"]').first().click();
  await page.waitForTimeout(800);
  const boardText = await page.locator("body").innerText();
  check("보드 뷰가 뜬다", boardText.includes("없음") || boardText.includes("선택 속성"));

  await page.locator('button[aria-label="달력"]').first().click();
  const calCame = await page
    .waitForSelector('[aria-label="이전 달"]', { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("달력 뷰가 뜬다", calCame);

  await page.locator('button[aria-label="표"]').first().click();
  await page.waitForTimeout(500);
}

console.log("\n콜아웃");
{
  const menu = await slash("콜아웃");
  check("메뉴에 콜아웃이 있다", menu.includes("콜아웃"), menu.slice(0, 60));
  await page.keyboard.type("장 볼 때 잊지 말 것", { delay: 20 });
  await page.waitForTimeout(700);
  check("콜아웃 블록이 생겼다", (await page.locator('[data-content-type="callout"]').count()) > 0);
}

console.log("\n수식");
{
  const menu = await slash("수식");
  check("메뉴에 수식이 있다", menu.includes("수식"), menu.slice(0, 60));
  const box = page.locator('textarea[aria-label="수식 (LaTeX)"]');
  check("넣자마자 입력칸이 열린다", (await box.count()) > 0);
  await box.fill("e^{i\\pi} + 1 = 0");
  await box.press("Control+Enter");
  await page.waitForTimeout(1200);
  const katex = await page.locator(".katex").count();
  check("KaTeX 로 그려진다", katex > 0, `katex 요소 ${katex}개`);
}

console.log("\n@ 멘션");
{
  await focusLastLine();
  await page.keyboard.type("@", { delay: 45 });
  const opened = await page
    .waitForSelector(".bn-suggestion-menu", { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("@ 로 메뉴가 열린다", opened);
  if (opened) {
    // 목록은 서버에서 온다 — 고정 시간이 아니라 항목이 뜰 때까지 기다린다.
    await page
      .waitForSelector(".bn-suggestion-menu [class*='item-title']", { timeout: 10000 })
      .catch(() => {});
    const text = await page.locator(".bn-suggestion-menu").innerText();
    check("문서 목록이 나온다", text.trim().length > 1, text.slice(0, 60).replace(/\n/g, " "));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(900);
    check("멘션이 본문에 들어간다", (await page.locator("[data-mention], .bn-inline-content a").count()) > 0);
  }
}

console.log("\n댓글");
{
  await page.locator("button", { hasText: "댓글" }).first().click();
  await page.waitForTimeout(1000);
  const box = page.locator('textarea[placeholder="커서가 있는 줄에 댓글 달기"]');
  check("댓글 패널이 열린다", (await box.count()) > 0);
  if ((await box.count()) > 0) {
    await box.fill("이거 확인 좀");
    await box.press("Enter");
    await page.waitForTimeout(2000);
    const panel = await page.locator('section[aria-label="댓글"]').innerText();
    check("댓글이 남는다", panel.includes("이거 확인 좀"), panel.slice(0, 80).replace(/\n/g, " "));

    const reply = page.locator('textarea[placeholder="답하기"]').first();
    if ((await reply.count()) > 0) {
      await reply.fill("확인했어");
      await reply.press("Enter");
      await page.waitForTimeout(2000);
      check("답글이 남는다", (await page.locator('section[aria-label="댓글"]').innerText()).includes("확인했어"));
    } else {
      check("답글 칸", false, "못 찾음");
    }

    await page.locator('button[aria-label="정리하기"]').first().click();
    await page.waitForTimeout(1800);
    check(
      "정리하면 목록에서 빠진다",
      !(await page.locator('section[aria-label="댓글"]').innerText()).includes("이거 확인 좀"),
    );
  }
}

console.log("\n파일 올리기");
{
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoU2NkYGD4z0AEYBxVSFJgYBSCBhgAHJgCAcqGcOMAAAAASUVORK5CYII=",
    "base64",
  );
  const up = await page.evaluate(
    async ({ id, bytes }) => {
      const form = new FormData();
      form.append("documentId", id);
      form.append("file", new File([new Uint8Array(bytes)], "점.png", { type: "image/png" }));
      const r = await fetch("/api/upload", { method: "POST", body: form });
      return { status: r.status, body: await r.text() };
    },
    { id: docId, bytes: [...png] },
  );
  check("업로드된다", up.status === 200, `${up.status} ${up.body.slice(0, 60)}`);
  if (up.status === 200) {
    const url = JSON.parse(up.body).url;
    const got = await page.evaluate(async (u) => {
      const r = await fetch(u);
      return { status: r.status, type: r.headers.get("content-type") };
    }, url);
    check("다시 받을 수 있다", got.status === 200 && got.type === "image/png", JSON.stringify(got));
  }
}

await page.screenshot({ path: "apps/web/scripts/e-all.png", fullPage: true });

// --- 정리: 임시 문서를 모래상자로 ---
await page.goto(docUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page
  .locator('[aria-label="더 보기"], button[title="더 보기"]')
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(500);
const trash = page.locator("button", { hasText: "모래상자로 보내기" });
if ((await trash.count()) > 0) {
  await trash.first().click();
  await page.waitForTimeout(1800);
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
console.log("남은 찌꺼기 치우기:");
console.log(`  npx tsx packages/db/scripts/cleanup-test-data.ts --yes ${docId}`);
if (errors.length > 0) {
  console.log("\n콘솔 오류:");
  for (const e of errors.slice(0, 10)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
