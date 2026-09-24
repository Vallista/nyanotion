import { countArchived, listTree } from "@nyanotion/db";
import { AppShell } from "@/components/app-shell";
import { Sidebar } from "@/components/sidebar";
import { requireViewer } from "@/lib/session";

/** 로그인이 필요한 화면 전체의 껍데기. /login 은 이 그룹 밖에 있다. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [nodes, archivedCount] = await Promise.all([
    listTree(viewer.spaceId),
    countArchived(viewer.spaceId),
  ]);

  return (
    <AppShell
      sidebar={
        <Sidebar
          nodes={nodes}
          archivedCount={archivedCount}
          spaceName={viewer.spaceName}
          email={viewer.email}
        />
      }
    >
      {children}
    </AppShell>
  );
}
