import { aiStatus } from "@nyanotion/ai";
import {
  awaitingApprovalCount,
  countArchived,
  dueCount,
  listTags,
  listTree,
} from "@nyanotion/db";
import { homeNow } from "@nyanotion/shared";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { isAdmin } from "@/lib/admin";
import { requireViewer } from "@/lib/session";

/** 로그인이 필요한 화면 전체의 껍데기. /login 은 이 그룹 밖에 있다. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [nodes, archivedCount, tags, awaitingApproval, checklistDue, admin] =
    await Promise.all([
      listTree(viewer.spaceIds),
      countArchived(viewer.spaceIds),
      listTags(viewer.spaceIds),
      awaitingApprovalCount(viewer.spaceIds),
      dueCount(viewer.spaceIds, homeNow().day),
      isAdmin(viewer),
    ]);
  // 냥이 상태는 Ollama 에 짧게 물어본다 (3초 타임아웃) — 꺼져 있어도 화면은 그대로 뜬다.
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
