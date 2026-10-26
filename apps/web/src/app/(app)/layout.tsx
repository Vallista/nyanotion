import { aiStatus } from "@nyanotion/ai";
import {
  awaitingApprovalCount,
  countArchived,
  countOpenMemos,
  dueCount,
  listTags,
  listTree,
  routineState,
} from "@nyanotion/db";
import { homeNow, isScheduledOn } from "@nyanotion/shared";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { isAdmin } from "@/lib/admin";
import { requireViewer } from "@/lib/session";

/** 로그인이 필요한 화면 전체의 껍데기. /login 은 이 그룹 밖에 있다. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const today = homeNow().day;
  const [nodes, archivedCount, tags, awaitingApproval, checklistDue, admin, routines, memoOpen] =
    await Promise.all([
      listTree(viewer.spaceIds),
      countArchived(viewer.spaceIds),
      listTags(viewer.spaceIds),
      awaitingApprovalCount(viewer.spaceIds),
      dueCount(viewer.spaceIds, today),
      isAdmin(viewer),
      routineState(viewer.userId, today),
      countOpenMemos(viewer.userId),
    ]);
  // 사이드바 '루틴' 옆 숫자 — 오늘 예정인데 아직 안 한 것. 타이머가 돌면 ▶.
  const doneToday = new Set(routines.logs.filter((l) => l.done && l.date === today).map((l) => l.routineId));
  const routineLeft = routines.routines.filter((r) => isScheduledOn(r, today) && !doneToday.has(r.id)).length;
  // 도우미 상태는 Ollama 에 짧게 물어본다 (3초 타임아웃) — 꺼져 있어도 화면은 그대로 뜬다.
  const ai = await aiStatus();

  return (
    <AppShell
      sidebar={
        <Sidebar
          spaces={viewer.spaces.map((item) => ({
            id: item.id,
            name: item.kind === "org" ? (item.organizationName ?? item.name) : item.name,
            kind: item.kind,
            organizationId: item.organizationId,
          }))}
          nodes={nodes}
          archivedCount={archivedCount}
          awaitingApproval={awaitingApproval}
          checklistDue={checklistDue}
          routineLeft={routineLeft}
          routineRunning={routines.timer !== null}
          memoOpen={memoOpen}
          isAdmin={admin}
          tags={tags}
          email={viewer.email}
          gpuMode={ai.mode}
          aiReachable={ai.reachable}
        />
      }
    >
      {children}
      <CommandPalette />
    </AppShell>
  );
}
