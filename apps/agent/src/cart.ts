import {
  markOrderCarted,
  markOrderFailed,
  ordersReadyToPlace,
  watchersOfDocument,
} from "@nyanotion/db";
import { sendToUsers } from "@nyanotion/notify";
import { getContext } from "./browser.ts";
import type { Config } from "./config.ts";
import { log } from "./config.ts";

/**
 * 승인된 것을 **장바구니에 담고 결제 화면까지 열어 둔다.**
 *
 * ────────────────────────────────────────────────────────────────────────
 *  **결제 단추는 절대 누르지 않는다.** 이건 설정이 아니라 규칙이다.
 *
 *  선택자 하나만 잘못 읽어도 엉뚱한 것을 사 버리고, 그건 되돌릴 수 없다.
 *  마지막 한 번을 사람이 누르면 그 사고가 구조적으로 불가능해진다.
 *  이 파일에 결제·주문완료 버튼을 누르는 코드를 넣지 말 것.
 * ────────────────────────────────────────────────────────────────────────
 *
 * 유예(`cancellableUntil`)가 끝난 주문만 집는다. 그 전에는 앱에서 물릴 수 있어야 한다.
 */

/** 장바구니 담기 단추로 보이는 것들. 화면이 바뀌면 여기만 고치면 된다. */
const ADD_TO_CART = [
  "button.prod-cart-btn",
  "a.prod-cart-btn",
  "button:has-text('장바구니 담기')",
  "button:has-text('장바구니')",
  "a:has-text('장바구니 담기')",
];

/** 절대 누르면 안 되는 것들. 실수로 선택자를 넓혔을 때를 대비한 두 번째 문. */
const NEVER_CLICK = /결제|구매하기|바로구매|주문하기|결제하기/;

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export async function runCarts(config: Config): Promise<number> {
  const orders = await ordersReadyToPlace(3);
  let done = 0;

  for (const order of orders) {
    log(`장바구니: ${order.itemTitle} — ${won(order.totalKrw)}`);

    if (order.source !== "coupang") {
      // 네이버는 스토어마다 화면이 달라 담기를 자동화할 수 없다.
      // 대신 **상품 페이지를 열어 두고** 사람에게 넘긴다.
      await openForHuman(order.url, config);
      await markOrderCarted(order.id);
      await tell(order, "상품 페이지를 열어 뒀어요. 담아서 결제해 주세요.");
      done += 1;
      continue;
    }

    try {
      const ok = await addToCoupangCart(order.url, config);
      if (ok) {
        await markOrderCarted(order.id);
        await tell(order, "장바구니에 담아 뒀어요. 결제만 누르면 됩니다.");
        done += 1;
      } else {
        await openForHuman(order.url, config);
        await markOrderFailed(
          order.id,
          "장바구니에 담지 못했습니다. 상품 페이지를 열어 뒀으니 직접 담아 주세요.",
        );
        await tell(order, "자동으로 담지 못했어요. 상품 페이지를 열어 뒀습니다.");
      }
    } catch (error) {
      const why = String(error).slice(0, 120);
      log("  실패", why);
      await markOrderFailed(order.id, `장바구니 담기가 멈췄습니다: ${why}`);
      await tell(order, "장바구니에 담다가 멈췄어요. 앱에서 확인해 주세요.");
    }

    await new Promise((r) => setTimeout(r, config.politeMs));
  }

  return done;
}

/** 쿠팡 상품 페이지에서 장바구니 담기까지. 결제로는 가지 않는다. */
async function addToCoupangCart(url: string, config: Config): Promise<boolean> {
  const context = await getContext(config);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(config.politeMs);

    for (const selector of ADD_TO_CART) {
      const button = page.locator(selector).first();
      if ((await button.count()) === 0) continue;

      // 두 번째 문: 글자에 결제/구매가 들어 있으면 손대지 않는다.
      const text = (await button.textContent().catch(() => "")) ?? "";
      if (NEVER_CLICK.test(text)) {
        log("  결제 단추처럼 보여 건드리지 않습니다:", text.trim().slice(0, 20));
        continue;
      }

      await button.click({ timeout: 8000 });
      await page.waitForTimeout(1500);

      // 담겼는지 확인 — 확인 레이어나 장바구니 수가 오른다.
      const added =
        (await page.locator("text=/장바구니에 담았|장바구니 보기/").count().catch(() => 0)) > 0;
      if (added) {
        // 결제 화면까지 **열어만** 둔다. 사람이 이 탭에서 마무리한다.
        await page.goto("https://cart.coupang.com/cartView.pc", { waitUntil: "domcontentloaded" });
        log("  담았습니다. 장바구니를 열어 뒀습니다.");
        return true;
      }
    }

    return false;
  } finally {
    // **페이지를 닫지 않는다** — 사람이 이어서 결제해야 한다.
  }
}

/** 자동으로 못 할 때는 그냥 열어 둔다. 사람이 이어서 한다. */
async function openForHuman(url: string, config: Config): Promise<void> {
  const context = await getContext(config);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
}

async function tell(
  order: { id: string; itemId: string | null; documentId: string | null; itemTitle: string },
  body: string,
): Promise<void> {
  try {
    if (order.documentId === null) return;
    const watchers = await watchersOfDocument(order.documentId);
    if (watchers.length === 0) return;
    await sendToUsers(watchers, {
      title: order.itemTitle === "" ? "구매" : order.itemTitle,
      body,
      url: "/buy",
      tag: `purchase-order:${order.id}`,
      kind: "purchase-result",
    });
  } catch (error) {
    log("알림 실패", error instanceof Error ? error.message : error);
  }
}
