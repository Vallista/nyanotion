import {
  listItemsForAgent,
  replaceOffers,
  updateItem,
  watchersOfDocument,
  type PurchaseSource,
} from "@nyanotion/db";
import { sendToUsers } from "@nyanotion/notify";
import type { Config } from "./config.ts";
import { log } from "./config.ts";
import { searchCoupang } from "./coupang.ts";
import { searchNaver } from "./naver.ts";

export type Candidate = {
  source: PurchaseSource;
  title: string;
  priceKrw: number;
  shippingKrw: number;
  url: string;
  seller: string;
  imageUrl: string;
};

/**
 * `searching` 인 살 것을 집어 값을 찾아 온다.
 *
 * 두 곳을 다 보고 **합계(가격 + 배송비)로 정렬해** 싼 것부터 올린다.
 * 한 쪽이 막히거나 실패해도 나머지로 진행한다 — 둘 다 실패해야 실패다.
 *
 * 찾고 나면 상태를 `proposed` 로 바꾸고 **가족 전체에게 알린다.** 승인은 아무나 한 명이면 된다.
 */

/** 이 프로세스가 지금 붙들고 있는 것들. 에이전트는 한 대만 돈다는 전제다. */
const working = new Set<string>();

function totalOf(candidate: Candidate): number {
  return candidate.priceKrw + candidate.shippingKrw;
}

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export async function runSearches(config: Config): Promise<number> {
  const items = await listItemsForAgent(["searching"], 5);
  let done = 0;

  for (const item of items) {
    if (working.has(item.id)) continue;
    working.add(item.id);

    try {
      const query = item.title.trim();
      if (query === "") {
        await updateItem(item.id, { state: "failed", note: "무엇을 살지 이름이 비어 있습니다." });
        continue;
      }

      log(`찾는 중: ${query}`);

      // 네이버(API)를 먼저 — 빠르고 막히지 않는다. 그다음 쿠팡(브라우저).
      const naver = await searchNaver(query, config);
      const coupang = await searchCoupang(query, config);

      const all = [...naver.candidates, ...coupang.candidates].sort(
        (a, b) => totalOf(a) - totalOf(b),
      );

      // 한도가 있으면 넘는 것은 아예 올리지 않는다 — 고를 수 없는 것을 보여 줄 이유가 없다.
      const within =
        item.maxPriceKrw === null ? all : all.filter((c) => totalOf(c) <= item.maxPriceKrw!);
      const offers = (within.length > 0 ? within : all).slice(0, config.maxOffers);

      const notes = [naver.note, coupang.note].filter((n): n is string => n !== null);

      if (offers.length === 0) {
        // 둘 다 실패했는데 네이버 키가 없으면, 그게 진짜 원인이다 — 그걸 먼저 말해 준다.
        const hint =
          config.naver === null
            ? " 네이버 검색 API 키를 넣으면 대부분 해결됩니다 (docs/08-purchase.md)."
            : "";
        await updateItem(item.id, {
          state: "failed",
          note: `${notes.join(" ") || "두 곳 모두에서 찾지 못했습니다."}${hint}`,
        });
        log(`  못 찾음: ${query}`);
        continue;
      }

      await replaceOffers(item.id, offers);

      const overBudget =
        item.maxPriceKrw !== null && within.length === 0
          ? `찾은 것이 모두 한도(${won(item.maxPriceKrw)})보다 비쌉니다. `
          : "";
      await updateItem(item.id, {
        state: "proposed",
        note: (overBudget + notes.join(" ")).trim(),
      });

      const best = offers[0]!;
      log(`  ${offers.length}건 — 가장 싼 것 ${won(totalOf(best))} (${best.source})`);
      await notifyApproval(item.id, item.documentId, query, best);
      done += 1;
    } catch (error) {
      log("찾기 실패", error instanceof Error ? error.message : error);
      await updateItem(item.id, {
        state: "failed",
        note: `찾다가 멈췄습니다: ${String(error).slice(0, 120)}`,
      }).catch(() => {});
    } finally {
      working.delete(item.id);
      // 다음 검색까지 한 박자 쉰다.
      await new Promise((r) => setTimeout(r, config.politeMs));
    }
  }

  return done;
}

async function notifyApproval(
  itemId: string,
  documentId: string,
  name: string,
  best: Candidate,
): Promise<void> {
  try {
    const watchers = await watchersOfDocument(documentId);
    if (watchers.length === 0) return;

    await sendToUsers(watchers, {
      title: "승인해 주세요",
      body: `${name} — ${won(totalOf(best))} (${best.source === "coupang" ? "쿠팡" : "네이버"})`,
      url: `/buy?item=${itemId}`,
      tag: `purchase:${itemId}`,
      kind: "purchase-approval",
      actions: [{ action: "approve", title: "승인" }],
    });
  } catch (error) {
    // 알림이 못 가도 승인 요청 자체는 화면에 떠 있다.
    log("알림 실패", error instanceof Error ? error.message : error);
  }
}
