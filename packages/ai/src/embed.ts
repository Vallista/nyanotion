import { getGpuMode } from "@nyanotion/db";
import { AiBusyError, aiConfig } from "./gateway";

/**
 * 글 → 벡터. 문서 질의(M6)의 절반은 이 함수다.
 *
 * **길이를 단위로 맞춰서 내놓는다.** 그래야 코사인 거리가 내적 하나로 끝나고, pgvector 가
 * 없는 환경에서 쓰는 `nyan_cosine_distance` 도 값이 흔들리지 않는다. 모델이 이미 정규화해
 * 주더라도 한 번 더 해서 나쁠 것이 없다 (같은 값이 나온다).
 *
 * 생성(`streamCompletion`)과 달리 **클라우드 폴백이 없다.** 임베딩은 문서 본문을 통째로
 * 밖으로 보내는 일이고, 그건 이 집 서버를 만든 이유와 반대다. 게임 중이면 기다린다.
 */

/** bge-m3 의 출력 차원. `EMBEDDING_DIMENSIONS`(@nyanotion/db) 와 같아야 한다. */
export const EMBED_DIMENSIONS = 1024;

/** 한 번에 보낼 토막 수. 크게 잡으면 VRAM 을 오래 물고, 작으면 왕복이 늘어난다. */
const BATCH = 8;

function normalize(values: readonly number[]): number[] {
  let sum = 0;
  for (const value of values) sum += value * value;
  const length = Math.sqrt(sum);
  if (length === 0 || !Number.isFinite(length)) return values.map(() => 0);
  return values.map((value) => value / length);
}

type EmbedResponse = { embeddings?: unknown };

async function callOllama(inputs: readonly string[], signal: AbortSignal): Promise<number[][]> {
  const response = await fetch(`${aiConfig.baseUrl}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({ model: aiConfig.embedModel, input: [...inputs] }),
  });
  if (!response.ok) {
    const detail =
      response.status === 404
        ? `임베딩 모델 ${aiConfig.embedModel} 이 없습니다. ollama pull ${aiConfig.embedModel}`
        : `모델 서버가 ${response.status} 을 돌려줬습니다.`;
    throw new AiBusyError({ kind: "unreachable", detail });
  }
  const body = (await response.json()) as EmbedResponse;
  if (!Array.isArray(body.embeddings)) {
    throw new AiBusyError({ kind: "unreachable", detail: "임베딩이 오지 않았습니다." });
  }
  return body.embeddings.map((row) => {
    if (!Array.isArray(row)) {
      throw new AiBusyError({ kind: "unreachable", detail: "임베딩 모양이 이상합니다." });
    }
    const numbers = row.map((value) => (typeof value === "number" ? value : Number(value)));
    if (numbers.length !== EMBED_DIMENSIONS) {
      throw new AiBusyError({
        kind: "unreachable",
        detail:
          `임베딩 차원이 ${numbers.length} 입니다 — ${EMBED_DIMENSIONS} 이어야 합니다. ` +
          `AI_EMBED_MODEL 을 바꿨다면 색인을 전부 다시 만들어야 합니다.`,
      });
    }
    return normalize(numbers);
  });
}

/**
 * 여러 글을 한 번에 벡터로. 넣은 순서대로 돌려준다.
 * 게임 중이면 `AiBusyError({kind:"gaming"})` — 부르는 쪽이 큐에 되돌려 놓아야 한다.
 */
export async function embedTexts(texts: readonly string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if ((await getGpuMode()) === "gaming") throw new AiBusyError({ kind: "gaming" });

  const out: number[][] = [];
  for (let at = 0; at < texts.length; at += BATCH) {
    const slice = texts.slice(at, at + BATCH);
    const signal = AbortSignal.timeout(aiConfig.timeoutMs);
    try {
      out.push(...(await callOllama(slice, signal)));
    } catch (error) {
      if (error instanceof AiBusyError) throw error;
      throw new AiBusyError({
        kind: "unreachable",
        detail:
          error instanceof Error && error.name === "TimeoutError"
            ? "임베딩이 제때 끝나지 않았습니다."
            : "모델 서버에 닿지 못했습니다. Ollama 가 떠 있는지 확인해 주세요.",
      });
    }
  }
  return out;
}

/** 질문 하나를 벡터로. 없으면 어휘 검색만 하도록 `null` 을 준다 — 검색이 막히면 안 된다. */
export async function embedQueryOrNull(query: string): Promise<number[] | null> {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  try {
    const [vector] = await embedTexts([trimmed]);
    return vector ?? null;
  } catch {
    return null;
  }
}
