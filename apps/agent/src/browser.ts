import { mkdir } from "node:fs/promises";
import { chromium, type BrowserContext } from "playwright";
import type { Config } from "./config.ts";
import { log } from "./config.ts";

/**
 * 브라우저 하나를 **계속 살려 둔다.**
 *
 * 쿠팡·네이버는 로그인 상태를 쿠키로 들고 있고, 프로필을 지속시키면 사람이 한 번 로그인해 둔
 * 것을 그대로 쓴다 — 비밀번호를 우리가 저장하지 않아도 된다는 뜻이다. 이게 이 설계의 핵심이다.
 *
 * **창을 띄워 둔다** (기본). 자동으로 장바구니를 만지는 일이라 사람이 보고 있어야 하고,
 * 막히면 그 자리에서 손으로 풀 수 있어야 한다.
 *
 * 한 프로필은 **한 번에 하나만** 열 수 있다. 그래서 여기 모듈이 하나를 들고 돌려 쓴다.
 */

let context: BrowserContext | null = null;

export async function getContext(config: Config): Promise<BrowserContext> {
  if (context !== null) return context;

  await mkdir(config.profileDir, { recursive: true });
  log(`브라우저를 엽니다 — 프로필 ${config.profileDir}`);

  context = await chromium.launchPersistentContext(config.profileDir, {
    headless: !config.headed,
    viewport: { width: 1280, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    // 기본 타임아웃을 넉넉히 — 쇼핑몰은 느리다.
    args: ["--disable-blink-features=AutomationControlled"],
  });
  context.setDefaultTimeout(20_000);

  context.on("close", () => {
    context = null;
  });

  return context;
}

export async function closeContext(): Promise<void> {
  if (context === null) return;
  const open = context;
  context = null;
  await open.close().catch(() => {});
}

/**
 * 로그인해 두기. `pnpm --filter @nyanotion/agent login` 으로 부른다.
 *
 * 창을 열어 두고 사람이 직접 로그인하게 한다 — **비밀번호를 우리가 받지 않는다.**
 * 한 번 해 두면 프로필에 남아서 다음부터 에이전트가 그대로 쓴다.
 */
export async function loginFlow(config: Config): Promise<void> {
  const browser = await getContext({ ...config, headed: true });
  const page = browser.pages()[0] ?? (await browser.newPage());

  await page.goto("https://www.coupang.com").catch(() => {});
  log("");
  log("창이 열렸습니다. 쿠팡에 로그인하세요.");
  log("네이버도 쓰려면 같은 창에서 https://www.naver.com 으로 가서 로그인하면 됩니다.");
  log("끝나면 이 터미널에서 Ctrl+C 를 누르세요 — 로그인은 프로필에 남습니다.");
  log("");

  // 사람이 끝낼 때까지 기다린다.
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    process.once("SIGINT", done);
    browser.once("close", done);
  });

  await closeContext();
}
