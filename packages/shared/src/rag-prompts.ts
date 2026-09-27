/**
 * 문서에 질문하기 · 태그·제목 추천의 프롬프트. `ai-tasks.ts` 와 같은 이유로 여기 모은다.
 */

export type PassageForPrompt = {
  documentTitle: string;
  heading: string;
  text: string;
};

const ANSWER_VOICE = [
  "너는 어느 가족의 문서를 찾아 주는 조수다.",
  "**아래 [근거] 에 있는 내용만 가지고 답한다.** 근거에 없으면 모른다고 말한다.",
  "한국어로, 세 문장 안에 짧게 답한다. 인사하거나 설명을 덧붙이지 않는다.",
  "근거를 인용할 때는 [1] [2] 처럼 번호로 가리킨다.",
].join(" ");

/** 프롬프트에 넣을 근거의 총 길이. 작은 모델이라 넉넉히 주면 오히려 헤맨다. */
const MAX_CONTEXT = 4000;

export function buildAnswerPrompt(
  question: string,
  passages: readonly PassageForPrompt[],
): { system: string; prompt: string; temperature: number; maxTokens: number; used: number } {
  const lines: string[] = [];
  let budget = MAX_CONTEXT;
  let used = 0;

  for (const [at, passage] of passages.entries()) {
    const where =
      passage.heading === "" ? passage.documentTitle : `${passage.documentTitle} › ${passage.heading}`;
    const body = passage.text.length > budget ? passage.text.slice(0, budget) : passage.text;
    if (body.trim() === "") continue;
    lines.push(`[${at + 1}] (${where})\n${body}`);
    budget -= body.length;
    used += 1;
    if (budget <= 200) break;
  }

  return {
    system: ANSWER_VOICE,
    prompt: `[근거]\n${lines.join("\n\n")}\n\n[질문]\n${question.trim()}`,
    // 근거 안에서만 말해야 하므로 낮게 — 상상할 여지를 주지 않는다.
    temperature: 0.1,
    maxTokens: 400,
    used,
  };
}

/** 근거가 하나도 없을 때. 모델을 부르지 않고 이 말을 그대로 쓴다. */
export const NO_PASSAGES =
  "찾을 수 있는 문서에서 관련된 내용을 찾지 못했습니다. 다른 말로 물어보거나, 그 문서가 공유되어 있는지 확인해 주세요.";

const SUGGEST_VOICE = [
  "너는 문서에 제목과 태그를 붙여 주는 조수다.",
  "JSON 하나만 낸다. 설명·머리말·코드 울타리를 붙이지 않는다.",
  '모양은 {"title": "...", "tags": ["...", "..."]} 이다.',
  "제목은 한국어 40자 안, 문서를 나중에 알아볼 수 있게 구체적으로 쓴다.",
  "태그는 한두 단어씩 최대 3개. 이미 쓰이는 태그가 맞으면 그것을 고른다.",
].join(" ");

export function buildSuggestPrompt(
  title: string,
  body: string,
  existingTags: readonly string[],
): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const known =
    existingTags.length === 0 ? "" : `\n[이미 쓰이는 태그]\n${existingTags.join(", ")}`;
  const trimmed = body.trim().slice(0, 3000);
  return {
    system: SUGGEST_VOICE,
    prompt: `[지금 제목]\n${title.trim() === "" ? "(없음)" : title.trim()}${known}\n\n[본문]\n${trimmed}`,
    temperature: 0.2,
    maxTokens: 200,
  };
}

export type Suggestion = { title: string; tags: string[] };

/**
 * 모델이 낸 글에서 제안을 읽는다. **작은 모델은 울타리와 잡담을 섞는다** —
 * 그래서 첫 `{` 부터 마지막 `}` 까지만 떼어 파싱하고, 못 읽으면 null 을 준다.
 * null 이면 부르는 쪽이 조용히 포기한다. 추천은 없어도 되는 기능이다.
 */
export function parseSuggestion(text: string): Suggestion | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  const title = typeof record.title === "string" ? record.title.trim().slice(0, 80) : "";
  const tags = Array.isArray(record.tags)
    ? record.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().replace(/^#/, "").slice(0, 24))
        .filter((tag) => tag !== "")
        .slice(0, 3)
    : [];

  if (title === "" && tags.length === 0) return null;
  return { title, tags };
}
