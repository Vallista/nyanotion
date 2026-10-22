import {
  PURCHASE_STATES,
  listItems,
  listOrders,
  usersByIds,
} from "@nyanotion/db";
import { PurchaseBoard } from "./purchase-board";
import { TopBar } from "./top-bar";
import { requireViewer } from "@/lib/session";

/** 구매하기 화면 — 백로그(`/buy`)와 이미 구매한 것(`/buy/done`)이 보기만 달리해 같이 쓴다. */
export async function BuyScreen({ view }: { view: "backlog" | "bought" }) {
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
      <TopBar
        crumbs={[
          { id: null, title: "체크리스트", href: "/" },
          { id: null, title: "구매하기" },
          { id: null, title: view === "backlog" ? "구매 백로그" : "이미 구매한 것" },
        ]}
      />
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
            view={view}
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
