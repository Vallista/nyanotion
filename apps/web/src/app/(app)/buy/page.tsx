import { BuyScreen } from "@/components/buy-screen";

export const metadata = { title: "구매 백로그" };

/** 구매하기 — 백로그. 승인이 걸려 있으면 그게 맨 위다. 가족 중 누군가 답해야 다음으로 넘어가기 때문이다. */
export default function BuyPage() {
  return <BuyScreen view="backlog" />;
}
