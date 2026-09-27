"use client";

import type { ItemRow, OfferRow, OrderRow, PurchaseState } from "@nyanotion/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addOffersAction,
  addPurchaseItemAction,
  approvePurchaseAction,
  cancelOrderAction,
  chooseOfferAction,
  markDoneAction,
  markPlacedAction,
  rejectPurchaseAction,
  relistPurchaseAction,
  removePurchaseItemAction,
  requestSearchAction,
} from "@/lib/purchase-actions";
import { PageIcon, PlusIcon } from "./icons";

/**
 * 살 것 · 승인 · 히스토리.
 *
 * 화면의 순서가 곧 일의 순서다: **승인 기다리는 것 → 진행 중 → 적어 둔 것 → 지난 기록.**
 * 승인이 맨 위인 이유는 그것만이 사람을 기다리는 일이기 때문이다.
 *
 * 돈이 나가는 화면이라 **얼마인지·누가 승인했는지·언제까지 물릴 수 있는지**를 늘 보여 준다.
 */

const SOURCE_LABEL: Record<string, string> = {
  coupang: "쿠팡",
  naver: "네이버",
};

const STATE_LABEL: Record<PurchaseState, string> = {
  listed: "적어 둠",
  searching: "찾는 중",
  proposed: "승인 기다림",
  approved: "승인됨",
  carted: "장바구니에 담김",
  ordered: "주문함",
  done: "받음",
  rejected: "안 사기로 함",
  failed: "실패",
};

function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PurchaseBoard({
  items,
  orders,
  people,
  spaces,
  defaultSpaceId,
  userId,
}: {
  items: ItemRow[];
  orders: OrderRow[];
  people: { id: string; name: string }[];
  spaces: { id: string; name: string }[];
  defaultSpaceId: string;
  userId: string;
}) {
  const nameOf = (id: string) =>
    people.find((p) => p.id === id)?.name ?? "누군가";

  const waiting = items.filter((item) => item.state === "proposed");
  const running = items.filter(
    (item) =>
      item.state === "searching" ||
      item.state === "approved" ||
      item.state === "ordered",
  );
  const listed = items.filter((item) => item.state === "listed");
  const closed = items.filter(
    (item) =>
      item.state === "done" ||
      item.state === "rejected" ||
      item.state === "failed",
  );

  return (
    <div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginBottom: 6,
        }}
      >
        살 것
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-3)",
          marginBottom: 28,
          lineHeight: 1.7,
        }}
      >
        적어 두면 쿠팡과 네이버에서 가장 싼 것을 찾아 옵니다.{" "}
        <b style={{ fontWeight: 500 }}>가족 중 누구든 한 명이 승인</b>해야
        실제로 삽니다.
      </p>

      {waiting.length > 0 && (
        <Group title={`승인 기다리는 것 ${waiting.length}`} accent>
          {waiting.map((item) => (
            <ItemCard key={item.id} item={item} nameOf={nameOf} />
          ))}
        </Group>
      )}

      <AddItem spaces={spaces} defaultSpaceId={defaultSpaceId} />

      {listed.length > 0 && (
        <Group title="적어 둔 것">
          {listed.map((item) => (
            <ItemCard key={item.id} item={item} nameOf={nameOf} />
          ))}
        </Group>
      )}

      {running.length > 0 && (
        <Group title="진행 중">
          {running.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              nameOf={nameOf}
              order={orders.find(
                (order) =>
                  order.itemId === item.id && order.cancelledAt === null,
              )}
              userId={userId}
            />
          ))}
        </Group>
      )}

      {closed.length > 0 && (
        <Group title="끝난 것">
          {closed.map((item) => (
            <ItemCard key={item.id} item={item} nameOf={nameOf} />
          ))}
        </Group>
      )}

      {orders.length > 0 && <History orders={orders} nameOf={nameOf} />}

      {items.length === 0 && (
        <p
          style={{
            fontSize: 13.5,
            color: "var(--ink-3)",
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          아직 적어 둔 것이 없어요. 위에 무엇을 살지 적어 보세요 — 줄 하나가
          문서라서, 눌러 열면 왜 사는지·어떤 모델인지 메모할 수 있습니다.
        </p>
      )}
    </div>
  );
}

function Group({
  title,
  accent = false,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 30 }}>
      <h2
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: accent ? "var(--accent)" : "var(--ink-3)",
          marginBottom: 10,
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  nameOf,
  order,
  userId,
}: {
  item: ItemRow;
  nameOf: (id: string) => string;
  order?: OrderRow;
  userId?: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = (task: () => Promise<unknown>) =>
    startTransition(async () => {
      setProblem(null);
      try {
        await task();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });

  const chosen = item.offers.find((offer) => offer.chosen) ?? item.offers[0];
  const overBudget =
    chosen !== undefined &&
    item.maxPriceKrw !== null &&
    chosen.totalKrw > item.maxPriceKrw;

  return (
    <article
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        background: "var(--card)",
        padding: "12px 14px",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/d/${item.documentId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: 0,
            color: "var(--ink)",
            fontSize: 14.5,
            fontWeight: 500,
          }}
        >
          <span style={{ display: "flex", color: "var(--ink-4)" }}>
            <PageIcon size={14} />
          </span>
          {item.title.trim() === "" ? "제목 없음" : item.title}
        </Link>

        {item.quantity > 1 && (
          <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            {item.quantity}개
          </span>
        )}
        <Badge>{STATE_LABEL[item.state]}</Badge>
        {item.neededBy !== null && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {item.neededBy}까지
          </span>
        )}
        {item.maxPriceKrw !== null && (
          <span style={{ fontSize: 12, color: "var(--ink-4)" }}>
            한도 {won(item.maxPriceKrw)}
          </span>
        )}
      </div>

      {item.note !== "" && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-2)",
            marginTop: 6,
            lineHeight: 1.6,
          }}
        >
          {item.note}
        </p>
      )}

      {item.offers.length > 0 && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
        >
          {item.offers.map((offer) => (
            <OfferLine
              key={offer.id}
              offer={offer}
              editable={item.state === "proposed"}
              onPick={() => run(() => chooseOfferAction(item.id, offer.id))}
            />
          ))}
          {chosen !== undefined && (
            <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
              {when(chosen.foundAt)} 기준 가격입니다. 주문할 때 다시 확인합니다.
            </p>
          )}
        </div>
      )}

      {overBudget && (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--ink-2)",
            marginTop: 8,
            lineHeight: 1.6,
          }}
        >
          고른 것이 한도({won(item.maxPriceKrw!)})보다 비쌉니다. 한도를 고치거나
          다른 후보를 고르세요.
        </p>
      )}

      {order !== undefined && (
        <OrderLine
          order={order}
          nameOf={nameOf}
          userId={userId}
          onDone={() => router.refresh()}
        />
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {item.state === "proposed" && (
          <>
            <Action
              primary
              disabled={busy || overBudget}
              onClick={() => run(() => approvePurchaseAction(item.id))}
            >
              승인
            </Action>
            <Action
              disabled={busy}
              onClick={() => run(() => rejectPurchaseAction(item.id))}
            >
              안 살래요
            </Action>
          </>
        )}

        {item.state === "listed" && (
          <Action
            disabled={busy}
            onClick={() => run(() => requestSearchAction(item.id))}
          >
            가격 찾기
          </Action>
        )}

        {/* 승인을 기다리는 중에도 넣을 수 있어야 한다 — "내가 본 게 더 싸다" 가 실제로 있다. */}
        {(item.state === "listed" || item.state === "proposed") && (
          <Action disabled={busy} onClick={() => setAdding((v) => !v)}>
            후보 직접 넣기
          </Action>
        )}

        {item.state === "carted" && (
          <>
            {chosen !== undefined && (
              <a
                href={chosen.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  height: 30,
                  padding: "0 12px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "var(--radius)",
                  fontSize: 12.5,
                  color: "var(--ink-2)",
                  border: "1px solid var(--line)",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                결제하러 가기
              </a>
            )}
            {order !== undefined && (
              <Action primary disabled={busy} onClick={() => run(() => markPlacedAction(order.id))}>
                결제했어요
              </Action>
            )}
          </>
        )}

        {item.state === "ordered" && (
          <Action disabled={busy} onClick={() => run(() => markDoneAction(item.id))}>
            받았어요
          </Action>
        )}

        {(item.state === "rejected" || item.state === "failed") && (
          <Action
            disabled={busy}
            onClick={() => run(() => relistPurchaseAction(item.id))}
          >
            다시 올리기
          </Action>
        )}

        {item.state !== "ordered" && item.state !== "approved" && item.state !== "carted" && (
          <Action
            disabled={busy}
            onClick={() => run(() => removePurchaseItemAction(item.id))}
          >
            목록에서 빼기
          </Action>
        )}
      </div>

      {adding && (
        <ManualOffer
          onCancel={() => setAdding(false)}
          onSubmit={(offer) =>
            run(async () => {
              await addOffersAction(item.id, [offer]);
              setAdding(false);
            })
          }
        />
      )}

      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 8 }}>
          {problem}
        </p>
      )}
    </article>
  );
}

function OfferLine({
  offer,
  editable,
  onPick,
}: {
  offer: OfferRow;
  editable: boolean;
  onPick: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: "var(--radius-sm)",
        background: offer.chosen ? "var(--accent-soft)" : "var(--surface)",
        fontSize: 13,
      }}
    >
      {editable ? (
        <input
          type="radio"
          checked={offer.chosen}
          onChange={onPick}
          aria-label={`${offer.title} 고르기`}
          style={{ accentColor: "var(--accent)" }}
        />
      ) : (
        <span style={{ width: 13 }} />
      )}
      <span style={{ fontSize: 11.5, color: "var(--ink-3)", minWidth: 34 }}>
        {SOURCE_LABEL[offer.source] ?? offer.source}
      </span>
      <a
        href={offer.url}
        target="_blank"
        rel="noreferrer noopener"
        style={{
          flex: 1,
          minWidth: 0,
          color: "var(--ink)",
          borderBottom: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {offer.title}
      </a>
      <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>
        {won(offer.totalKrw)}
      </span>
      {offer.shippingKrw > 0 && (
        <span
          style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap" }}
        >
          배송 {won(offer.shippingKrw)}
        </span>
      )}
    </div>
  );
}

function OrderLine({
  order,
  nameOf,
  userId,
  onDone,
}: {
  order: OrderRow;
  nameOf: (id: string) => string;
  userId?: string;
  onDone: () => void;
}) {
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);

  const deadline = new Date(order.cancellableUntil);
  const canCancel =
    order.placedAt === null &&
    order.cancelledAt === null &&
    deadline > new Date();

  return (
    <div
      style={{
        marginTop: 10,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
        fontSize: 12.5,
        color: "var(--ink-2)",
        lineHeight: 1.7,
      }}
    >
      <div>
        {nameOf(order.approvedBy)}
        {userId === order.approvedBy ? "(나)" : ""} 님이{" "}
        {when(order.approvedAt)}에 승인 · {won(order.totalKrw)}
      </div>
      {order.placedAt !== null && (
        <div>
          {when(order.placedAt)}에 주문함
          {order.externalId !== "" && ` · 주문번호 ${order.externalId}`}
        </div>
      )}
      {order.failure !== "" && <div>주문 실패 — {order.failure}</div>}
      {canCancel && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "var(--ink-3)" }}>
            {when(order.cancellableUntil)}까지 물릴 수 있어요
          </span>
          <Action
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                setProblem(null);
                try {
                  await cancelOrderAction(order.id);
                  onDone();
                } catch (error) {
                  setProblem(
                    error instanceof Error
                      ? error.message
                      : "취소하지 못했어요.",
                  );
                }
              })
            }
          >
            취소
          </Action>
        </div>
      )}
      {problem !== null && <div style={{ marginTop: 4 }}>{problem}</div>}
    </div>
  );
}

function History({
  orders,
  nameOf,
}: {
  orders: OrderRow[];
  nameOf: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const spent = orders
    .filter((order) => order.cancelledAt === null && order.failure === "")
    .reduce((sum, order) => sum + order.totalKrw, 0);

  return (
    <section
      style={{
        marginTop: 34,
        borderTop: "1px solid var(--line)",
        paddingTop: 18,
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 500 }}
      >
        구매 기록 {orders.length}건 · 합계 {won(spent)}
      </button>

      {open && (
        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 12.5,
                color: "var(--ink-2)",
                padding: "6px 0",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ color: "var(--ink-3)", minWidth: 78 }}>
                {when(order.approvedAt)}
              </span>
              {order.documentId === null ? (
                // 문서가 버려져도 기록은 남는다 — 그때는 이름만 보여 준다.
                <span style={{ color: "var(--ink-2)" }}>
                  {order.itemTitle.trim() === ""
                    ? "제목 없음"
                    : order.itemTitle}
                </span>
              ) : (
                <Link
                  href={`/d/${order.documentId}`}
                  style={{ color: "var(--ink)", borderBottom: "none" }}
                >
                  {order.itemTitle.trim() === ""
                    ? "제목 없음"
                    : order.itemTitle}
                </Link>
              )}
              <span style={{ color: "var(--ink-3)" }}>
                {SOURCE_LABEL[order.source] ?? order.source}
              </span>
              <span style={{ marginLeft: "auto", fontWeight: 500 }}>
                {won(order.totalKrw)}
              </span>
              <span
                style={{
                  color: "var(--ink-3)",
                  minWidth: 60,
                  textAlign: "right",
                }}
              >
                {order.cancelledAt !== null
                  ? "취소됨"
                  : order.failure !== ""
                    ? "실패"
                    : order.placedAt !== null
                      ? "주문됨"
                      : "대기"}
              </span>
              <span
                style={{ color: "var(--ink-4)", width: "100%", fontSize: 11.5 }}
              >
                {nameOf(order.approvedBy)} 승인
                {order.cancelledBy !== null &&
                  ` · ${nameOf(order.cancelledBy)} 취소`}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddItem({
  spaces,
  defaultSpaceId,
}: {
  spaces: { id: string; name: string }[];
  defaultSpaceId: string;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId);
  const [quantity, setQuantity] = useState("1");
  const [maxPrice, setMaxPrice] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(): void {
    const clean = title.trim();
    if (clean === "") return;
    startTransition(async () => {
      setProblem(null);
      try {
        await addPurchaseItemAction({
          title: clean,
          spaceId,
          quantity: Number(quantity) || 1,
          maxPriceKrw:
            maxPrice.trim() === ""
              ? null
              : Number(maxPrice.replace(/[^\d]/g, "")),
          neededBy: neededBy === "" ? null : neededBy,
        });
        setTitle("");
        setMaxPrice("");
        setNeededBy("");
        setQuantity("1");
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "적지 못했어요.");
      }
    });
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="무엇을 살까요"
          aria-label="살 것"
          style={{ ...inputStyle, flex: "1 1 200px" }}
        />
        <input
          value={quantity}
          onChange={(event) =>
            setQuantity(event.target.value.replace(/[^\d]/g, ""))
          }
          aria-label="수량"
          title="수량"
          style={{ ...inputStyle, width: 56 }}
        />
        <input
          value={maxPrice}
          onChange={(event) => setMaxPrice(event.target.value)}
          placeholder="한도(원)"
          aria-label="가격 한도"
          style={{ ...inputStyle, width: 96 }}
        />
        <input
          type="date"
          value={neededBy}
          onChange={(event) => setNeededBy(event.target.value)}
          aria-label="언제까지"
          style={{ ...inputStyle, width: 140 }}
        />
        {spaces.length > 1 && (
          <select
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
            aria-label="어디에"
            style={{ ...inputStyle, width: 120 }}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={submit}
          disabled={busy || title.trim() === ""}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            height: 34,
            padding: "0 12px",
            borderRadius: "var(--radius)",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 13,
            fontWeight: 500,
            opacity: busy || title.trim() === "" ? 0.45 : 1,
          }}
        >
          <PlusIcon size={13} />
          적기
        </button>
      </div>
      {problem !== null && (
        <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>
          {problem}
        </p>
      )}
    </section>
  );
}

/** 에이전트가 없을 때, 그리고 "내가 본 게 더 싸다" 일 때 쓰는 길. */
function ManualOffer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (offer: {
    source: "coupang" | "naver";
    title: string;
    priceKrw: number;
    shippingKrw: number;
    url: string;
  }) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState<"coupang" | "naver">("coupang");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [shipping, setShipping] = useState("0");
  const [url, setUrl] = useState("");

  const ready =
    title.trim() !== "" && Number(price) > 0 && /^https?:\/\//.test(url.trim());

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        borderRadius: "var(--radius-sm)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select
          value={source}
          onChange={(event) =>
            setSource(event.target.value as "coupang" | "naver")
          }
          aria-label="어디서"
          style={{ ...inputStyle, width: 90 }}
        >
          <option value="coupang">쿠팡</option>
          <option value="naver">네이버</option>
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="상품 이름"
          aria-label="상품 이름"
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          value={price}
          onChange={(event) =>
            setPrice(event.target.value.replace(/[^\d]/g, ""))
          }
          placeholder="가격"
          aria-label="가격"
          style={{ ...inputStyle, width: 96 }}
        />
        <input
          value={shipping}
          onChange={(event) =>
            setShipping(event.target.value.replace(/[^\d]/g, ""))
          }
          placeholder="배송비"
          aria-label="배송비"
          style={{ ...inputStyle, width: 86 }}
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          aria-label="상품 주소"
          style={{ ...inputStyle, flex: "1 1 180px" }}
        />
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Action
          primary
          disabled={!ready}
          onClick={() =>
            onSubmit({
              source,
              title: title.trim(),
              priceKrw: Number(price),
              shippingKrw: Number(shipping) || 0,
              url: url.trim(),
            })
          }
        >
          후보로 올리기
        </Action>
        <Action onClick={onCancel}>그만</Action>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 34,
  padding: "0 9px",
  background: "var(--card)",
  border: "1px solid var(--line-strong)",
  borderRadius: "var(--radius)",
  fontSize: 13,
  color: "var(--ink)",
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11.5,
        color: "var(--ink-3)",
        background: "var(--chip)",
        borderRadius: "var(--radius-sm)",
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

function Action({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: "var(--radius)",
        fontSize: 12.5,
        fontWeight: primary ? 500 : 400,
        background: primary ? "var(--ink)" : "transparent",
        color: primary ? "var(--paper)" : "var(--ink-2)",
        border: primary ? "none" : "1px solid var(--line)",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
