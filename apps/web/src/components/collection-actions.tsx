"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState } from "react";
import { deleteCollectionAction, updateCollectionAction } from "@/lib/actions";
import { DotsIcon } from "./icons";
import { Spinner, usePending } from "./pending";

/**
 * 모음 이름·보기 방식 바꾸기, 지우기. 지워도 문서는 그대로다.
 *
 * 손으로 담는 모음(=데이터베이스)에는 목록·표 토글을 두지 않는다 —
 * 그쪽은 표·보드·달력이고, 그 전환은 표 안의 단추가 맡는다.
 */
export function CollectionActions({
  id,
  name,
  view: serverView,
  showViewToggle = true,
}: {
  id: string;
  name: string;
  view: "list" | "table" | "board" | "calendar";
  showViewToggle?: boolean;
}) {
  const router = useRouter();
  const { busy, run } = usePending();
  // 보기 전환은 단추부터 바뀐다. 이름 바꾸기는 제목이 이 컴포넌트 밖에 있어서 답이 올 때까지 원을 띄운다.
  const [view, setView] = useOptimistic(serverView);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (renaming) {
    return (
      <input
        autoFocus
        defaultValue={name}
        onBlur={(event) => {
          setRenaming(false);
          const next = event.currentTarget.value.trim();
          if (next !== "" && next !== name) {
            run("rename", () => updateCollectionAction(id, { name: next }));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setRenaming(false);
        }}
        aria-label="모음 이름"
        style={{
          height: 26,
          width: 170,
          padding: "0 8px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--accent)",
          background: "var(--card)",
          fontSize: 13,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
      {showViewToggle && (
      <span
        style={{
          display: "inline-flex",
          borderRadius: "var(--radius)",
          border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        {(["list", "table"] as const).map((option) => (
          <button
            key={option}
            onClick={() =>
              run("view", async () => {
                setView(option);
                await updateCollectionAction(id, { view: option });
              })
            }
            style={{
              height: 26,
              padding: "0 10px",
              fontSize: 12,
              background: view === option ? "var(--accent-soft)" : "transparent",
              color: view === option ? "var(--ink)" : "var(--ink-3)",
            }}
          >
            {option === "list" ? "목록" : "표"}
          </button>
        ))}
      </span>
      )}

      <button
        aria-label="모음 설정"
        onClick={() => setOpen((value) => !value)}
        disabled={busy("rename")}
        aria-busy={busy("rename")}
        style={{
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "var(--radius)",
          color: "var(--ink-2)",
        }}
      >
        {busy("rename") ? <Spinner size={13} /> : <DotsIcon />}
      </button>

      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 25 }} />
          <span
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              zIndex: 26,
              minWidth: 190,
              background: "var(--card)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-float)",
              padding: 4,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <button
              onClick={() => {
                setOpen(false);
                setRenaming(true);
              }}
              style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink-2)" }}
            >
              이름 바꾸기
            </button>
            {confirming ? (
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirming(false);
                  // 기다리지 않고 홈으로 옮긴다. 지우는 일은 서버가 뒤에서 한다.
                  router.push("/");
                  deleteCollectionAction(id).catch(console.error);
                }}
                style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink)" }}
              >
                정말 지울까요?
              </button>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                style={{ padding: "7px 8px", borderRadius: 3, fontSize: 13, color: "var(--ink-2)" }}
              >
                모음 지우기
              </button>
            )}
            <span
              style={{
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "var(--ink-3)",
                padding: "4px 8px 6px",
              }}
            >
              모음만 사라지고 문서는 그대로 남습니다.
            </span>
          </span>
        </>
      )}
    </span>
  );
}
