import { getGpuMode } from "@nyanotion/db";

/**
 * **모든 LLM 호출이 지나는 단 하나의 문.** 라우트에서 Ollama 를 직접 부르지 말 것 —
 * 모델 이름·타임아웃·동시 실행 수·GPU 모드 판정이 전부 여기 있어야 한 곳에서 바뀐다.
 *
 * 이 집의 GPU 는 게임도 돌린다. 그래서 게이트웨이가 하는 일의 절반은 "지금 비켜 줄 때인가"를
 * 판단하는 것이다 — ARCHITECTURE.md §9.
 */

export type GenerateOptions = {
  system?: string;
  /** 낮을수록 고분고분. 다듬기·번역은 낮게, 이어쓰기는 조금 높게. */
  temperature?: number;
  /** 답이 길어질 수 있는 작업은 올린다. */
  maxTokens?: number;
  signal?: AbortSignal;
};

export type Busy = { kind: "gaming" } | { kind: "unreachable"; detail: string };

export class AiBusyError extends Error {
  readonly reason: Busy;
  constructor(reason: Busy) {
    super(reason.kind === "gaming" ? "GPU 를 게임이 쓰고 있습니다." : reason.detail);
    this.name = "AiBusyError";
    this.reason = reason;
  }
}

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const aiConfig = {
  get baseUrl(): string {
    return env("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/+$/, "");
  },
  get chatModel(): string {
    return env("AI_CHAT_MODEL", "exaone3.5:2.4b");
  },
  get embedModel(): string {
    return env("AI_EMBED_MODEL", "bge-m3");
  },
  get maxConcurrency(): number {
    return Math.max(1, Number(env("AI_MAX_CONCURRENCY", "1")));
  },
  get timeoutMs(): number {
    return Math.max(5000, Number(env("AI_TIMEOUT_MS", "120000")));
  },
  /** 게임 중일 때 우회할 클라우드. 비워 두면 큐에 쌓인다. */
  get fallbackBaseUrl(): string {
    return env("AI_FALLBACK_BASE_URL", "").replace(/\/+$/, "");
  },
  get fallbackApiKey(): string {
    return env("AI_FALLBACK_API_KEY", "");
  },
  get fallbackModel(): string {
    return env("AI_FALLBACK_MODEL", "gpt-4o-mini");
  },
};

/* --------------------------------------------------------- 동시 실행 제한 */

let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<() => void> {
  if (running >= aiConfig.maxConcurrency) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    running -= 1;
    const next = waiting.shift();
    if (next !== undefined) next();
  };
}

/* ------------------------------------------------------------- GPU 모드 */

/**
 * 모델을 VRAM 에서 내린다. `keep_alive: 0` 으로 빈 요청을 보내면 Ollama 가 바로 비운다.
 * 게임을 켜기 직전에 부른다.
 */
export async function unloadModels(): Promise<void> {
  const targets = [aiConfig.chatModel, aiConfig.embedModel];
  await Promise.allSettled(
    targets.map((model) =>
      fetch(`${aiConfig.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: "", keep_alive: 0 }),
        signal: AbortSignal.timeout(10_000),
      }),
    ),
  );
}

export type AiStatus = {
  mode: "free" | "gaming";
  reachable: boolean;
  models: string[];
  usingFallback: boolean;
};

export async function aiStatus(): Promise<AiStatus> {
  const mode = await getGpuMode();
  let reachable = false;
  let models: string[] = [];
  try {
    const response = await fetch(`${aiConfig.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const body = (await response.json()) as { models?: { name?: unknown }[] };
      reachable = true;
      models = (body.models ?? [])
        .map((item) => item.name)
        .filter((name): name is string => typeof name === "string");
    }
  } catch {
    reachable = false;
  }
  return {
    mode,
    reachable,
    models,
    usingFallback: mode === "gaming" && aiConfig.fallbackBaseUrl !== "",
  };
}

/* ------------------------------------------------------------- 생성 */

type Chunk = { text: string };

/**
 * 글자를 흘려보낸다. 게임 중이면 클라우드 폴백이 있을 때만 돌고, 없으면 던진다 —
 * **부르는 쪽이 "나중에 처리합니다"를 사람에게 보여 줘야 한다.**
 */
export async function* streamCompletion(
  prompt: string,
  options: GenerateOptions = {},
): AsyncGenerator<Chunk> {
  const mode = await getGpuMode();
  const useFallback = mode === "gaming" && aiConfig.fallbackBaseUrl !== "";
  if (mode === "gaming" && !useFallback) throw new AiBusyError({ kind: "gaming" });

  const release = await acquire();
  const timeout = AbortSignal.timeout(aiConfig.timeoutMs);
  const signal =
    options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);

  try {
    const response = useFallback
      ? await callFallback(prompt, options, signal)
      : await callOllama(prompt, options, signal);

    if (!response.ok || response.body === null) {
      throw new AiBusyError({
        kind: "unreachable",
        detail: `모델 서버가 ${response.status} 을 돌려줬습니다.`,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Ollama 는 줄마다 JSON, OpenAI 호환은 "data: " 접두사가 붙은 줄.
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        const text = useFallback ? readSseLine(line) : readOllamaLine(line);
        if (text !== null && text !== "") yield { text };
      }
    }
  } catch (error) {
    if (error instanceof AiBusyError) throw error;
    throw new AiBusyError({
      kind: "unreachable",
      detail:
        error instanceof Error && error.name === "TimeoutError"
          ? "모델이 제때 답하지 않았습니다."
          : "모델 서버에 닿지 못했습니다. Ollama 가 떠 있는지 확인해 주세요.",
    });
  } finally {
    release();
  }
}

function callOllama(
  prompt: string,
  options: GenerateOptions,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${aiConfig.baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      model: aiConfig.chatModel,
      prompt,
      system: options.system,
      stream: true,
      // 생각하는 모델(qwen3 류)은 예산을 전부 혼잣말에 써 버리고 빈 답을 낸다 — 꺼 둔다.
      // 생각하지 않는 모델에는 아무 영향이 없다.
      think: false,
      options: {
        temperature: options.temperature ?? 0.4,
        num_predict: options.maxTokens ?? 800,
      },
    }),
  });
}

function callFallback(
  prompt: string,
  options: GenerateOptions,
  signal: AbortSignal,
): Promise<Response> {
  const messages = [
    ...(options.system === undefined ? [] : [{ role: "system", content: options.system }]),
    { role: "user", content: prompt },
  ];
  return fetch(`${aiConfig.fallbackBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${aiConfig.fallbackApiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: aiConfig.fallbackModel,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 800,
    }),
  });
}

function readOllamaLine(line: string): string | null {
  if (line === "") return null;
  try {
    const parsed = JSON.parse(line) as { response?: unknown };
    return typeof parsed.response === "string" ? parsed.response : null;
  } catch {
    return null;
  }
}

/**
 * 혹시 모델이 `<think>…</think>` 를 본문에 섞어 보내면 걷어 낸다.
 * `think: false` 로 대부분 막히지만, 모델을 바꿨을 때 조용히 새는 걸 막는 두 번째 문이다.
 */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^\s*<think>[\s\S]*$/g, "").trim();
}

function readSseLine(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.slice(5).trim();
  if (payload === "" || payload === "[DONE]") return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: unknown } }[];
    };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}
