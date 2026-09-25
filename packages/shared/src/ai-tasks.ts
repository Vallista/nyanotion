/**
 * 냥이가 할 줄 아는 일. 프롬프트는 전부 여기 모아 둔다 —
 * 화면이나 라우트에 흩어지면 말투가 제각각이 되고 고치기도 어렵다.
 */

export const AI_TASKS = ["continue", "summarize", "polish", "translate"] as const;
export type AiTask = (typeof AI_TASKS)[number];

export function isAiTask(value: unknown): value is AiTask {
  return typeof value === "string" && (AI_TASKS as readonly string[]).includes(value);
}

export const TASK_LABELS: Record<AiTask, string> = {
  continue: "이어 쓰기",
  summarize: "요약하기",
  polish: "다듬기",
  translate: "번역하기",
};

const VOICE = [
  "너는 어느 가족의 문서를 돕는 조수다.",
  "한국어로 답한다. 사용자가 쓴 말투와 높임법을 그대로 따른다.",
  "설명하거나 인사하지 말고 결과만 낸다. 머리말·꼬리말·따옴표를 붙이지 않는다.",
  "모르면 지어내지 않는다.",
].join(" ");

const INSTRUCTIONS: Record<AiTask, string> = {
  continue:
    "아래 글에 이어서 두세 문장을 더 쓴다. 이미 있는 내용을 다시 말하지 않는다. 글이 끊긴 자리에서 자연스럽게 잇는다.",
  summarize:
    "아래 글을 핵심만 남겨 짧게 간추린다. 세 줄을 넘기지 않는다. 원문에 없는 내용을 더하지 않는다.",
  polish:
    "아래 글을 뜻은 그대로 두고 문장만 다듬는다. 어색한 표현과 오탈자를 고치고, 길이를 크게 바꾸지 않는다.",
  translate:
    "아래 글이 한국어면 자연스러운 영어로, 그 밖의 말이면 자연스러운 한국어로 옮긴다. 번역문만 낸다.",
};

/** 한 번에 보낼 수 있는 글자 수. 넘으면 뒤쪽(커서 근처)을 남긴다. */
const MAX_INPUT = 6000;

function trim(text: string): string {
  const clean = text.trim();
  if (clean.length <= MAX_INPUT) return clean;
  // 이어 쓰기·다듬기는 끝부분이 중요하다 — 앞을 버린다.
  return `…${clean.slice(clean.length - MAX_INPUT)}`;
}

export function buildPrompt(
  task: AiTask,
  selection: string,
  context?: string,
): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const body = trim(selection);
  const around = context === undefined || context.trim() === "" ? null : trim(context);

  const parts = [INSTRUCTIONS[task]];
  if (around !== null && task === "continue") {
    parts.push(`\n[문서 전체 맥락]\n${around}`);
  }
  parts.push(`\n[글]\n${body}`);

  return {
    system: VOICE,
    prompt: parts.join("\n"),
    temperature: task === "continue" ? 0.6 : 0.2,
    maxTokens: task === "summarize" ? 300 : 800,
  };
}
