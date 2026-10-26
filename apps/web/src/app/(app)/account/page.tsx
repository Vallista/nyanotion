import { listApiTokens } from "@nyanotion/db";
import { ApiTokens } from "@/components/api-tokens";
import { ChangePassword } from "@/components/change-password";
import { TopBar } from "@/components/top-bar";
import { requestOrigin } from "@/lib/origin";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "내 계정" };

/** 내 계정 — 지금은 비밀번호 바꾸기 하나. 어드민이 준 임시 비밀번호를 여기서 바꾼다. */
export default async function AccountPage() {
  const viewer = await requireViewer();
  const [tokens, origin] = await Promise.all([listApiTokens(viewer.userId), requestOrigin()]);
  return (
    <>
      <TopBar crumbs={[{ id: null, title: "내 계정" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", padding: "48px 16px 120px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>
            내 계정
          </h1>
          <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 28 }}>
            {viewer.name} · {viewer.email}
          </p>
          <ChangePassword />
          <ApiTokens tokens={tokens} origin={origin} />
        </div>
      </div>
    </>
  );
}
