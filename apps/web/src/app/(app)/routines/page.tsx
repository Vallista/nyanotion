import { routineState } from "@nyanotion/db";
import { homeNow } from "@nyanotion/shared";
import { RoutineScreen } from "@/components/routines/routine-screen";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "루틴 — 도란" };

/**
 * 루틴 — 나만 보는 습관 기록 (`docs/13-sync.md` §루틴). 맥 Bento·아이폰 앱과 같은 루틴을 쓴다.
 * 연속 기록은 시작일부터 세야 하므로 기록은 전부 읽는다 — 한 사람의 루틴 × 날짜라 많지 않다.
 */
export default async function RoutinesPage() {
  const viewer = await requireViewer();
  const { day: today } = homeNow();
  const state = await routineState(viewer.userId, "0000-01-01");

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "루틴" }]} />
      <RoutineScreen routines={state.routines} logs={state.logs} timer={toTimer(state.timer)} today={today} serverNow={new Date().toISOString()} />
    </>
  );
}

function toTimer(t: Awaited<ReturnType<typeof routineState>>["timer"]) {
  return t !== null && t.routineId !== null && t.date !== null && t.startedAt !== null
    ? { routineId: t.routineId, date: t.date, startedAt: t.startedAt }
    : null;
}
