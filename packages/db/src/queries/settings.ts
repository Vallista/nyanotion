import { eq } from "drizzle-orm";
import { db } from "../client";
import { serverSetting } from "../schema/index";

/** 서버 설정 한 줄 읽기. 없으면 기본값. */
export async function getSetting(key: string, fallback: string): Promise<string> {
  const rows = await db
    .select({ value: serverSetting.value })
    .from(serverSetting)
    .where(eq(serverSetting.key, key))
    .limit(1);
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(serverSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: serverSetting.key, set: { value, updatedAt: new Date() } });
}

/** GPU 를 게임이 쓰고 있는가. `free` 면 AI 가 돌고, `gaming` 이면 큐에 쌓인다. */
export const GPU_MODE_KEY = "gpu.mode";
export type GpuMode = "free" | "gaming";

export async function getGpuMode(): Promise<GpuMode> {
  return (await getSetting(GPU_MODE_KEY, "free")) === "gaming" ? "gaming" : "free";
}

export async function setGpuMode(mode: GpuMode): Promise<void> {
  await setSetting(GPU_MODE_KEY, mode);
}
