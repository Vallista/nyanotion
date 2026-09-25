import type { MetadataRoute } from "next";

/**
 * 홈 화면에 추가했을 때의 모습. iOS 는 이 파일이 제대로 있어야 "홈 화면에 추가"를 앱처럼 다룬다.
 * 아이콘은 `pnpm --filter @nyanotion/web icons` 가 만든다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nyanotion",
    short_name: "Nyanotion",
    description: "가족 문서 서버",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    lang: "ko",
    dir: "ltr",
    categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
