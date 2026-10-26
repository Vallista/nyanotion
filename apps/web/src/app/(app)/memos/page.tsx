import { listMemos } from "@nyanotion/db";
import { MemosScreen } from "@/components/life/memos-screen";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "메모함" };

/** 메모함 — 나만 보는 빠른 메모. 할 일·문서로 옮기거나 끝냈다고 표시한다 (`docs/15-today.md`). */
export default async function MemosPage() {
  const viewer = await requireViewer();
  const memos = await listMemos(viewer.userId, 50);
  const spaces = [
    ...viewer.spaces.filter((s) => s.kind === "personal"),
    ...viewer.spaces.filter((s) => s.kind === "org" && (s.baseRole === "editor" || s.baseRole === "owner")),
  ].map((s) => ({ id: s.id, label: s.kind === "personal" ? "내" : `${s.organizationName ?? s.name}` }));

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "메모함" }]} />
      <MemosScreen open={memos.open} done={memos.done} spaces={spaces} serverNow={Date.now()} />
    </>
  );
}
