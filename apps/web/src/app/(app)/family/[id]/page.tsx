import { familyMembers, listInvitations, roleInFamily } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { FamilyMembers } from "@/components/family-members";
import { InviteForm } from "@/components/invite-form";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { familyRoleLabel } from "@/lib/roles";
import { requireViewer } from "@/lib/session";

/** 가족 관리 — 구성원, 역할, 초대. 문서 권한과는 다른 축이다. */
export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();

  const myRole = await roleInFamily(id, viewer.userId);
  if (myRole === null) notFound(); // 속하지 않은 가족은 있는지도 알려주지 않는다

  const family = viewer.spaces.find((item) => item.organizationId === id);
  const name = family?.organizationName ?? "가족";
  const isAdmin = myRole === "owner" || myRole === "admin";

  const [members, invitations] = await Promise.all([
    familyMembers(id),
    isAdmin ? listInvitations(id) : Promise.resolve([]),
  ]);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: name }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 720, margin: "0 auto", padding: "56px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            {name}
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 36 }}>
            구성원 {members.length}명 · 내 역할 {familyRoleLabel(myRole)}
          </p>

          <FamilyMembers
            organizationId={id}
            myUserId={viewer.userId}
            isAdmin={isAdmin}
            members={members.map((item) => ({
              userId: item.userId,
              name: item.name,
              email: item.email,
              role: item.role,
              joinedAt: formatWhen(item.joinedAt),
            }))}
          />

          {isAdmin && (
            <section style={{ marginTop: 44 }}>
              <h2
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: "var(--ink-3)",
                  letterSpacing: "0.01em",
                  marginBottom: 10,
                }}
              >
                초대
              </h2>
              <InviteForm
                organizationId={id}
                pending={invitations.map((item) => ({
                  id: item.id,
                  email: item.email,
                  role: item.role,
                  expiresAt: formatWhen(item.expiresAt),
                }))}
              />
            </section>
          )}

          <section
            style={{
              marginTop: 44,
              padding: "16px 18px",
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
            }}
          >
            <h2 style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>역할이 뜻하는 것</h2>
            <ul style={{ padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <RoleNote role="owner">가족을 관리하고, 가족 문서를 모두 고칠 수 있습니다.</RoleNote>
              <RoleNote role="admin">초대와 역할 변경까지. 문서 권한은 owner 와 같습니다.</RoleNote>
              <RoleNote role="member">가족 문서를 읽고 고칠 수 있습니다.</RoleNote>
              <RoleNote role="guest">
                가족 문서를 <strong style={{ fontWeight: 500 }}>볼 수 없습니다.</strong> 따로 공유받은
                문서만 열립니다.
              </RoleNote>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function RoleNote({ role, children }: { role: string; children: React.ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 10, fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)" }}>
      <span
        style={{
          flexShrink: 0,
          minWidth: 52,
          height: 20,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius-sm)",
          background: "var(--chip)",
          fontSize: 11,
          color: "var(--ink-2)",
          marginTop: 2,
        }}
      >
        {familyRoleLabel(role)}
      </span>
      <span>{children}</span>
    </li>
  );
}
