import {
  PURCHASE_STATES,
  listItems,
  listOrders,
  usersByIds,
} from "@nyanotion/db";
import { PurchaseBoard } from "@/components/purchase-board";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "살 것 — Nyanotion" };

/**
 * 구매 섹션.
 *
 * 세 가지를 한 화면에 둔다 — **적어 두기 · 승인 기다리는 것 · 지난 기록.**
 * 승인이 걸려 있으면 그게 맨 위다. 가족 중 누군가 답해야 다음으로 넘어가기 때문이다.
 */
export default async function BuyPage() {
  const viewer = await requireViewer();

  const [items, orders] = await Promise.all([
    // 끝난 것까지 다 가져온다 — 화면에서 나눠 보여 준다.
    listItems(viewer.spaceIds, { states: PURCHASE_STATES }),
    listOrders(viewer.spaceIds),
  ]);

  // 승인한 사람·취소한 사람 이름을 한 번에 (N+1 을 만들지 않는다).
  const people = await usersByIds([
    ...new Set([
      ...items.map((item) => item.createdBy),
      ...orders.map((order) => order.approvedBy),
      ...orders.flatMap((order) =>
        order.cancelledBy === null ? [] : [order.cancelledBy],
      ),
    ]),
  ]);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "살 것" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 820,
            margin: "0 auto",
            padding: "48px 16px 120px",
          }}
        >
          <PurchaseBoard
            items={items}
            orders={orders}
            people={[...people.entries()].map(([id, info]) => ({
              id,
              name: info.name,
            }))}
            spaces={viewer.spaces.map((space) => ({
              id: space.id,
              name: space.name,
            }))}
            defaultSpaceId={viewer.personalSpace.id}
            userId={viewer.userId}
          />
        </div>
      </div>
    </>
  );
}
