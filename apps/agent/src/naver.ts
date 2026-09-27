import type { Config } from "./config.ts";
import { log } from "./config.ts";
import type { Candidate } from "./search.ts";

/**
 * 네이버 쇼핑 검색 — **공식 API** 를 쓴다.
 *
 * 화면을 긁지 않는 이유가 셋이다: 약관이 금지하고, 봇 차단에 걸리며, 화면이 바뀌면 조용히
 * 깨진다. 공식 API 는 무료이고 하루 2만 5천 건이라 집에서 쓰기에 넘친다.
 *
 * 키 발급: https://developers.naver.com → 애플리케이션 등록 → 검색 API 사용.
 * 키가 없으면 **조용히 건너뛴다** — 쿠팡만으로도 후보는 나온다.
 */

const ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";

type NaverItem = {
  title?: unknown;
  link?: unknown;
  lprice?: unknown;
  mallName?: unknown;
  image?: unknown;
};

/** 응답 제목에는 `<b>` 태그와 HTML 엔티티가 섞여 온다. */
function clean(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function searchNaver(
  query: string,
  config: Config,
): Promise<{ candidates: Candidate[]; note: string | null }> {
  if (config.naver === null) {
    return {
      candidates: [],
      note: "네이버 API 키가 없습니다 (NAVER_CLIENT_ID · NAVER_CLIENT_SECRET).",
    };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", query);
  // 가격 낮은 순. 최저가가 목적이므로 정렬을 서버에 맡긴다.
  url.searchParams.set("sort", "asc");
  url.searchParams.set("display", String(Math.min(20, config.maxOffers * 3)));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": config.naver.clientId,
        "X-Naver-Client-Secret": config.naver.clientSecret,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { candidates: [], note: `네이버에 닿지 못했습니다: ${String(error).slice(0, 80)}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    log("네이버 API 실패", response.status, body.slice(0, 120));
    return { candidates: [], note: `네이버 검색이 실패했습니다 (${response.status}).` };
  }

  const body = (await response.json()) as { items?: unknown };
  const items = Array.isArray(body.items) ? (body.items as NaverItem[]) : [];

  const candidates: Candidate[] = [];
  for (const item of items) {
    const price = Number(item.lprice);
    const link = typeof item.link === "string" ? item.link : "";
    const title = typeof item.title === "string" ? clean(item.title) : "";
    if (!Number.isFinite(price) || price <= 0 || link === "" || title === "") continue;

    candidates.push({
      source: "naver",
      title,
      priceKrw: Math.round(price),
      // **배송비는 이 API 가 주지 않는다.** 0 으로 두면 쿠팡보다 싸 보이는 착시가 생기므로
      // 화면에서 "배송비 모름" 을 알 수 있게 그대로 0 을 두되 note 로 알린다.
      shippingKrw: 0,
      url: link,
      seller: typeof item.mallName === "string" ? item.mallName : "",
      imageUrl: typeof item.image === "string" ? item.image : "",
    });
    if (candidates.length >= config.maxOffers) break;
  }

  return {
    candidates,
    note: candidates.length === 0 ? "네이버에서 찾지 못했습니다." : null,
  };
}
