import { BuyScreen } from "@/components/buy-screen";

export const metadata = { title: "이미 구매한 것 — 도란" };

export default function BoughtPage() {
  return <BuyScreen view="bought" />;
}
