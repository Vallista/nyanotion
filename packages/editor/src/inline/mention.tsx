"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { mentionInlineConfig } from "@nyanotion/editor-schema";
import { usePorts } from "../context";
import { PageIcon } from "../icons";

/**
 * 다른 문서를 본문 안에서 가리킨다 (`@`).
 *
 * 저장된 제목을 그대로 보여 준다. 최신 제목을 가져오려면 멘션마다 요청이 하나씩 생기는데,
 * 문단에 열 개가 있으면 열 번이다 — 문서를 여는 속도가 그만큼 느려진다.
 * 제목이 바뀌면 다음에 그 문서를 열어 본 사람이 알게 되고, 링크 자체는 언제나 살아 있다.
 */
export const mentionReactSpec = createReactInlineContentSpec(mentionInlineConfig, {
  render: ({ inlineContent }) => {
    const ports = usePorts();
    const { documentId, title } = inlineContent.props;

    if (documentId === "") return <span style={{ color: "var(--ink-4)" }}>@?</span>;

    return (
      <ports.Link
        href={ports.hrefForDocument(documentId)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          border: 0,
          padding: "0 3px",
          borderRadius: 3,
          background: "var(--chip)",
          color: "var(--ink)",
          // 앞뒤 글자와 붙지 않게, 그러나 줄바꿈은 자연스럽게.
          margin: "0 1px",
        }}
      >
        <span style={{ display: "inline-flex", color: "var(--ink-4)" }}>
          <PageIcon size={12} />
        </span>
        {title === "" ? "제목 없음" : title}
      </ports.Link>
    );
  },
});
