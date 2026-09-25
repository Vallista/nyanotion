import { countArchived, listCollections, listFavorites, listTags, listTree } from "@nyanotion/db";
import { AppShell } from "@/components/app-shell";
import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { requireViewer } from "@/lib/session";

/** 로그인이 필요한 화면 전체의 껍데기. /login 은 이 그룹 밖에 있다. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const [nodes, archivedCount, favorites, tags, collections] = await Promise.all([
    listTree(viewer.spaceId),
    countArchived(viewer.spaceId),
    listFavorites(viewer.userId, viewer.spaceId),
    listTags(viewer.spaceId),
    listCollections(viewer.spaceId),
  ]);

  return (
    <AppShell
      sidebar={
        <Sidebar
          nodes={nodes}
          archivedCount={archivedCount}
          favorites={favorites}
          tags={tags}
          collections={collections.map((c) => ({ id: c.id, name: c.name }))}
          spaceName={viewer.spaceName}
          email={viewer.email}
        />
      }
    >
      {children}
      <CommandPalette />
    </AppShell>
  );
}
