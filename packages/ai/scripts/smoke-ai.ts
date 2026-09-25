/**
 * M5 냥이 점검 — 게이트웨이, GPU 모드, 실제 생성.
 *   pnpm --filter @nyanotion/ai smoke
 * Ollama 가 떠 있어야 생성까지 확인한다. 없으면 그 부분은 건너뛴다.
 */
import { getGpuMode, loadEnv, setGpuMode } from "@nyanotion/db";
import { buildPrompt, isAiTask } from "@nyanotion/shared";
import { AiBusyError, aiConfig, aiStatus, streamCompletion } from "../src/gateway.ts";

loadEnv();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

async function collect(prompt: string, options: Parameters<typeof streamCompletion>[1]) {
  let text = "";
  for await (const chunk of streamCompletion(prompt, options)) text += chunk.text;
  return text;
}

async function main(): Promise<void> {
  const before = await getGpuMode();

  console.log("설정");
  check("모델 이름이 잡힌다", aiConfig.chatModel !== "", aiConfig.chatModel);
  check("동시 실행 수는 1 이상", aiConfig.maxConcurrency >= 1, aiConfig.maxConcurrency);

  console.log("\n작업 목록");
  check("아는 작업만 통과한다", isAiTask("summarize") && !isAiTask("hack"));
  const plan = buildPrompt("polish", "오늘은 마트에 갓다");
  check("프롬프트에 글이 들어간다", plan.prompt.includes("오늘은 마트에 갓다"));
  check("다듬기는 온도가 낮다", plan.temperature <= 0.3, plan.temperature);
  check("요약은 답 길이를 줄인다", buildPrompt("summarize", "글").maxTokens < plan.maxTokens);
  const long = "가".repeat(9000);
  check("긴 글은 잘라서 보낸다", buildPrompt("polish", long).prompt.length < 9000);

  console.log("\n상태");
  await setGpuMode("free");
  const status = await aiStatus();
  check("모드를 읽는다", status.mode === "free", status.mode);
  console.log(
    `  Ollama ${status.reachable ? "닿음" : "안 닿음"}` +
      (status.models.length > 0 ? ` — 모델: ${status.models.join(", ")}` : ""),
  );

  console.log("\n게임 모드");
  await setGpuMode("gaming");
  check("모드가 바뀐다", (await getGpuMode()) === "gaming");
  let refused = false;
  try {
    await collect("안녕", {});
  } catch (error) {
    refused = error instanceof AiBusyError && error.reason.kind === "gaming";
  }
  check("**게임 중에는 생성을 거절한다**", refused);
  await setGpuMode("free");
  check("되돌아온다", (await getGpuMode()) === "free");

  if (!status.reachable) {
    console.log("\n(Ollama 가 안 떠 있어 생성은 건너뜁니다)");
  } else if (!status.models.some((name) => name.startsWith(aiConfig.chatModel.split(":")[0] ?? ""))) {
    console.log(`\n(모델 ${aiConfig.chatModel} 이 없어 생성은 건너뜁니다)`);
  } else {
    console.log("\n실제 생성 (한국어)");
    const started = Date.now();
    const summary = await collect(
      buildPrompt("summarize", "토요일 아침에 마트에 갔다. 쌀 10kg 과 고양이 모래 두 포대를 샀다. 마트는 10시 전이 한가했다.").prompt,
      { system: buildPrompt("summarize", "x").system, temperature: 0.2, maxTokens: 200 },
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    check("글자가 돌아온다", summary.trim().length > 0, summary.slice(0, 60));
    check("한글이 섞여 있다", /[가-힣]/.test(summary), summary.slice(0, 60));
    console.log(`  (${seconds}초)  ${summary.trim().replace(/\s+/g, " ").slice(0, 120)}`);
  }

  await setGpuMode(before);
  console.log(`\n원래 모드(${before})로 되돌렸습니다`);
}

await main();
console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
