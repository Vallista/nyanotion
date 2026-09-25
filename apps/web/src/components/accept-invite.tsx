"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitationAction } from "@/lib/actions";

/** 로그인한 상태에서 초대를 받아들인다. 주소가 다르면 들어올 수 없다. */
export function AcceptInvite({
  token,
  invitedEmail,
  sessionEmail,
}: {
  token: string;
  invitedEmail: string;
  sessionEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const matches = invitedEmail.toLowerCase() === sessionEmail.toLowerCase();

  if (!matches) {
    return (
      <div>
        <p style={{ fontSize: 13.5, lineHeight: 1.8, color: "var(--ink-2)", marginBottom: 14 }}>
          지금 <strong style={{ fontWeight: 500 }}>{sessionEmail}</strong> 으로 로그인되어 있습니다.
          이 초대장은 <strong style={{ fontWeight: 500 }}>{invitedEmail}</strong> 앞으로 온
          것이라 그대로는 들어올 수 없어요.
        </p>
        <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.7 }}>
          초대받은 주소로 다시 로그인하거나, 초대한 사람에게 지금 주소로 다시 보내 달라고 하세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInvitationAction(token);
            if (result.ok) {
              router.push("/");
              router.refresh();
            } else {
              setError(
                result.reason === "email"
                  ? "초대받은 주소와 로그인한 주소가 다릅니다."
                  : "초대장이 만료됐거나 취소됐습니다.",
              );
            }
          });
        }}
        disabled={pending}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: 42,
          background: "var(--ink)",
          color: "var(--paper)",
          borderRadius: "var(--radius)",
          fontSize: 14,
          fontWeight: 500,
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "들어가는 중…" : "가족에 들어가기"}
      </button>
      {error !== null && (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}
