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

  // 멘션은 글자만 남긴다 — 가리키는 문서가 공개라는 보장이 없으므로 링크로 만들지 않는다.
  if (node.type === "mention") {
    const props = isRecord(node.props) ? node.props : {};
    const title = typeof props.title === "string" && props.title !== "" ? props.title : "제목 없음";
    return <span style={{ background: "var(--chip)", padding: "0 3px", borderRadius: 3 }}>@{title}</span>;
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
    case "callout": {
      const props = isRecord(node.props) ? node.props : {};
      const tone = typeof props.tone === "string" ? props.tone : "note";
      const emoji =
        typeof props.emoji === "string" && props.emoji !== ""
          ? props.emoji
          : tone === "tip"
            ? "🐾"
            : tone === "warn"
              ? "⚠️"
              : "💡";
      return (
        <Fragment>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              background: tone === "warn" ? "rgba(176,128,80,0.09)" : "var(--surface)",
              borderLeft: `3px solid ${tone === "tip" ? "var(--accent)" : "var(--line-strong)"}`,
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              margin: "8px 0",
            }}
          >
            <span>{emoji}</span>
            <div style={{ flex: 1, lineHeight: 1.72 }}>{inner}</div>
          </div>
          {nested}
        </Fragment>
      );
    }

    case "equation": {
      const props = isRecord(node.props) ? node.props : {};
      const latex = typeof props.latex === "string" ? props.latex : "";
      // 공개 화면에는 KaTeX 를 싣지 않는다 (글꼴까지 200kB 가 넘는다). 원본을 그대로 보여 준다.
      return (
        <Fragment>
          <pre
            style={{
              background: "var(--surface)",
              borderRadius: "var(--radius)",
              padding: "10px 12px",
              margin: "8px 0",
              textAlign: "center",
              fontSize: 13.5,
              fontFamily: "var(--font-plex-mono), monospace",
              overflowX: "auto",
            }}
          >
            {latex}
          </pre>
          {nested}
        </Fragment>
      );
    }

    case "image":
    case "video":
    case "audio":
    case "file":
      return (
        <Fragment>
          <Media type={type} props={node.props} />
          {nested}
        </Fragment>
      );

    case "divider":
      return <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />;

    case "database":
      // 표는 로그인한 사람의 권한으로만 읽을 수 있다 — 공개 링크로는 내용을 보여 주지 않는다.
      return (
        <p
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            border: "1px dashed var(--line-strong)",
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            margin: "8px 0",
          }}
        >
          표가 있습니다. 로그인하면 볼 수 있어요.
        </p>
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

/**
 * 그림·소리·파일. 주소는 `/api/file/<id>` 이고, 그 라우트가 **공개 링크가 열려 있을 때만**
 * 로그인 없이 내준다. 그래서 여기서 따로 막지 않는다.
 */
function Media({ type, props }: { type: string; props: Unknown }): React.ReactNode {
  const bag = isRecord(props) ? props : {};
  const url = typeof bag.url === "string" ? bag.url : "";
  const name = typeof bag.name === "string" ? bag.name : "파일";
  const caption = typeof bag.caption === "string" ? bag.caption : "";
  if (url === "") return null;

  const figure = (child: React.ReactNode) => (
    <figure style={{ margin: "10px 0" }}>
      {child}
      {caption !== "" && (
        <figcaption style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5 }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );

  if (type === "image") {
    // next/image 를 쓰지 않는다 — 우리 서버가 내주는 파일이라 최적화 경로가 오히려 방해된다.
    // eslint-disable-next-line @next/next/no-img-element
    return figure(<img src={url} alt={caption === "" ? name : caption} style={{ maxWidth: "100%", borderRadius: "var(--radius)" }} />);
  }
  if (type === "video") {
    return figure(<video src={url} controls style={{ maxWidth: "100%", borderRadius: "var(--radius)" }} />);
  }
  if (type === "audio") {
    return figure(<audio src={url} controls style={{ width: "100%" }} />);
  }
  return figure(
    <a href={url} rel="noreferrer nofollow">
      {name}
    </a>,
  );
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
