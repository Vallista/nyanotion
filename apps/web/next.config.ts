import { loadEnv } from "@nyanotion/db";
import type { NextConfig } from "next";

// 저장소 루트의 .env 하나를 읽는다 (apps/web 안에 따로 두지 않는다).
loadEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * 환경마다 **다른 출력 폴더**를 쓴다.
   *
   * 기본값 하나를 같이 쓰면 `next build` 가 돌고 있는 `next dev` 의 상태를 지워 버려서
   * 그때부터 모든 요청이 500 이 된다 (실제로 겪었다). 베타를 빌드하는 동안 운영이 죽는 것도
   * 같은 이유다. scripts/run.ps1 이 NEXT_DIST_DIR 을 넣어 준다.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: [
    "@nyanotion/db",
    "@nyanotion/shared",
    "@nyanotion/editor-schema",
    "@nyanotion/editor",
  ],
  // BlockNote 는 ESM 으로만 배포된다.
  experimental: { optimizePackageImports: ["@blocknote/core", "@blocknote/react", "@blocknote/ariakit"] },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
