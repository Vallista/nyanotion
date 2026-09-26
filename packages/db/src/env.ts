import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 환경 설정을 겹겹이 읽는다.
 *
 * 이 집 서버는 한 대에서 **운영(prod)과 베타(beta)** 를 같이 돌린다. 둘은 DB·포트·도메인이
 * 다르고, 같은 코드가 `NYANOTION_ENV` 하나로 갈린다. 마이그레이션은 베타에서 먼저 돌려 보고
 * 운영에 적용한다 — 가족 문서에 처음 돌려 보는 일이 없게.
 *
 * 읽는 차례 (먼저 잡힌 값이 이긴다 — dotenv 는 이미 있는 키를 덮지 않는다):
 *
 *   1. 셸 환경 변수                       — 서비스·CI 가 넣어 준 값
 *   2. $NYANOTION_SECRETS_DIR/<env>.env   — **비밀값. 저장소 밖에 둔다.**
 *   3. <저장소>/.env.<env>                 — 그 환경의 설정 (포트·도메인 등, git 무시)
 *   4. <저장소>/.env                       — 공통 기본값 (git 무시)
 *
 * 저장소를 공개해도 비밀값이 새지 않는 이유가 2번이다. `.env*` 는 전부 git 무시지만,
 * 실수로 `git add -f` 하는 일까지 막으려면 비밀값은 애초에 저장소 밖에 있어야 한다.
 */

export const ENVIRONMENTS = ["dev", "beta", "prod"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

/** 지금 어느 환경인가. 못 알아보는 값이면 가장 안전한 쪽(dev)으로 본다. */
export function currentEnv(): Environment {
  const raw = process.env.NYANOTION_ENV;
  return (ENVIRONMENTS as readonly string[]).includes(raw ?? "") ? (raw as Environment) : "dev";
}

/** 저장소 루트. 이 파일에서 위로 올라가며 pnpm-workspace.yaml 을 찾는다. */
function repoRoot(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const env = currentEnv();
  const root = repoRoot();

  const secretsDir = process.env.NYANOTION_SECRETS_DIR;
  const candidates: string[] = [];

  if (secretsDir !== undefined && secretsDir !== "") {
    const base = isAbsolute(secretsDir) ? secretsDir : resolve(root ?? process.cwd(), secretsDir);
    candidates.push(resolve(base, `${env}.env`));
  }
  if (root !== null) {
    candidates.push(resolve(root, `.env.${env}`));
    candidates.push(resolve(root, ".env"));
  }

  for (const path of candidates) {
    if (existsSync(path)) config({ path });
  }
}

export function required(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `환경 변수 ${name} 가 없습니다 (NYANOTION_ENV=${currentEnv()}). ` +
        `저장소 루트의 .env 나 비밀값 폴더를 확인하세요 — .env.example 참고.`,
    );
  }
  return value;
}

/** 있으면 쓰고 없으면 기본값. 포트처럼 환경마다 다른 값에 쓴다. */
export function optional(name: string, fallback: string): string {
  loadEnv();
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}
