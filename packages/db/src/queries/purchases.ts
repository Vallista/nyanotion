import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { document } from "../schema/document";
import { space } from "../schema/app";
import { member } from "../schema/auth";
import {
  OPEN_PURCHASE_STATES,
  purchaseItem,
  purchaseOffer,
  purchaseOrder,
  type PurchaseSource,
  type PurchaseState,
} from "../schema/purchase";

export type OfferRow = {
  id: string;
  source: PurchaseSource;
  title: string;
  priceKrw: number;
  shippingKrw: number;
  totalKrw: number;
  url: string;
  imageUrl: string;
  seller: string;
  chosen: boolean;
  foundAt: string;
};

export type ItemRow = {
  id: string;
  documentId: string;
  title: string;
  spaceId: string;
  state: PurchaseState;
  quantity: number;
  maxPriceKrw: number | null;
  neededBy: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  offers: OfferRow[];
};

export type OrderRow = {
  id: string;
  /** 살 것이 지워졌으면 null — 기록은 그래도 남는다. */
  itemId: string | null;
  /** 문서가 버려졌으면 null. */
  documentId: string | null;
  itemTitle: string;
  source: PurchaseSource;
  title: string;
  url: string;
  totalKrw: number;
  approvedBy: string;
  approvedAt: string;
  cancellableUntil: string;
  placedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  externalId: string;
  failure: string;
};

function asState(value: string): PurchaseState {
  return value as PurchaseState;
}

function asSource(value: string): PurchaseSource {
  return value === "naver" ? "naver" : "coupang";
}

/* ------------------------------------------------------------------ 읽기 */

/**
 * 살 것 목록. **space 로 좁힌다** — 문서와 같은 경계다.
 *
 * 후보까지 한 번에 가져온다 (목록 화면이 "얼마짜리를 찾았나"를 바로 보여 줘야 하므로).
 * 살 것 수가 많아야 수십 개라 조인 한 번이면 충분하다.
 */
export async function listItems(
  spaceIds: readonly string[],
  options: { states?: readonly PurchaseState[]; limit?: number } = {},
): Promise<ItemRow[]> {
  if (spaceIds.length === 0) return [];
  const states = options.states ?? OPEN_PURCHASE_STATES;

  const rows = await db
    .select({
      item: purchaseItem,
      title: document.title,
      spaceId: document.spaceId,
    })
    .from(purchaseItem)
    .innerJoin(document, eq(purchaseItem.documentId, document.id))
    .where(
      and(
        inArray(document.spaceId, [...spaceIds]),
        isNull(document.archivedAt),
        inArray(purchaseItem.state, [...states]),
      ),
    )
    .orderBy(desc(purchaseItem.updatedAt))
    .limit(options.limit ?? 200);

  if (rows.length === 0) return [];

  const offers = await db
    .select()
    .from(purchaseOffer)
    .where(
      inArray(
        purchaseOffer.itemId,
        rows.map((r) => r.item.id),
      ),
    )
    .orderBy(asc(purchaseOffer.priceKrw));

  const byItem = new Map<string, OfferRow[]>();
  for (const offer of offers) {
    const list = byItem.get(offer.itemId) ?? [];
    list.push(toOffer(offer));
    byItem.set(offer.itemId, list);
  }

  return rows.map((row) => ({
    id: row.item.id,
    documentId: row.item.documentId,
    title: row.title,
    spaceId: row.spaceId,
    state: asState(row.item.state),
    quantity: row.item.quantity,
    maxPriceKrw: row.item.maxPriceKrw,
    neededBy: row.item.neededBy,
    note: row.item.note,
    createdBy: row.item.createdBy,
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    offers: byItem.get(row.item.id) ?? [],
  }));
}

function toOffer(offer: typeof purchaseOffer.$inferSelect): OfferRow {
  return {
    id: offer.id,
    source: asSource(offer.source),
    title: offer.title,
    priceKrw: offer.priceKrw,
    shippingKrw: offer.shippingKrw,
    totalKrw: offer.priceKrw + offer.shippingKrw,
    url: offer.url,
    imageUrl: offer.imageUrl,
    seller: offer.seller,
    chosen: offer.chosen,
    foundAt: offer.foundAt.toISOString(),
  };
}

/** 살 것 하나. 볼 수 있는 space 인지까지 확인한다 — 없으면 null 이고, 부르는 쪽은 404 로 끝낸다. */
export async function getItem(
  id: string,
  spaceIds: readonly string[],
): Promise<ItemRow | null> {
  if (spaceIds.length === 0) return null;
  const rows = await db
    .select({
      item: purchaseItem,
      title: document.title,
      spaceId: document.spaceId,
    })
    .from(purchaseItem)
    .innerJoin(document, eq(purchaseItem.documentId, document.id))
    .where(
      and(eq(purchaseItem.id, id), inArray(document.spaceId, [...spaceIds])),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined) return null;

  const offers = await db
    .select()
    .from(purchaseOffer)
    .where(eq(purchaseOffer.itemId, id))
    .orderBy(asc(purchaseOffer.priceKrw));

  return {
    id: row.item.id,
    documentId: row.item.documentId,
    title: row.title,
    spaceId: row.spaceId,
    state: asState(row.item.state),
    quantity: row.item.quantity,
    maxPriceKrw: row.item.maxPriceKrw,
    neededBy: row.item.neededBy,
    note: row.item.note,
    createdBy: row.item.createdBy,
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    offers: offers.map(toOffer),
  };
}

/** 히스토리 — 주문된 것들. 취소된 것도 남는다. */
export async function listOrders(
  spaceIds: readonly string[],
  limit = 100,
): Promise<OrderRow[]> {
  if (spaceIds.length === 0) return [];
  // **살 것을 거치지 않는다.** 목록에서 뺐거나 문서를 버렸어도 기록은 남아야 하므로
  // space 로 바로 좁힌다 (그래서 주문 줄이 spaceId 를 들고 있다).
  const rows = await db
    .select({ order: purchaseOrder })
    .from(purchaseOrder)
    .where(inArray(purchaseOrder.spaceId, [...spaceIds]))
    .orderBy(desc(purchaseOrder.approvedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.order.id,
    itemId: row.order.itemId,
    documentId: row.order.documentId,
    itemTitle: row.order.itemTitle,
    source: asSource(row.order.source),
    title: row.order.title,
    url: row.order.url,
    totalKrw: row.order.totalKrw,
    approvedBy: row.order.approvedBy,
    approvedAt: row.order.approvedAt.toISOString(),
    cancellableUntil: row.order.cancellableUntil.toISOString(),
    placedAt: row.order.placedAt?.toISOString() ?? null,
    cancelledAt: row.order.cancelledAt?.toISOString() ?? null,
    cancelledBy: row.order.cancelledBy,
    externalId: row.order.externalId,
    failure: row.order.failure,
  }));
}

/**
 * **시스템 전용** — space 로 좁히지 않고 상태로만 고른다.
 *
 * 데스크탑 에이전트가 쓴다. 에이전트는 사람이 아니라 이 집 컴퓨터의 프로세스라서 "누가 볼 수
 * 있는가" 라는 물음이 성립하지 않는다 — 대신 **무엇을 할 수 있는가**가 상태로 묶여 있다
 * (`searching` 인 것만 찾고, 유예가 끝난 주문만 담는다).
 *
 * 화면에서 부르지 말 것. 사람이 보는 목록은 늘 `listItems(spaceIds)` 다.
 */
export async function listItemsForAgent(
  states: readonly PurchaseState[],
  limit = 5,
): Promise<ItemRow[]> {
  const rows = await db
    .select({ item: purchaseItem, title: document.title, spaceId: document.spaceId })
    .from(purchaseItem)
    .innerJoin(document, eq(purchaseItem.documentId, document.id))
    .where(and(isNull(document.archivedAt), inArray(purchaseItem.state, [...states])))
    .orderBy(asc(purchaseItem.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.item.id,
    documentId: row.item.documentId,
    title: row.title,
    spaceId: row.spaceId,
    state: asState(row.item.state),
    quantity: row.item.quantity,
    maxPriceKrw: row.item.maxPriceKrw,
    neededBy: row.item.neededBy,
    note: row.item.note,
    createdBy: row.item.createdBy,
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    offers: [],
  }));
}

/** 장바구니에 담아 결제 화면까지 열어 뒀다. **결제는 사람이 누른다.** */
export async function markOrderCarted(orderId: string): Promise<void> {
  const rows = await db
    .select({ itemId: purchaseOrder.itemId })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, orderId))
    .limit(1);
  const itemId = rows[0]?.itemId ?? null;
  if (itemId !== null) {
    await updateItem(itemId, { state: "carted", note: "장바구니에 담아 뒀어요. 결제만 누르면 됩니다." });
  }
}

/** 이 살 것의 문서 id. 권한 판정은 그 문서로 한다. */
export async function documentOfItem(itemId: string): Promise<string | null> {
  const rows = await db
    .select({ documentId: purchaseItem.documentId })
    .from(purchaseItem)
    .where(eq(purchaseItem.id, itemId))
    .limit(1);
  return rows[0]?.documentId ?? null;
}

export async function documentOfOrder(orderId: string): Promise<string | null> {
  const rows = await db
    .select({ documentId: purchaseItem.documentId })
    .from(purchaseOrder)
    .innerJoin(purchaseItem, eq(purchaseOrder.itemId, purchaseItem.id))
    .where(eq(purchaseOrder.id, orderId))
    .limit(1);
  return rows[0]?.documentId ?? null;
}

/* ------------------------------------------------------------------ 쓰기 */

export async function createItem(input: {
  documentId: string;
  createdBy: string;
  quantity?: number;
  maxPriceKrw?: number | null;
  neededBy?: string | null;
}): Promise<string> {
  const id = newId();
  await db.insert(purchaseItem).values({
    id,
    documentId: input.documentId,
    createdBy: input.createdBy,
    quantity: Math.max(1, input.quantity ?? 1),
    maxPriceKrw: input.maxPriceKrw ?? null,
    neededBy: input.neededBy ?? null,
  });
  return id;
}

export async function updateItem(
  id: string,
  patch: {
    quantity?: number;
    maxPriceKrw?: number | null;
    neededBy?: string | null;
    note?: string;
    state?: PurchaseState;
  },
): Promise<void> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.quantity !== undefined)
    values.quantity = Math.max(1, patch.quantity);
  if (patch.maxPriceKrw !== undefined) values.maxPriceKrw = patch.maxPriceKrw;
  if (patch.neededBy !== undefined) values.neededBy = patch.neededBy;
  if (patch.note !== undefined) values.note = patch.note;
  if (patch.state !== undefined) values.state = patch.state;
  await db.update(purchaseItem).set(values).where(eq(purchaseItem.id, id));
}

/** 살 것을 목록에서 뺀다. **문서는 남는다** — 표에서 빼는 것과 같은 규칙이다. */
export async function removeItem(id: string): Promise<void> {
  await db.delete(purchaseItem).where(eq(purchaseItem.id, id));
}

/**
 * 찾아 온 후보로 **갈아 끼운다.** 가격은 시시각각 바뀌므로 옛 후보를 남겨 두면
 * 화면이 어느 것을 믿어야 할지 알 수 없다.
 */
export async function replaceOffers(
  itemId: string,
  offers: readonly {
    source: PurchaseSource;
    title: string;
    priceKrw: number;
    shippingKrw?: number;
    url: string;
    imageUrl?: string;
    seller?: string;
  }[],
): Promise<void> {
  await db.delete(purchaseOffer).where(eq(purchaseOffer.itemId, itemId));
  if (offers.length === 0) return;

  // 합계가 가장 싼 것을 고른다 — 배송비를 빼고 비교하면 엉뚱한 것이 뽑힌다.
  let cheapest = 0;
  offers.forEach((offer, index) => {
    const total = offer.priceKrw + (offer.shippingKrw ?? 0);
    const best = offers[cheapest]!;
    if (total < best.priceKrw + (best.shippingKrw ?? 0)) cheapest = index;
  });

  await db.insert(purchaseOffer).values(
    offers.map((offer, index) => ({
      id: newId(),
      itemId,
      source: offer.source,
      title: offer.title,
      priceKrw: offer.priceKrw,
      shippingKrw: offer.shippingKrw ?? 0,
      url: offer.url,
      imageUrl: offer.imageUrl ?? "",
      seller: offer.seller ?? "",
      chosen: index === cheapest,
    })),
  );
}

/**
 * 후보를 **더한다.** 사람이 손으로 넣을 때 쓴다 — 찾아 온 것을 지우면 안 되기 때문이다.
 * 더한 것이 지금 고른 것보다 싸면 고른 것을 옮겨 준다.
 */
export async function appendOffers(
  itemId: string,
  offers: readonly {
    source: PurchaseSource;
    title: string;
    priceKrw: number;
    shippingKrw?: number;
    url: string;
    imageUrl?: string;
    seller?: string;
  }[],
): Promise<void> {
  if (offers.length === 0) return;

  await db.insert(purchaseOffer).values(
    offers.map((offer) => ({
      id: newId(),
      itemId,
      source: offer.source,
      title: offer.title,
      priceKrw: offer.priceKrw,
      shippingKrw: offer.shippingKrw ?? 0,
      url: offer.url,
      imageUrl: offer.imageUrl ?? "",
      seller: offer.seller ?? "",
      chosen: false,
    })),
  );

  // 합계가 가장 싼 것으로 고름을 옮긴다. 배송비를 빼고 비교하면 엉뚱한 것이 뽑힌다.
  const all = await db
    .select()
    .from(purchaseOffer)
    .where(eq(purchaseOffer.itemId, itemId));
  let best = all[0];
  for (const offer of all) {
    if (best === undefined) break;
    if (offer.priceKrw + offer.shippingKrw < best.priceKrw + best.shippingKrw)
      best = offer;
  }
  if (best !== undefined) await chooseOffer(itemId, best.id);
}

/** 사람이 다른 후보를 고른다. 한 살 것에 고른 것은 늘 하나다. */
export async function chooseOffer(
  itemId: string,
  offerId: string,
): Promise<void> {
  await db
    .update(purchaseOffer)
    .set({ chosen: false })
    .where(eq(purchaseOffer.itemId, itemId));
  await db
    .update(purchaseOffer)
    .set({ chosen: true })
    .where(
      and(eq(purchaseOffer.id, offerId), eq(purchaseOffer.itemId, itemId)),
    );
}

export async function chosenOffer(itemId: string): Promise<OfferRow | null> {
  const rows = await db
    .select()
    .from(purchaseOffer)
    .where(
      and(eq(purchaseOffer.itemId, itemId), eq(purchaseOffer.chosen, true)),
    )
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toOffer(row);
}

/**
 * 승인 — 주문 한 줄을 만든다. **바로 사지 않는다.**
 * `cancellableUntil` 까지는 앱에서 물릴 수 있고, 그 뒤에 에이전트가 집어 간다.
 */
export async function approve(input: {
  itemId: string;
  /** 기록이 살 것보다 오래 살도록 그때의 값을 복사해 둔다. */
  spaceId: string;
  documentId: string;
  itemTitle: string;
  offer: OfferRow;
  approvedBy: string;
  graceMs: number;
}): Promise<string> {
  const id = newId();
  await db.insert(purchaseOrder).values({
    id,
    itemId: input.itemId,
    spaceId: input.spaceId,
    documentId: input.documentId,
    itemTitle: input.itemTitle,
    offerId: input.offer.id,
    source: input.offer.source,
    title: input.offer.title,
    url: input.offer.url,
    totalKrw: input.offer.totalKrw,
    approvedBy: input.approvedBy,
    cancellableUntil: new Date(Date.now() + input.graceMs),
  });
  await updateItem(input.itemId, { state: "approved" });
  return id;
}

/** 아직 주문 전이고 유예 시간이 남았으면 물린다. 줄은 남는다 — 히스토리이기 때문이다. */
export async function cancelOrder(
  orderId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, orderId))
    .limit(1);
  const order = rows[0];
  if (order === undefined) return false;
  if (order.placedAt !== null || order.cancelledAt !== null) return false;

  await db
    .update(purchaseOrder)
    .set({ cancelledAt: new Date(), cancelledBy: userId })
    .where(eq(purchaseOrder.id, orderId));
  // 살 것이 이미 지워졌을 수 있다 — 기록만 남은 경우다.
  if (order.itemId !== null) {
    await updateItem(order.itemId, {
      state: "rejected",
      note: "승인 뒤 취소했습니다.",
    });
  }
  return true;
}

/**
 * 에이전트가 집어 갈 주문들 — **유예가 끝났고 아직 넣지 않았고 취소되지 않은 것.**
 * 이 조건이 자동 구매의 전부다.
 */
export async function ordersReadyToPlace(limit = 10): Promise<OrderRow[]> {
  const rows = await db
    .select({ order: purchaseOrder })
    .from(purchaseOrder)
    .where(
      and(
        isNull(purchaseOrder.placedAt),
        isNull(purchaseOrder.cancelledAt),
        lte(purchaseOrder.cancellableUntil, new Date()),
        or(eq(purchaseOrder.failure, ""), isNull(purchaseOrder.failure)),
      ),
    )
    .orderBy(asc(purchaseOrder.cancellableUntil))
    .limit(limit);

  return rows.map((row) => ({
    id: row.order.id,
    itemId: row.order.itemId,
    documentId: row.order.documentId,
    itemTitle: row.order.itemTitle,
    source: asSource(row.order.source),
    title: row.order.title,
    url: row.order.url,
    totalKrw: row.order.totalKrw,
    approvedBy: row.order.approvedBy,
    approvedAt: row.order.approvedAt.toISOString(),
    cancellableUntil: row.order.cancellableUntil.toISOString(),
    placedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    externalId: row.order.externalId,
    failure: row.order.failure,
  }));
}

export async function markOrderPlaced(
  orderId: string,
  externalId: string,
): Promise<void> {
  const rows = await db
    .select({ itemId: purchaseOrder.itemId })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, orderId))
    .limit(1);
  await db
    .update(purchaseOrder)
    .set({ placedAt: new Date(), externalId, failure: "" })
    .where(eq(purchaseOrder.id, orderId));
  const itemId = rows[0]?.itemId ?? null;
  if (itemId !== null) await updateItem(itemId, { state: "ordered" });
}

export async function markOrderFailed(
  orderId: string,
  reason: string,
): Promise<void> {
  const rows = await db
    .select({ itemId: purchaseOrder.itemId })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.id, orderId))
    .limit(1);
  await db
    .update(purchaseOrder)
    .set({ failure: reason })
    .where(eq(purchaseOrder.id, orderId));
  const failedItemId = rows[0]?.itemId ?? null;
  if (failedItemId !== null)
    await updateItem(failedItemId, { state: "failed", note: reason });
}

/** 지금 승인을 기다리는 살 것이 몇 개인가. 사이드바 배지에 쓴다. */
export async function awaitingApprovalCount(
  spaceIds: readonly string[],
): Promise<number> {
  if (spaceIds.length === 0) return 0;
  const rows = await db
    .select({ id: purchaseItem.id })
    .from(purchaseItem)
    .innerJoin(document, eq(purchaseItem.documentId, document.id))
    .where(
      and(
        inArray(document.spaceId, [...spaceIds]),
        isNull(document.archivedAt),
        eq(purchaseItem.state, "proposed"),
      ),
    );
  return rows.length;
}

/**
 * 이 문서를 **지켜보는 사람들** — 알림을 보낼 대상.
 *
 * 가족 space 면 구성원 전부, 개인 space 면 주인 한 명. "가족 누구든 한 명이 승인하면 된다"가
 * 이 기능의 규칙이라 대상은 space 단위다. 문서별 공유(`document_share`)로 들어온 사람은
 * 일부러 넣지 않는다 — 문서 하나를 받았다고 남의 집 장보기 알림까지 받을 이유가 없다.
 */
export async function watchersOfDocument(
  documentId: string,
): Promise<string[]> {
  const rows = await db
    .select({
      kind: space.kind,
      ownerUserId: space.ownerUserId,
      organizationId: space.organizationId,
    })
    .from(document)
    .innerJoin(space, eq(document.spaceId, space.id))
    .where(eq(document.id, documentId))
    .limit(1);

  const found = rows[0];
  if (found === undefined) return [];

  if (found.kind === "org" && found.organizationId !== null) {
    const members = await db
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, found.organizationId));
    return members.map((row) => row.userId);
  }
  return found.ownerUserId === null ? [] : [found.ownerUserId];
}
