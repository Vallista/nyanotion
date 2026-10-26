import { listAccounts, listFamiliesWithMembers, listPendingInvites } from "@nyanotion/db";
import { AdminBoard } from "@/components/admin-board";
import { TopBar } from "@/components/top-bar";
import { isAdmin, requireAdmin } from "@/lib/admin";
import { requestOrigin } from "@/lib/origin";

export const metadata = { title: "어드민" };

/**
 * 어드민 — 계정 관리. **어드민이 아니면 404** (`requireAdmin`).
 * 문서 내용은 여기 나오지 않는다. 개수만.
 */
export default async function AdminPage() {
  const viewer = await requireAdmin();
  const [accounts, invites, families, origin] = await Promise.all([
    listAccounts(),
    listPendingInvites(),
    listFamiliesWithMembers(),
    requestOrigin(),
  ]);
  // 누가 어드민인지 화면에 보여 준다 — 막기 단추를 감추는 데에도 쓴다.
  const admins = new Set<string>();
  for (const account of accounts) {
    if (await isAdmin({ userId: account.id, email: account.email })) admins.add(account.id);
  }

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "어드민" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 860, margin: "0 auto", padding: "48px 16px 120px" }}>
          <AdminBoard
            origin={origin}
            accounts={accounts.map((account) => ({ ...account, admin: admins.has(account.id) }))}
            invites={invites}
            families={families}
            userId={viewer.userId}
          />
        </div>
      </div>
    </>
  );
}
