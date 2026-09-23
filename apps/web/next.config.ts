import { loadEnv } from "@nyanotion/db";
import type { NextConfig } from "next";

// 저장소 루트의 .env 하나를 읽는다 (apps/web 안에 따로 두지 않는다).
loadEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nyanotion/db", "@nyanotion/shared"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
