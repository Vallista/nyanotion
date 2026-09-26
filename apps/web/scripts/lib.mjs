/**
 * 점검 스크립트들이 같이 쓰는 것들.
 *
 * **이 스크립트들은 실제 문서를 연다. 편집을 남기지 말 것** —
 * Enter 로 블록을 쪼개지 말고, 친 글자는 반드시 Backspace 로 되돌린다.
 * 새로 만들어도 되는 것은 e2e-editor.mjs 처럼 임시 문서를 만들어 쓰고 모래상자로 보낸다.
 */

export const BASE = process.env.INSPECT_URL ?? "http://localhost:3000";
export const EMAIL = process.env.INSPECT_EMAIL ?? "mgh950714@gmail.com";
export const PASSWORD = process.env.INSPECT_PASSWORD ?? "nyanotion-first";

/**
 * 로그인한다. 계정이 아직 없으면 (비어 있는 dev·beta DB) 그 자리에서 만든다 —
 * **맨 처음 한 명만** 초대 없이 되고, 그 뒤로는 어드민이 발급한 초대가 있어야 한다.
 */
export async function signIn(page, { base = BASE, email = EMAIL, password = PASSWORD } = {}) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  const landed = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (landed) return "로그인";

  // 계정이 없다 — 가입으로 바꿔서 만든다.
  const toggle = page.locator("button", { hasText: "계정을 새로 만들래요" });
  if ((await toggle.count()) === 0) throw new Error("로그인도 가입도 되지 않습니다.");
  await toggle.first().click();
  await page.waitForTimeout(300);

  const name = page.locator('input[name="name"]');
  if ((await name.count()) > 0) await name.fill("캣타워");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
  return "가입";
}

/**
 * 글을 칠 수 있는 빈 줄에 커서를 놓는다.
 *
 * 문단이 없을 수도 있다 — 마지막 줄이 콜아웃·인용이면 BlockNote 는 뒤에 문단을 붙이지 않는다
 * (표·수식 같은 블록만 우리가 직접 붙인다). 그때는 사람이 하듯 마지막 줄 끝에서 Enter 를 친다.
 */
export async function focusLastLine(page) {
  const paragraphs = page.locator('.bn-editor [data-content-type="paragraph"]');

  if ((await paragraphs.count()) === 0) {
    const last = page.locator(".bn-editor .bn-inline-content").last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
  }

  const line = paragraphs.last();
  // 표·달력이 길면 문단이 화면 밖에 있다 — 그대로 누르면 엉뚱한 곳이 눌린다.
  await line.scrollIntoViewIfNeeded();
  await line.click();
  await page.keyboard.press("End");
  // 표 블록이 다시 그려지는 중이면 첫 글자가 삼켜진다 — 가라앉을 때까지 기다린다.
  await page.waitForTimeout(900);
}
