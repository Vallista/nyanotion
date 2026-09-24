/**
 * BlockNote 블록 트리 → 평문. `document.text_plain` 을 만드는 유일한 곳이다.
 * FTS·청킹·LLM 입력이 모두 이 값을 보므로, 저장 경로에서 반드시 같이 갱신한다.
 *
 * 입력은 DB 에 들어 있던 JSON 이라 어떤 모양이든 올 수 있다고 보고 방어적으로 읽는다.
 */

type Unknown = unknown;

function isRecord(v: Unknown): v is Record<string, Unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 인라인 콘텐츠(텍스트·링크·멘션)에서 글자만 뽑는다. */
function inlineText(node: Unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(inlineText).join("");
  if (!isRecord(node)) return "";

  // { type: "text", text: "..." }
  if (typeof node.text === "string") return node.text;
  // { type: "link", content: [...] }
  if (node.content !== undefined) return inlineText(node.content);
  // 표 셀 등
  if (Array.isArray(node.cells)) return node.cells.map(inlineText).join("\t");
  if (Array.isArray(node.rows)) return node.rows.map(inlineText).join("\n");
  return "";
}

/** 블록 하나와 그 자식들을 줄 단위로 펼친다. */
function blockLines(block: Unknown, depth: number): string[] {
  if (!isRecord(block)) return [];
  const lines: string[] = [];

  const own = inlineText(block.content).trim();
  if (own !== "") {
    const type = typeof block.type === "string" ? block.type : "paragraph";
    const bullet =
      type === "bulletListItem" ? "- "
      : type === "numberedListItem" ? "1. "
      : type === "checkListItem" ? (isRecord(block.props) && block.props.checked === true ? "[x] " : "[ ] ")
      : "";
    lines.push("  ".repeat(depth) + bullet + own);
  }

  // 텍스트가 없는 블록도 자식은 있을 수 있다 (빈 단락 아래 중첩 등)
  if (Array.isArray(block.children)) {
    for (const child of block.children) lines.push(...blockLines(child, depth + (own === "" ? 0 : 1)));
  }
  return lines;
}

/** 블록 트리 전체를 평문으로. 제목은 따로 관리하므로 여기 포함하지 않는다. */
export function blocksToPlainText(content: Unknown): string {
  if (!Array.isArray(content)) return "";
  const lines: string[] = [];
  for (const block of content) lines.push(...blockLines(block, 0));
  return lines.join("\n").trim();
}

/** 제목이 비어 있을 때 본문 첫 줄에서 제목을 짐작한다. 노션과 같은 동작. */
export function guessTitle(content: Unknown, max = 80): string {
  const first = blocksToPlainText(content)
    .split("\n")
    .map((l) => l.replace(/^(\s*)([-*]|\d+\.|\[[ x]\])\s+/, "").trim())
    .find((l) => l !== "");
  if (first === undefined) return "";
  return first.length > max ? first.slice(0, max) : first;
}
