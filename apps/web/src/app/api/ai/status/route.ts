import { aiStatus } from "@nyanotion/ai";
import { requireViewer } from "@/lib/session";

/** 냥이가 지금 일할 수 있는지. 화면의 상태 배지가 본다. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  await requireViewer();
  const status = await aiStatus();
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
