"use server";

import {
  appendOffers,
  approve,
  markOrderPlaced,
  cancelOrder,
  chooseOffer,
  chosenOffer,
  createDocument,
  createItem,
  documentOfItem,
  documentOfOrder,
  getItem,
  removeItem,
  replaceOffers,
  updateItem,
  type PurchaseSource,
} from "@nyanotion/db";
import { revalidatePath } from "next/cache";
import { assertCanWrite, requireViewer } from "@/lib/session";
import { notifyWatchers, won } from "@/lib/purchase-notify";

/**
 * 구매 섹션의 서버 동작.
 *
 * **돈이 나가는 일이라 권한을 두 번 본다** — 여기서 한 번(`assertCanWrite`),
 * 그리고 살 것은 늘 문서에 매여 있으므로 그 문서 기준으로 판정한다. 구매용 권한을 따로
 * 만들지 않는다. 문서를 고칠 수 있는 사람 = 그 살 것을 다룰 수 있는 사람이다.
 *
 * **승인해도 곧바로 사지 않는다.** 유예(GRACE_MS) 가 지난 뒤에 데스크탑 에이전트가 집어 간다 —
 * 잘못 누른 것을 되돌릴 길이 없으면 자동 구매는 무섭기만 하다.
 */

/** 승인하고 나서 물릴 수 있는 시간. 짧게 두되, 폰에서 "아 아니야" 할 틈은 된다. */
const GRACE_MS = 5 * 60 * 1000;

/** 살 것에 손대려면 그 문서를 고칠 수 있어야 한다. */
async function itemGate(itemId: string) {
  const documentId = await documentOfItem(itemId);
  if (documentId === null) throw new Error("살 것을 찾을 수 없습니다.");
  const viewer = await assertCanWrite(documentId);
  return { viewer, documentId };
}

function refresh(): void {
  revalidatePath("/buy");
  revalidatePath("/", "layout");
}

/** 살 것을 하나 적는다. 문서가 같이 생긴다 — 열면 메모·사진을 쓸 수 있다. */
export async function addPurchaseItemAction(input: {
  title: string;
  spaceId?: string;
  quantity?: number;
  maxPriceKrw?: number | null;
  neededBy?: string | null;
}): Promise<void> {
  const viewer = await requireViewer();
  const title = input.title.trim();
  if (title === "") throw new Error("무엇을 살지 적어 주세요.");

  const spaceId = input.spaceId ?? viewer.personalSpace.id;
  if (!viewer.spaceIds.includes(spaceId))
    throw new Error("이 공간에 적을 수 없습니다.");

  const documentId = await createDocument({
    spaceId,
    userId: viewer.userId,
    title,
  });
  await createItem({
    documentId,
    createdBy: viewer.userId,
    quantity: input.quantity,
    maxPriceKrw: input.maxPriceKrw ?? null,
    neededBy: input.neededBy ?? null,
  });
  refresh();
}

export async function updatePurchaseItemAction(
  itemId: string,
  patch: {
    quantity?: number;
    maxPriceKrw?: number | null;
    neededBy?: string | null;
  },
): Promise<void> {
  await itemGate(itemId);
  await updateItem(itemId, patch);
  refresh();
}

/** 목록에서 뺀다. **문서는 남는다** — 표에서 빼는 것과 같은 규칙이다. */
export async function removePurchaseItemAction(itemId: string): Promise<void> {
  await itemGate(itemId);
  await removeItem(itemId);
  refresh();
}

/** 가격을 찾아 달라고 표시한다. 데스크탑 에이전트가 이 상태를 보고 집어 간다. */
export async function requestSearchAction(itemId: string): Promise<void> {
  await itemGate(itemId);
  await updateItem(itemId, { state: "searching", note: "" });
  refresh();
}

/**
 * 후보를 손으로 넣는다.
 *
 * 에이전트가 아직 없을 때 쓰려고 둔 길이고, 에이전트가 생긴 뒤에도 남긴다 —
 * "내가 본 게 더 싸다" 를 반영할 자리가 필요하다.
 */
export async function addOffersAction(
  itemId: string,
  offers: readonly {
    source: PurchaseSource;
    title: string;
    priceKrw: number;
    shippingKrw?: number;
    url: string;
    seller?: string;
  }[],
  /** 찾아 온 것으로 **갈아 끼울지**. 에이전트는 true, 사람이 손으로 넣을 때는 false. */
  replace = false,
): Promise<void> {
  const { viewer, documentId } = await itemGate(itemId);
  if (offers.length === 0) throw new Error("후보가 없습니다.");
  for (const offer of offers) {
    if (!Number.isFinite(offer.priceKrw) || offer.priceKrw <= 0)
      throw new Error("가격이 이상합니다.");
    if (!/^https?:\/\//.test(offer.url)) throw new Error("주소가 이상합니다.");
  }

  if (replace) await replaceOffers(itemId, offers);
  else await appendOffers(itemId, offers);
  await updateItem(itemId, { state: "proposed", note: "" });

  const item = await getItem(itemId, viewer.spaceIds);
  const best = await chosenOffer(itemId);
  const name = item?.title ?? "살 것";
  await notifyWatchers(documentId, {
    title: "승인해 주세요",
    body:
      best === null
        ? `${name} 의 후보를 찾았어요.`
        : `${name} — ${won(best.totalKrw)} (${best.source === "coupang" ? "쿠팡" : "네이버"})`,
    url: `/buy?item=${itemId}`,
    tag: `purchase:${itemId}`,
    kind: "purchase-approval",
    actions: [{ action: "approve", title: "승인" }],
  });

  refresh();
}

export async function chooseOfferAction(
  itemId: string,
  offerId: string,
): Promise<void> {
  await itemGate(itemId);
  await chooseOffer(itemId, offerId);
  refresh();
}

/**
 * 승인. **가족 누구든 한 명이면 된다.**
 *
 * 여기서 주문을 만들되 `cancellableUntil` 이 지나기 전에는 아무도 사지 않는다.
 * 승인한 사람 말고 나머지 가족에게 "승인됐다" 를 알린다 — 같은 것을 두 번 승인하지 않게.
 */
export async function approvePurchaseAction(itemId: string): Promise<void> {
  const { viewer, documentId } = await itemGate(itemId);

  const item = await getItem(itemId, viewer.spaceIds);
  if (item === null) throw new Error("살 것을 찾을 수 없습니다.");
  if (item.state !== "proposed")
    throw new Error("지금은 승인할 수 없는 상태입니다.");

  const offer = await chosenOffer(itemId);
  if (offer === null) throw new Error("고른 후보가 없습니다.");

  // 한도를 넘으면 막는다. 한도는 자동 구매의 가장 중요한 안전장치다.
  if (item.maxPriceKrw !== null && offer.totalKrw > item.maxPriceKrw) {
    throw new Error(
      `정해 둔 한도(${won(item.maxPriceKrw)})보다 비쌉니다. 한도를 고치거나 다른 후보를 고르세요.`,
    );
  }

  await approve({
    itemId,
    // 기록이 살 것보다 오래 살도록 지금 값을 복사해 둔다.
    spaceId: item.spaceId,
    documentId: item.documentId,
    itemTitle: item.title,
    offer,
    approvedBy: viewer.userId,
    graceMs: GRACE_MS,
  });

  await notifyWatchers(
    documentId,
    {
      title: "승인됐습니다",
      body: `${item.title} — ${won(offer.totalKrw)}. ${Math.round(GRACE_MS / 60000)}분 안에는 취소할 수 있어요.`,
      url: `/buy?item=${itemId}`,
      tag: `purchase:${itemId}`,
      kind: "purchase-result",
    },
    { except: viewer.userId },
  );

  refresh();
}

export async function rejectPurchaseAction(
  itemId: string,
  reason = "",
): Promise<void> {
  const { viewer, documentId } = await itemGate(itemId);
  await updateItem(itemId, { state: "rejected", note: reason.slice(0, 200) });

  const item = await getItem(itemId, viewer.spaceIds);
  await notifyWatchers(
    documentId,
    {
      title: "사지 않기로 했어요",
      body:
        item === null
          ? "살 것 하나를 넘겼습니다."
          : `${item.title} — 승인하지 않았습니다.`,
      url: `/buy?item=${itemId}`,
      tag: `purchase:${itemId}`,
      kind: "purchase-result",
    },
    { except: viewer.userId },
  );

  refresh();
}

/** 다시 목록으로 — 거절했거나 실패한 것을 되살린다. */
export async function relistPurchaseAction(itemId: string): Promise<void> {
  await itemGate(itemId);
  await updateItem(itemId, { state: "listed", note: "" });
  refresh();
}

/** 승인 뒤 유예 안에 물린다. 주문 줄은 남는다 — 히스토리이기 때문이다. */
export async function cancelOrderAction(orderId: string): Promise<void> {
  const documentId = await documentOfOrder(orderId);
  if (documentId === null) throw new Error("주문을 찾을 수 없습니다.");
  const viewer = await assertCanWrite(documentId);

  const ok = await cancelOrder(orderId, viewer.userId);
  if (!ok) throw new Error("이미 주문됐거나 취소된 건입니다.");

  await notifyWatchers(
    documentId,
    {
      title: "주문을 취소했어요",
      body: "승인 뒤 유예 시간 안에 물렸습니다.",
      url: "/buy",
      tag: `purchase-order:${orderId}`,
      kind: "purchase-result",
    },
    { except: viewer.userId },
  );

  refresh();
}

/**
 * **사람이 결제를 끝냈다고 표시한다.**
 *
 * 에이전트는 장바구니까지만 한다 — 결제 화면을 열어 두고 거기서 손을 뗀다. 그래서 실제로
 * 샀는지는 서버가 알 길이 없고, 사람이 알려 줘야 기록이 맞는다.
 */
export async function markPlacedAction(orderId: string, externalId = ""): Promise<void> {
  const documentId = await documentOfOrder(orderId);
  if (documentId === null) throw new Error("주문을 찾을 수 없습니다.");
  await assertCanWrite(documentId);
  await markOrderPlaced(orderId, externalId.trim().slice(0, 60));
  refresh();
}

/** 받았다. 여기서 이 살 것은 끝난다. */
export async function markDoneAction(itemId: string): Promise<void> {
  await itemGate(itemId);
  await updateItem(itemId, { state: "done", note: "" });
  refresh();
}
