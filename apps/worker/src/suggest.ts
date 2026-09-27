import { eq } from "drizzle-orm";
import { buildSuggestPrompt, parseSuggestion } from "@nyanotion/shared";
import { aiConfig, streamCompletion, stripThinking } from "@nyanotion/ai";
import { db, document, listTags, putSuggestion } from "@nyanotion/db";

/**
 * 제목·태그를 추천한다. **반영하지 않는다** — `document_suggestion` 에 적어 두고 끝난다.
 * 사람이 화면에서 누르면 그때 옮겨 간다 (`acceptSuggestion`).
 *
 * 작은 모델이라 JSON 을 못 낼 때가 있다. 그때는 조용히 포기한다 — 추천은 없어도 되는 기능이고,
 * 실패로 큐를 채워 색인을 밀어내는 것이 더 나쁘다.
 */
export type SuggestResult = { documentId: string; made: boolean; reason: string };

export async function suggestForDocument(documentId: string): Promise<SuggestResult> {
  const rows = await db
    .select({
      spaceId: document.spaceId,
      title: document.title,
      textPlain: document.textPlain,
      archivedAt: document.archivedAt,
    })
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.archivedAt !== null) {
    return { documentId, made: false, reason: "문서가 없습니다" };
  }
  // 두세 줄짜리 메모에 제목을 지어 주는 것은 도움보다 방해다.
  if (row.textPlain.trim().length < 200) {
    return { documentId, made: false, reason: "너무 짧습니다" };
  }

  const known = (await listTags([row.spaceId])).map((tag) => tag.name);
  const plan = buildSuggestPrompt(row.title, row.textPlain, known);

  let answer = "";
  for await (const chunk of streamCompletion(plan.prompt, {
    system: plan.system,
    temperature: plan.temperature,
    maxTokens: plan.maxTokens,
  })) {
    answer += chunk.text;
  }

  const suggestion = parseSuggestion(stripThinking(answer));
  if (suggestion === null) return { documentId, made: false, reason: "JSON 을 못 읽었습니다" };

  // 이미 제목이 있으면 제목은 건드리지 않는다 — 사람이 쓴 제목이 더 낫다.
  const title = row.title.trim() === "" ? suggestion.title : "";
  if (title === "" && suggestion.tags.length === 0) {
    return { documentId, made: false, reason: "제안할 것이 없습니다" };
  }

  await putSuggestion(documentId, { title, tags: suggestion.tags }, aiConfig.chatModel);
  return { documentId, made: true, reason: "" };
}
