/**
 * 에이전트 점검 — 브라우저 없이 볼 수 있는 것만.
 *
 *   pnpm --filter @nyanotion/agent smoke
 *
 * 쿠팡 쪽은 실제 화면이 있어야 해서 여기서 보지 못한다 (그리고 막힌다). 대신 **조용히 틀릴 수
 * 있는 것들**을 본다: 네이버 응답 해석, 합계 정렬, 그리고 "결제 단추는 누르지 않는다" 규칙.
 */
import { readConfig } from "../src/config.ts";
import { searchNaver } from "../src/naver.ts";
import type { Candidate } from "../src/search.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

/** 네이버가 실제로 주는 모양. 제목에 태그와 엔티티가 섞여 온다. */
const NAVER_BODY = {
  items: [
    {
      title: "<b>고양이</b> 모래 10kg &amp; 사은품",
      link: "https://smartstore.naver.com/a",
      lprice: "12900",
      mallName: "냥이네",
      image: "https://img/a.jpg",
    },
    { title: "값이 없는 것", link: "https://x/y", lprice: "0", mallName: "" },
    { title: "주소가 없는 것", link: "", lprice: "9900", mallName: "" },
    {
      title: "싼 모래 5kg",
      link: "https://smartstore.naver.com/b",
      lprice: "8900",
      mallName: "B몰",
    },
  ],
};

async function main(): Promise<void> {
  const base = readConfig();

  console.log("네이버 응답 해석");
  {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(NAVER_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    try {
      const config = { ...base, naver: { clientId: "x", clientSecret: "y" }, maxOffers: 5 };
      const { candidates, note } = await searchNaver("고양이 모래", config);

      check("쓸 수 있는 것만 남는다", candidates.length === 2, candidates.length);
      check("태그와 엔티티를 벗긴다", candidates[0]?.title === "고양이 모래 10kg & 사은품", candidates[0]?.title);
      check("가격을 숫자로 읽는다", candidates[0]?.priceKrw === 12900, candidates[0]?.priceKrw);
      check("판매처를 남긴다", candidates[0]?.seller === "냥이네");
      check("값이 0 이면 버린다", !candidates.some((c) => c.priceKrw <= 0));
      check("주소가 없으면 버린다", !candidates.some((c) => c.url === ""));
      check("다 읽었으면 안내가 없다", note === null, note);
    } finally {
      globalThis.fetch = original;
    }
  }

  console.log("\n키가 없을 때");
  {
    const { candidates, note } = await searchNaver("무엇이든", { ...base, naver: null });
    check("조용히 건너뛴다", candidates.length === 0);
    check("이유를 알려 준다", note !== null && note.includes("키가 없습니다"), note);
  }

  console.log("\n합계로 고른다");
  {
    // 배송비를 빼고 비교하면 엉뚱한 것이 뽑힌다 — 이 앱에서 실제로 걸리는 함정이다.
    const offers: Candidate[] = [
      { source: "naver", title: "A", priceKrw: 14900, shippingKrw: 3000, url: "u", seller: "", imageUrl: "" },
      { source: "coupang", title: "B", priceKrw: 16000, shippingKrw: 0, url: "u", seller: "", imageUrl: "" },
    ];
    const cheapest = [...offers].sort(
      (a, b) => a.priceKrw + a.shippingKrw - (b.priceKrw + b.shippingKrw),
    )[0];
    check("배송비까지 더해 싼 것을 고른다", cheapest?.title === "B", cheapest?.title);
  }

  console.log("\n결제 단추 금지 규칙");
  {
    // cart.ts 의 두 번째 문과 같은 정규식. 여기서 깨지면 거기서도 깨진다.
    const NEVER = /결제|구매하기|바로구매|주문하기|결제하기/;
    check("'바로구매' 를 막는다", NEVER.test("바로구매"));
    check("'결제하기' 를 막는다", NEVER.test("결제하기"));
    check("'주문하기' 를 막는다", NEVER.test("주문하기"));
    check("'장바구니 담기' 는 통과한다", !NEVER.test("장바구니 담기"));
  }

  console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
process.exit(process.exitCode ?? 0);
