import { loadEnv } from "@nyanotion/db";
import type { NextConfig } from "next";

// 저장소 루트의 .env 하나를 읽는다 (apps/web 안에 따로 두지 않는다).
loadEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nyanotion/db", "@nyanotion/shared", "@nyanotion/editor-schema"],
  // BlockNote 는 ESM 으로만 배포된다.
  experimental: { optimizePackageImports: ["@blocknote/core", "@blocknote/react", "@blocknote/ariakit"] },
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
