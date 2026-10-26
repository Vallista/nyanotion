"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      style={{
        fontSize: 12.5,
        color: "var(--ink-3)",
        padding: "4px 8px",
        borderRadius: "var(--radius)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      나가기
    </button>
  );
}
