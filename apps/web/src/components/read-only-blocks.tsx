import { Fragment } from "react";

/**
 * BlockNote 블록을 읽기 전용으로 그린다.
 *
 * 공개 링크로 들어온 사람에게 에디터(BlockNote + Yjs, 100kB 넘는 묶음)를 내려보낼 이유가 없다.
 * 로그인도 표도 없는 사람이라 편집이 애초에 불가능하다 — 그래서 글자만 그린다.
 *
 * 저장된 JSON 이라 어떤 모양이든 올 수 있다고 보고 방어적으로 읽는다.
 */

type Unknown = unknown;

function isRecord(value: Unknown): value is Record<string, Unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Styles = { bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean };

function readStyles(value: Unknown): Styles {
  if (!isRecord(value)) return {};
  return {
    bold: value.bold === true,
    italic: value.italic === true,
    strike: value.strike === true,
    code: value.code === true,
  };
}

function Inline({ node }: { node: Unknown }): React.ReactNode {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map((child, index) => <Inline key={index} node={child} />);
  }
  if (!isRecord(node)) return null;

  if (node.type === "link" && typeof node.href === "string") {
    return (
      <a href={node.href} rel="noreferrer nofollow" target="_blank">
        <Inline node={node.content} />
      </a>
    );
  }

  if (typeof node.text === "string") {
    const styles = readStyles(node.styles);
    let out: React.ReactNode = node.text;
    if (styles.code === true) out = <code>{out}</code>;
    if (styles.strike === true) out = <s>{out}</s>;
    if (styles.italic === true) out = <em>{out}</em>;
    if (styles.bold === true) out = <strong>{out}</strong>;
    return out;
  }

  if (node.content !== undefined) return <Inline node={node.content} />;
  return null;
}

function level(props: Unknown): 1 | 2 | 3 {
  if (isRecord(props) && typeof props.level === "number") {
    if (props.level === 1) return 1;
    if (props.level === 3) return 3;
  }
  return 2;
}

function Block({ node }: { node: Unknown }): React.ReactNode {
  if (!isRecord(node)) return null;
  const type = typeof node.type === "string" ? node.type : "paragraph";
  const children = Array.isArray(node.children) ? node.children : [];
  const inner = <Inline node={node.content} />;

  const nested =
    children.length === 0 ? null : (
      <div style={{ paddingLeft: 20 }}>
        {children.map((child, index) => (
          <Block key={index} node={child} />
        ))}
      </div>
    );

  switch (type) {
    case "heading": {
      const size = level(node.props);
      const style =
        size === 1
          ? { fontSize: 21, fontWeight: 600, letterSpacing: "-0.016em", marginTop: 26 }
          : size === 3
            ? { fontSize: 15.5, fontWeight: 600, marginTop: 20 }
            : { fontSize: 17.5, fontWeight: 600, letterSpacing: "-0.012em", marginTop: 24 };
      return (
        <Fragment>
          <p style={{ ...style, lineHeight: 1.45, marginBottom: 6 }}>{inner}</p>
          {nested}
        </Fragment>
      );
    }
    case "bulletListItem":
      return (
        <Fragment>
          <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "3px 0" }}>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--ink-5)",
                marginTop: 11,
                flexShrink: 0,
              }}
            />
            <span style={{ lineHeight: 1.72 }}>{inner}</span>
          </div>
          {nested}
        </Fragment>
      );
    case "numberedListItem":
      return (
        <Fragment>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "3px 0" }}>
            <span style={{ color: "var(--ink-3)", lineHeight: 1.72 }}>•</span>
            <span style={{ lineHeight: 1.72 }}>{inner}</span>
          </div>
          {nested}
        </Fragment>
      );
    case "checkListItem": {
      const checked = isRecord(node.props) && node.props.checked === true;
      return (
        <Fragment>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "3px 0" }}>
            <span
              style={{
                width: 16,
                height: 16,
                marginTop: 5,
                flexShrink: 0,
                borderRadius: 3.5,
                border: checked ? "none" : "1.3px solid var(--line-strong)",
                background: checked ? "var(--accent)" : "var(--card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 10,
              }}
            >
              {checked ? "✓" : ""}
            </span>
            <span
              style={{
                lineHeight: 1.72,
                color: checked ? "var(--ink-3)" : "var(--ink)",
                textDecoration: checked ? "line-through" : "none",
              }}
            >
              {inner}
            </span>
          </div>
          {nested}
        </Fragment>
      );
    }
    case "quote":
      return (
        <Fragment>
          <blockquote
            style={{
              borderLeft: "1px solid var(--line-strong)",
              background: "var(--surface)",
              borderRadius: "var(--radius)",
              padding: "12px 14px",
              margin: "10px 0",
              color: "var(--ink-2)",
              lineHeight: 1.7,
            }}
          >
            {inner}
          </blockquote>
          {nested}
        </Fragment>
      );
    case "codeBlock":
      return (
        <Fragment>
          <pre
            style={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              padding: "12px 14px",
              margin: "10px 0",
              overflowX: "auto",
              fontSize: 13.5,
              fontFamily: "var(--font-plex-mono), monospace",
            }}
          >
            {inner}
          </pre>
          {nested}
        </Fragment>
      );
    default:
      return (
        <Fragment>
          <p style={{ lineHeight: 1.72, padding: "3px 0", minHeight: 8 }}>{inner}</p>
          {nested}
        </Fragment>
      );
  }
}

export function ReadOnlyBlocks({ content }: { content: unknown }) {
  if (!Array.isArray(content) || content.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--ink-3)" }}>내용이 비어 있습니다.</p>;
  }
  return (
    <div style={{ fontSize: 15.5, color: "var(--ink)" }}>
      {content.map((block, index) => (
        <Block key={index} node={block} />
      ))}
    </div>
  );
}
