import { loadEnv, currentEnv } from "@nyanotion/db";
import { closeContext, loginFlow } from "./browser.ts";
import { runCarts } from "./cart.ts";
import { log, readConfig } from "./config.ts";
import { runSearches } from "./search.ts";

/**
 * 데스크탑 에이전트 — 집 컴퓨터에서 도는 일꾼.
 *
 * 두 가지만 한다:
 *   1. `searching` 인 살 것의 값을 찾아 후보를 올리고 **승인을 청한다**
 *   2. 승인되고 유예가 끝난 것을 **장바구니에 담고 결제 화면을 열어 둔다**
 *
 * **결제는 사람이 누른다.** 그 선을 코드로 지킨다 (cart.ts).
 *
 *   pnpm --filter @nyanotion/agent login   한 번만 — 쿠팡·네이버에 로그인해 둔다
 *   pnpm --filter @nyanotion/agent start   계속 돌린다
 *   pnpm --filter @nyanotion/agent once    한 바퀴만 돌고 끝
 */

loadEnv();

const config = readConfig();
const once = process.argv.includes("--once");
const login = process.argv.includes("--login");

let stopping = false;

async function tick(): Promise<void> {
  try {
    const found = await runSearches(config);
    const carted = await runCarts(config);
    if (found === 0 && carted === 0) return; // 조용할 때는 아무 말도 하지 않는다
    log(`한 바퀴 — 찾음 ${found}, 담음 ${carted}`);
  } catch (error) {
    // 한 바퀴가 실패해도 계속 돈다. 멈추면 아무도 알아채지 못한다.
    log("한 바퀴 실패:", error instanceof Error ? error.message : error);
  }
}

async function main(): Promise<void> {
  if (login) {
    await loginFlow(config);
    return;
  }

  log(`에이전트 시작 — 환경 ${currentEnv()}`);
  log(`  네이버 검색 API ${config.naver === null ? "없음 (쿠팡만)" : "있음"}`);
  log(`  브라우저 ${config.headed ? "창 띄움" : "숨김"} · 프로필 ${config.profileDir}`);
  if (config.naver === null) {
    log("  네이버 키를 넣으면 더 잘 찾습니다 — docs/08-purchase.md 참고");
  }

  if (once) {
    await tick();
    await closeContext();
    return;
  }

  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, config.pollMs));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) process.exit(0);
    stopping = true;
    log("멈추는 중… (한 번 더 누르면 바로 종료)");
    void closeContext().then(() => process.exit(0));
  });
}

await main();
await closeContext();
process.exit(0);
