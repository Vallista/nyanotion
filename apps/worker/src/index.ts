/**
 * 색인 워커 — 문서를 토막내어 임베딩하고, 제목·태그를 추천한다.
 *
 * **왜 별도 프로세스인가.** 임베딩은 GPU 를 쓴다. 웹 요청 안에서 하면 저장이 느려지고,
 * 게임 중에는 저장 자체가 실패한다. 그래서 웹은 `ai_job` 에 할 일만 적고 즉시 끝내고,
 * 이 프로세스가 한가할 때 가져간다.
 *
 * **게임 중에는 아무것도 하지 않는다.** 게이트웨이가 `AiBusyError({kind:"gaming"})` 를 던지고,
 * 여기서는 일을 큐에 되돌린 뒤 한동안 쉰다. 문서는 그대로 남아 있으니 나중에 색인하면 된다.
 *
 *   pnpm --filter @nyanotion/worker start      계속 돈다
 *   pnpm --filter @nyanotion/worker once       큐를 비우고 끝난다 (스크립트·점검용)
 */
import { AiBusyError, aiConfig, aiStatus } from "@nyanotion/ai";
import {
  claimJob,
  currentEnv,
  enqueueUnindexed,
  failJob,
  finishJob,
  loadEnv,
  pruneJobs,
  queueDepth,
  requeueJob,
  syncVectorColumn,
  type AiJobKind,
} from "@nyanotion/db";
import { indexDocument } from "./indexing.ts";
import { suggestForDocument } from "./suggest.ts";

loadEnv();

const ONCE = process.argv.includes("--once");
/** 할 일이 없을 때 쉬는 시간. 저장 뒤 20초 디바운스가 있으니 이보다 촘촘할 필요가 없다. */
const IDLE_MS = 5_000;
/** 게임 중이거나 모델에 닿지 못할 때 쉬는 시간. */
const BUSY_MS = 60_000;
const KINDS: readonly AiJobKind[] = ["index", "suggest"];

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function log(message: string): void {
  console.log(`[${stamp()}] ${message}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    log("멈춥니다 — 들고 있는 일을 마치고 끝냅니다.");
  });
}

/** 한 건 처리. 돌아온 값은 "일을 했는가" — 했으면 바로 다음 것을 집는다. */
async function step(): Promise<"did" | "idle" | "busy"> {
  const job = await claimJob(KINDS);
  if (job === null) return "idle";

  try {
    if (job.kind === "index") {
      const result = await indexDocument(job.documentId);
      log(
        result.empty
          ? `색인 ${job.documentId} — 비어 있음 (${result.removed}개 치움)`
          : `색인 ${job.documentId} — 토막 ${result.chunks} (새로 ${result.embedded} · 그대로 ${result.reused} · 치움 ${result.removed})`,
      );
    } else {
      const result = await suggestForDocument(job.documentId);
      log(`추천 ${job.documentId} — ${result.made ? "제안 남김" : `건너뜀 (${result.reason})`}`);
    }
    await finishJob(job.id);
    return "did";
  } catch (error) {
    if (error instanceof AiBusyError) {
      // 게임 중이거나 모델이 없다. **이 일의 잘못이 아니므로** 포기하지 않고 되돌린다.
      await requeueJob(job.id, BUSY_MS, error.message);
      log(`쉽니다 — ${error.message}`);
      return "busy";
    }
    const reason = error instanceof Error ? error.message : String(error);
    await failJob(job.id, reason);
    log(`실패 ${job.kind} ${job.documentId} — ${reason}`);
    return "did";
  }
}

async function main(): Promise<void> {
  const status = await aiStatus();
  const vector = await syncVectorColumn();
  log(
    `워커 시작 (${currentEnv()}) — 모델 ${aiConfig.embedModel} · GPU ${status.mode} · ` +
      `pgvector ${vector.extension ? "켜짐" : "꺼짐 (real[] 로 돕니다)"}`,
  );
  if (vector.backfilled > 0) log(`옛 임베딩 ${vector.backfilled}개를 벡터 칼럼으로 옮겼습니다.`);

  // 아직 색인하지 않은 문서를 깔아 둔다 — 첫 실행이면 이게 전부다.
  const seeded = await enqueueUnindexed();
  if (seeded > 0) log(`색인하지 않은 문서 ${seeded}개를 줄에 세웠습니다.`);
  const depth = await queueDepth();
  log(`큐 — 대기 ${depth.queued} · 도는 중 ${depth.running} · 실패 ${depth.failed}`);

  let sinceSweep = 0;
  while (!stopping) {
    const result = await step();
    if (result === "did") {
      sinceSweep += 1;
      continue;
    }
    if (ONCE) break;
    if (result === "busy") {
      await sleep(BUSY_MS);
      continue;
    }
    // 한가하다 — 가끔 치우고 새로 생긴 문서를 줍는다.
    if (sinceSweep > 0) {
      sinceSweep = 0;
      const gone = await pruneJobs();
      if (gone > 0) log(`끝난 일 ${gone}개 치웠습니다.`);
    }
    await enqueueUnindexed(50);
    await sleep(IDLE_MS);
  }

  const left = await queueDepth();
  log(`끝났습니다 — 대기 ${left.queued} · 실패 ${left.failed}`);
  process.exit(0);
}

await main();
