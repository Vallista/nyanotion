import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { space } from "./app";
import { user } from "./auth";
import { document } from "./document";

/**
 * 살 것 · 후보 · 주문.
 *
 * **살 것 하나가 문서 하나다** — 노션의 데이터베이스 줄과 같은 규칙이다 (`docs/01-data-model.md`).
 * 그래야 "이거 왜 샀더라", "저번에 산 건 이 모델" 같은 메모·사진·링크를 그 안에 쓸 수 있다.
 * 여기 표들은 그 문서에 **구매에 필요한 것만 덧붙인다.**
 *
 * 돈이 나가는 일이라 상태를 성기게 두지 않았다. 어디서 멈췄는지 화면이 정확히 말할 수 있어야
 * 사람이 손을 댈 수 있다.
 */

/**
 *  listed    적어 뒀다. 아직 아무것도 안 함
 *  searching 가격을 찾는 중 (데스크탑 에이전트가 돌고 있다)
 *  proposed  후보를 찾아 **승인을 기다린다** — 이때 가족에게 알림이 간다
 *  approved  누군가 승인했다. 아직 주문 전 (취소할 수 있는 시간)
 *  carted    에이전트가 **장바구니에 담고 결제 화면까지 열어 뒀다.** 결제는 사람이 누른다
 *  ordered   사람이 결제를 끝냈다고 표시했다
 *  done      받았다
 *  rejected  사람이 거절했다 — 다시 찾으려면 listed 로 되돌린다
 *  failed    찾기나 주문이 실패했다. `note` 에 이유
 */
export const PURCHASE_STATES = [
  "listed",
  "searching",
  "proposed",
  "approved",
  "carted",
  "ordered",
  "done",
  "rejected",
  "failed",
] as const;
export type PurchaseState = (typeof PURCHASE_STATES)[number];

/** 아직 끝나지 않은 것들 — 목록 화면의 기본 필터. */
export const OPEN_PURCHASE_STATES: readonly PurchaseState[] = [
  "listed",
  "searching",
  "proposed",
  "approved",
  "carted",
  "ordered",
];

export const purchaseItem = pgTable(
  "purchase_item",
  {
    id: text("id").primaryKey(),
    /** 이 살 것의 문서. 메모·사진이 여기 들어간다. 문서를 지우면 함께 사라진다. */
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("listed"),
    /** 몇 개. 0 이나 음수는 두지 않는다. */
    quantity: integer("quantity").notNull().default(1),
    /**
     * 이 값보다 비싸면 **사지 않고 사람에게 묻는다.** 자동 구매에서 가장 중요한 안전장치다.
     * null 이면 한도 없음 — 그래도 승인은 늘 사람이 한다.
     */
    maxPriceKrw: integer("max_price_krw"),
    /** 언제까지 필요한가. 날짜만 뜻이 있으므로 `YYYY-MM-DD` 문자열로 둔다 (시간대가 끼면 하루가 밀린다). */
    neededBy: text("needed_by"),
    /** 무슨 일이 있었는지 사람 말로. 실패 이유가 여기 들어간다. */
    note: text("note").notNull().default(""),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // 문서 하나에 살 것도 하나. 같은 문서를 두 번 담지 못하게.
    uniqueIndex("purchase_item_document_unique").on(t.documentId),
    index("purchase_item_state_idx").on(t.state, t.updatedAt),
  ],
);

/** 어디서 찾았나. 쿠팡·네이버스토어 둘로 시작한다. */
export const PURCHASE_SOURCES = ["coupang", "naver"] as const;
export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];

/**
 * 찾아 놓은 후보 하나.
 *
 * **값은 찾은 그 시점의 것이다.** 가격은 시시각각 바뀌므로 주문할 때 다시 확인해야 하고,
 * 그래서 `foundAt` 을 반드시 남긴다 — 화면이 "30분 전 가격"이라고 말할 수 있어야 한다.
 */
export const purchaseOffer = pgTable(
  "purchase_offer",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => purchaseItem.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    title: text("title").notNull(),
    /** 원. 배송비는 따로 둔다 — 합계만 두면 "왜 이게 더 싼가"를 설명할 수 없다. */
    priceKrw: integer("price_krw").notNull(),
    shippingKrw: integer("shipping_krw").notNull().default(0),
    url: text("url").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    seller: text("seller").notNull().default(""),
    /** 이 후보를 고를 것인가. 한 살 것에 하나만 true 여야 한다 (코드가 지킨다). */
    chosen: boolean("chosen").notNull().default(false),
    foundAt: timestamp("found_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("purchase_offer_item_idx").on(t.itemId, t.priceKrw)],
);

/**
 * 실제 주문. 승인부터 결과까지 **여기 한 줄에 남는다** — 히스토리가 곧 이 표다.
 *
 * **기록은 살 것보다 오래 산다.** 살 것을 목록에서 빼도, 후보가 지워져도, 문서를 버려도
 * "언제 무엇을 얼마에 샀는가"는 남아야 한다 — "그때 왜 이걸 샀지"에 답하는 게 이 기능의
 * 절반이기 때문이다. 그래서 가리키는 것들은 전부 지워질 수 있게(`set null`) 두고,
 * **화면에 필요한 값은 복사해 둔다** (`spaceId` · `itemTitle` · `source` · `title` · `url`).
 *
 * 취소해도 줄은 남고 `cancelledAt` 이 찬다.
 */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: text("id").primaryKey(),
    /** 살 것이 지워져도 기록은 남는다. */
    itemId: text("item_id").references(() => purchaseItem.id, {
      onDelete: "set null",
    }),
    /** **누구의 기록인가.** 목록을 좁히는 기준이라 이것만은 없으면 안 된다. */
    spaceId: text("space_id")
      .notNull()
      .references(() => space.id, { onDelete: "cascade" }),
    /** 그때 그 살 것의 이름. 문서 제목이 나중에 바뀌어도 기록은 그대로여야 한다. */
    itemTitle: text("item_title").notNull().default(""),
    /** 아직 남아 있으면 눌러서 열 수 있게. 버려졌으면 null. */
    documentId: text("document_id").references(() => document.id, {
      onDelete: "set null",
    }),
    /** 무엇을 샀는지. 후보가 지워져도 주문 기록은 남아야 하므로 값을 복사해 둔다. */
    offerId: text("offer_id").references(() => purchaseOffer.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    totalKrw: integer("total_krw").notNull(),

    /** **누가 승인했는가.** 가족 누구든 한 명이면 된다. */
    approvedBy: text("approved_by")
      .notNull()
      .references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * 이 시각까지는 앱에서 취소할 수 있다. 승인하자마자 사면 잘못 누른 것을 되돌릴 길이 없다 —
     * 짧은 유예를 두고 그동안은 주문을 넣지 않는다.
     */
    cancellableUntil: timestamp("cancellable_until", {
      withTimezone: true,
    }).notNull(),

    placedAt: timestamp("placed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").references(() => user.id),
    /** 쇼핑몰이 준 주문번호. 나중에 사람이 그 사이트에서 찾아볼 수 있게. */
    externalId: text("external_id").notNull().default(""),
    /** 실패했다면 왜. 비어 있으면 실패가 아니다. */
    failure: text("failure").notNull().default(""),
  },
  (t) => [
    index("purchase_order_item_idx").on(t.itemId, t.approvedAt),
    index("purchase_order_space_idx").on(t.spaceId, t.approvedAt),
  ],
);

export const purchaseItemRelations = relations(
  purchaseItem,
  ({ one, many }) => ({
    document: one(document, {
      fields: [purchaseItem.documentId],
      references: [document.id],
    }),
    offers: many(purchaseOffer),
    orders: many(purchaseOrder),
  }),
);

export const purchaseOfferRelations = relations(purchaseOffer, ({ one }) => ({
  item: one(purchaseItem, {
    fields: [purchaseOffer.itemId],
    references: [purchaseItem.id],
  }),
}));

export const purchaseOrderRelations = relations(purchaseOrder, ({ one }) => ({
  item: one(purchaseItem, {
    fields: [purchaseOrder.itemId],
    references: [purchaseItem.id],
  }),
  offer: one(purchaseOffer, {
    fields: [purchaseOrder.offerId],
    references: [purchaseOffer.id],
  }),
}));

export type PurchaseItem = typeof purchaseItem.$inferSelect;
export type PurchaseOffer = typeof purchaseOffer.$inferSelect;
export type PurchaseOrder = typeof purchaseOrder.$inferSelect;
