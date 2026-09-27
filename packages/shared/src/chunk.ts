/**
 * 블록 트리 → 검색·질의에 넣을 토막(청크).
 *
 * 평문(`blocksToPlainText`)만으로는 **근거로 점프할 수 없다.** 답변이 "김장 레시피에 이렇게
 * 적혀 있다"고 말할 때 그 줄로 데려가려면 청크가 블록 id 를 물고 있어야 한다.
 * 그래서 평문과 별개로 한 번 더 걷는다 — 이쪽은 블록 경계를 잃지 않는다.
 *
 * 크기는 "한 토막이 한 가지 이야기"가 되도록 잡았다. 너무 크면 근거가 뭉개지고,
 * 너무 작으면 앞뒤 맥락이 끊겨 임베딩이 헛돈다.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 인라인 콘텐츠에서 글자만. `blocksToPlainText` 와 같은 규칙이다. */
function inlineText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(inlineText).join("");
  if (!isRecord(node)) return "";
  if (typeof node.text === "string") return node.text;
  if (node.content !== undefined) return inlineText(node.content);
  if (Array.isArray(node.cells)) return node.cells.map(inlineText).join("\t");
  if (Array.isArray(node.rows)) return node.rows.map(inlineText).join("\n");
  return "";
}

/** 블록 하나 = 한 줄. 블록 id 를 잃지 않는 것이 이 함수의 존재 이유다. */
type Line = { blockId: string; text: string; heading: string };

function walk(block: unknown, depth: number, heading: { current: string }, out: Line[]): void {
  if (!isRecord(block)) return;
  const type = typeof block.type === "string" ? block.type : "paragraph";
  const id = typeof block.id === "string" ? block.id : "";
  const own = inlineText(block.content).trim();

  if (own !== "") {
    // 제목 블록은 자기 아래 토막들의 맥락이 된다 — 답변에 "무엇에 대한 이야기인지"를 준다.
    if (type === "heading") heading.current = own;

    const bullet =
      type === "bulletListItem" ? "- "
      : type === "numberedListItem" ? "1. "
      : type === "checkListItem"
        ? (isRecord(block.props) && block.props.checked === true ? "[x] " : "[ ] ")
      : type === "heading" ? "# "
      : "";
    out.push({ blockId: id, text: "  ".repeat(depth) + bullet + own, heading: heading.current });
  }

  // 수식·콜아웃처럼 props 에 글이 들어가는 블록도 찾을 수 있어야 한다.
  if (isRecord(block.props) && typeof block.props.latex === "string" && block.props.latex !== "") {
    out.push({ blockId: id, text: block.props.latex, heading: heading.current });
  }

  if (Array.isArray(block.children)) {
    for (const child of block.children) walk(child, depth + (own === "" ? 0 : 1), heading, out);
  }
}

export type DocumentChunk = {
  /** 문서 안 순서. `(document_id, chunk_index)` 가 청크의 신원이다. */
  index: number;
  /** 임베딩과 프롬프트에 들어가는 글. */
  text: string;
  /** 근거로 점프할 블록. 빈 문자열이면 문서 맨 위로 보낸다. */
  blockId: string;
  /** 이 토막이 속한 마지막 제목. 답변에 맥락을 준다. */
  heading: string;
};

export type ChunkOptions = {
  /** 한 토막의 목표 길이(글자). 한국어는 글자당 대략 토큰 1 을 넘지 않는다. */
  targetChars?: number;
  /** 앞 토막의 꼬리를 얼마나 물릴지. 문장이 경계에서 잘려 뜻을 잃는 것을 막는다. */
  overlapChars?: number;
};

/**
 * 제목 + 블록 트리를 토막으로 나눈다.
 *
 * 제목을 **모든 토막 앞에 붙인다.** 가족 메모는 "재료", "그 다음" 처럼 그 문서 안에서만
 * 뜻이 통하는 말이 많아서, 제목이 없으면 임베딩이 문서를 구별하지 못한다.
 */
export function chunkDocument(
  title: string,
  content: unknown,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const targetChars = Math.max(200, options.targetChars ?? 700);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? 120, targetChars - 100));

  const lines: Line[] = [];
  if (Array.isArray(content)) {
    const heading = { current: "" };
    for (const block of content) walk(block, 0, heading, lines);
  }
  if (lines.length === 0) {
    const bare = title.trim();
    return bare === "" ? [] : [{ index: 0, text: bare, blockId: "", heading: "" }];
  }

  const prefix = title.trim() === "" ? "" : `${title.trim()}\n\n`;
  const chunks: DocumentChunk[] = [];

  const emit = (group: readonly Line[]): void => {
    const head = group[0];
    if (head === undefined) return;
    const body = group.map((line) => line.text).join("\n");
    // 절의 제목이 이 토막 안에 없으면 앞에 붙여 준다 — 두 번째 토막부터가 그렇다.
    const context = head.heading !== "" && !body.startsWith("# ") ? `${head.heading}\n` : "";
    chunks.push({
      index: chunks.length,
      text: `${prefix}${context}${body}`,
      blockId: head.blockId,
      heading: head.heading,
    });
  };

  // 1. 제목에서 먼저 끊는다. 절(節)이 섞이면 근거가 엉뚱한 곳을 가리킨다.
  const sections: Line[][] = [];
  for (const line of lines) {
    if (line.text.startsWith("# ") || sections.length === 0) sections.push([]);
    const section = sections[sections.length - 1];
    if (section !== undefined) section.push(line);
  }

  // 2. 절 안에서만 목표 길이로 자르고 꼬리를 물린다.
  for (const section of sections) {
    let buffer: Line[] = [];
    let length = 0;
    let fresh = false; // 마지막으로 낸 뒤 새 줄이 들어왔는가 — 꼬리만 남은 토막을 또 내지 않기 위해

    for (const line of section) {
      buffer.push(line);
      length += line.text.length + 1;
      fresh = true;
      if (length < targetChars) continue;

      emit(buffer);
      fresh = false;

      const tail: Line[] = [];
      let kept = 0;
      for (let i = buffer.length - 1; i > 0 && kept < overlapChars; i -= 1) {
        const previous = buffer[i];
        if (previous === undefined) continue;
        tail.unshift(previous);
        kept += previous.text.length + 1;
      }
      buffer = tail;
      length = kept;
    }
    if (fresh) emit(buffer);
  }
  return chunks;
}
