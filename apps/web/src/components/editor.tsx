"use client";

import "@blocknote/core/style.css";
import "@blocknote/ariakit/style.css";

import { ko } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/ariakit";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useRef } from "react";

/**
 * BlockNote 는 브라우저 DOM(ProseMirror) 위에서만 돈다 — 이 파일은 항상 클라이언트다.
 *
 * Ariakit 판 BlockNoteView 는 theme 을 "light" | "dark" 만 받는다 (Mantine 판의 theme 객체가 없다).
 * 그래서 색은 globals.css 의 `--bn-*` 변수로 맞춘다 — 메뉴·툴팁이 portal 로 나가므로 :root 에 둔다.
 * 여기서 색을 새로 만들지 말 것.
 */

export function Editor({
  initialContent,
  onChange,
  editable = true,
}: {
  initialContent: unknown;
  onChange: (blocks: unknown) => void;
  editable?: boolean;
}) {
  // DB 에 들어 있던 JSON 이라 모양을 보장할 수 없다 — BlockNote 가 검증한다.
  // 빈 배열을 넘기면 던지므로, 비었으면 undefined 로 기본 단락을 만들게 한다.
  const seed =
    Array.isArray(initialContent) && initialContent.length > 0
      ? (initialContent as never)
      : undefined;

  const editor = useCreateBlockNote({
    initialContent: seed,
    dictionary: ko,
    trailingBlock: true,
  });

  const latest = useRef(onChange);
  latest.current = onChange;

  const handleChange = useCallback(() => {
    latest.current(editor.document);
  }, [editor]);

  // 탭을 닫거나 숨길 때 마지막 상태를 한 번 더 올린다 — 디바운스가 끝나기 전에 떠날 수 있다.
  useEffect(() => {
    const flush = () => latest.current(editor.document);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [editor]);

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme="light"
      onChange={handleChange}
      className="nyan-editor"
    />
  );
}
