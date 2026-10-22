import { agenda } from "@nyanotion/db";
import { describeDue, homeNow } from "@nyanotion/shared";
import type { NextRequest } from "next/server";
import { apiViewer, handle, preflight } from "@/lib/api-auth";

/**
 * 오늘까지 할 일(지난 것 포함) — **iOS 위젯이 읽는다** (`scripts/scriptable/nyanotion-widget.js`).
 * 체크리스트를 가리지 않고 내가 들어갈 수 있는 공간 전부에서 모은다 (`viewer.spaceIds`).
 * "오늘"은 집 시각(`homeNow`) — 위젯 기기의 시계를 믿지 않는다.
 */
export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function GET(request: NextRequest) {
  return handle(request, async () => {
    const viewer = await apiViewer(request);
    const clock = homeNow();
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 30, 1), 100);
    const rows = await agenda(viewer.spaceIds, clock.day, limit);
    return {
      today: clock.day,
      items: rows.map((row) => {
        const due = describeDue(row.dueOn ?? clock.day, clock.day);
        return {
          id: row.id,
          title: row.title,
          dueOn: row.dueOn,
          dueTime: row.dueTime,
          label: due.label,
          late: due.tone === "late",
          checklistId: row.checklistId,
          checklistTitle: row.checklistTitle,
          url: `/lists/${row.checklistId}`,
        };
      }),
    };
  });
}
