import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 저장소 루트의 .env 하나만 읽는다. apps/web·packages/db·drizzle-kit 이 모두 이걸 쓴다.
 * 이미 들어 있는 값(셸·Docker)은 덮어쓰지 않는다.
 */
let loaded = false;
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

export function required(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`환경 변수 ${name} 가 없습니다. 저장소 루트에 .env 를 두세요 (.env.example 참고).`);
  }
  return value;
}
