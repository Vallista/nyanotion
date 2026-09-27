import type { Config } from "./config.ts";
import { log } from "./config.ts";
import { getContext } from "./browser.ts";
import type { Candidate } from "./search.ts";

/**
 * 쿠팡 검색 — 공식 API 가 없어서 **사람 브라우저로 연다.**
 *
 * 쿠팡은 봇을 막는다. 그래서 여기는 다음을 지킨다:
 *   - 사람이 로그인해 둔 지속 프로필을 그대로 쓴다 (새 세션을 만들지 않는다)
 *   - 한 번에 한 검색, 사이 간격을 둔다
 *   - **막히면 물러난다.** 우회하려 들지 않는다 — 그건 선을 넘는 일이고,
 *     네이버 값만으로도 후보는 나온다
 *
 * 화면 구조가 바뀌면 조용히 0건이 된다. 그래서 0건일 때 "없다" 가 아니라
 * **"못 읽었다"** 로 구분해 알린다 — 사람이 손으로 후보를 넣을 수 있게.
 */

/** "12,900원" → 12900. 읽지 못하면 null. */
function parseWon(text: string | null): number | null {
  if (text === null) return null;
  const digits = text.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function searchCoupang(
  query: string,
  config: Config,
): Promise<{ candidates: Candidate[]; note: string | null }> {
  const context = await getContext(config);
  const page = await context.newPage();

  try {
    const url = `https://www.coupang.com/np/search?q=${encodeURIComponent(query)}&sorter=scoreDesc`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(config.politeMs);

    // 막혔는지 먼저 본다. 우회하지 않는다.
    const blocked = await page
      .locator("text=/일시적으로 접속이 원활하지|비정상적인 접근|Access Denied/i")
      .count()
      .catch(() => 0);
    if (blocked > 0) {
      log("쿠팡이 막았습니다 — 이번에는 건너뜁니다.");
      return { candidates: [], note: "쿠팡이 자동 접속을 막았습니다." };
    }

    // 검색 결과 목록. 클래스 이름이 자주 바뀌므로 여러 후보를 본다.
    const items = page.locator(
      "ul#productList > li[data-product-id], ul.search-product-list > li[data-product-id], li.search-product",
    );
    const found = await items.count().catch(() => 0);
    if (found === 0) {
      return {
        candidates: [],
        note: "쿠팡 화면을 읽지 못했습니다 (구조가 바뀌었을 수 있어요). 후보를 직접 넣어 주세요.",
      };
    }

    const candidates: Candidate[] = [];
    const take = Math.min(found, config.maxOffers * 2);

    for (let i = 0; i < take && candidates.length < config.maxOffers; i += 1) {
      const item = items.nth(i);

      // 광고는 뺀다 — 최저가를 찾는 일에 섞일 이유가 없다.
      const ad = await item.locator("[class*='ad-badge'], [class*='adMark']").count().catch(() => 0);
      if (ad > 0) continue;

      const title = (
        await item.locator("[class*='name'], .name").first().textContent().catch(() => null)
      )?.trim();
      const price = parseWon(
        await item.locator("[class*='price-value'], .price-value").first().textContent().catch(() => null),
      );
      const href = await item.locator("a").first().getAttribute("href").catch(() => null);

      if (title === undefined || title === "" || price === null || href === null) continue;

      // 배송비: "무료배송" 이 아니면 읽어 본다. 못 읽으면 0 으로 두되 화면이 안내한다.
      const deliveryText = await item
        .locator("[class*='delivery'], [class*='badge']")
        .first()
        .textContent()
        .catch(() => null);
      const free = deliveryText !== null && /무료/.test(deliveryText);
      const shipping = free ? 0 : (parseWon(deliveryText) ?? 0);

      candidates.push({
        source: "coupang",
        title,
        priceKrw: price,
        shippingKrw: shipping,
        url: href.startsWith("http") ? href : `https://www.coupang.com${href}`,
        seller: "",
        imageUrl: "",
      });
    }

    return {
      candidates,
      note: candidates.length === 0 ? "쿠팡에서 쓸 만한 후보를 찾지 못했습니다." : null,
    };
  } catch (error) {
    return {
      candidates: [],
      note: `쿠팡을 보지 못했습니다: ${String(error).slice(0, 80)}`,
    };
  } finally {
    await page.close().catch(() => {});
  }
}
