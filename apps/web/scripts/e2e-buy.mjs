/**
 * 구매 섹션 시험 — 적기 → 후보 → 승인 → 취소 → 히스토리.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-buy.mjs
 *
 * 실제 돈이 나가는 자리는 아직 없다 (주문은 에이전트 몫이고 아직 없다). 여기서 보는 것은
 * **승인 흐름이 제대로 막고 열리는가** 다 — 한도를 넘으면 막히는지, 유예 안에 물릴 수 있는지.
 *
 * 임시 문서를 만들어 쓰고 끝에 치운다.
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

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

console.log(await signIn(page));

const NAME = `시험 고양이모래 ${Date.now().toString().slice(-6)}`;
const board = () => page.locator("article", { hasText: NAME }).first();

await page.goto(`${BASE}/buy`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

console.log("\n적기");
{
  await page.locator('input[aria-label="살 것"]').fill(NAME);
  await page.locator('input[aria-label="가격 한도"]').fill("20000");
  await page.locator("button", { hasText: "적기" }).first().click();
  const came = await page
    .waitForSelector(`text=${NAME}`, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check("목록에 올라온다", came);
  check("상태가 '적어 둠' 이다", (await board().innerText()).includes("적어 둠"));
  check("한도가 보인다", (await board().innerText()).includes("20,000원"));
}

console.log("\n후보 넣기 (한도보다 비싼 것)");
{
  await board().locator("button", { hasText: "후보 직접 넣기" }).click();
  await page.waitForTimeout(400);
  await board().locator('input[aria-label="상품 이름"]').fill("비싼 모래 10kg");
  await board().locator('input[aria-label="가격"]').fill("25000");
  await board().locator('input[aria-label="상품 주소"]').fill("https://example.com/a");
  await board().locator("button", { hasText: "후보로 올리기" }).click();
  await page.waitForTimeout(2000);

  const text = await board().innerText();
  check("승인 기다림으로 바뀐다", text.includes("승인 기다림"), text.slice(0, 80).replace(/\n/g, " "));
  check("한도 초과를 알려 준다", text.includes("한도"), text.slice(0, 160).replace(/\n/g, " "));

  const approve = board().locator("button", { hasText: "승인" });
  check("한도를 넘으면 승인이 막힌다", await approve.first().isDisabled());
}

console.log("\n더 싼 후보로 바꾸기");
{
  await board().locator("button", { hasText: "후보 직접 넣기" }).click();
  await page.waitForTimeout(400);
  await board().locator('input[aria-label="상품 이름"]').fill("싼 모래 10kg");
  await board().locator('input[aria-label="가격"]').fill("14900");
  await board().locator('input[aria-label="배송비"]').fill("3000");
  await board().locator('input[aria-label="상품 주소"]').fill("https://example.com/b");
  await board().locator("button", { hasText: "후보로 올리기" }).click();
  await page.waitForTimeout(2000);

  const text = await board().innerText();
  check("합계로 보여 준다", text.includes("17,900원"), text.slice(0, 120).replace(/\n/g, " "));
  check("승인이 열린다", !(await board().locator("button", { hasText: "승인" }).first().isDisabled()));
}

console.log("\n승인");
{
  await board().locator("button", { hasText: "승인" }).first().click();
  await page.waitForTimeout(2200);
  const text = await board().innerText();
  check("승인됨으로 바뀐다", text.includes("승인됨"), text.slice(0, 80).replace(/\n/g, " "));
  check("누가 승인했는지 남는다", text.includes("승인"), "");
  check("물릴 수 있다고 알려 준다", text.includes("물릴 수 있어요"), text.slice(0, 200).replace(/\n/g, " "));
}

console.log("\n취소");
{
  await board().locator("button", { hasText: "취소" }).first().click();
  await page.waitForTimeout(2200);
  const text = await board().innerText();
  check("안 사기로 함으로 바뀐다", text.includes("안 사기로 함"), text.slice(0, 80).replace(/\n/g, " "));
}

console.log("\n히스토리");
{
  const history = page.locator("button", { hasText: "구매 기록" });
  check("기록 줄이 보인다", (await history.count()) > 0);
  if ((await history.count()) > 0) {
    await history.first().click();
    await page.waitForTimeout(600);
    const text = await page.locator("section", { hasText: "구매 기록" }).innerText();
    check("취소된 것도 남는다", text.includes("취소됨"), text.slice(0, 160).replace(/\n/g, " "));
  }
}

await page.screenshot({ path: "apps/web/scripts/e-buy.png", fullPage: true });

console.log("\n정리");
{
  await board().locator("button", { hasText: "목록에서 빼기" }).click();
  await page.waitForTimeout(1800);
  check("살 것 카드가 사라진다", (await page.locator("article", { hasText: NAME }).count()) === 0);
  // **기록에는 남아야 한다** — "그때 왜 이걸 샀지"에 답하는 게 이 기능의 절반이다.
  const toggle = page.locator("button", { hasText: "구매 기록" }).first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await page.waitForTimeout(700);
  const history = await page.locator("section", { hasText: "구매 기록" }).innerText();
  check("구매 기록에는 남는다", history.includes(NAME), history.slice(0, 120));
  console.log("  (살 것의 문서는 트리에 남습니다 — 표에서 빼는 것과 같은 규칙)");
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (errors.length > 0) {
  console.log("\n콘솔 오류:");
  for (const e of errors.slice(0, 6)) console.log("  ", e);
}
await browser.close();
process.exit(fail === 0 ? 0 : 1);
