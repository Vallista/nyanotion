/**
 * 앱 아이콘을 만든다. 고양이 마크 하나에서 필요한 크기를 전부 낸다.
 *   pnpm --filter @nyanotion/web icons
 *
 * 색은 시안의 토큰 — 종이색 바탕에 차콜 선. 아이콘에서 새 색을 만들지 말 것.
 * maskable 은 iOS·안드로이드가 모서리를 잘라내므로 여백(안전 영역)을 더 준다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../public/icons");

const PAPER = "#faf9f7";
const INK = "#2f2e2b";

/** 고양이 마크. components/cat-mark.tsx 와 같은 path. */
const MARK = `
  <path d="M4.4 9.6V3.6l4.5 2.9"/>
  <path d="M19.6 9.6V3.6l-4.5 2.9"/>
  <path d="M4.4 9.6c0-.7 3.4-2.8 7.6-2.8s7.6 2.1 7.6 2.8c0 5.4-3.4 9.4-7.6 9.4s-7.6-4-7.6-9.4z"/>
  <path d="M9.2 12.3v.9M14.8 12.3v.9"/>
  <path d="M10.9 15.4c.7.7 1.5.7 2.2 0"/>
`;

/**
 * @param size 한 변 픽셀
 * @param inset 마크가 차지하는 비율 (maskable 은 작게)
 * @param rounded 모서리를 둥글릴지 (일반 아이콘만)
 */
function svg(size, inset, rounded) {
  const markSize = size * inset;
  const offset = (size - markSize) / 2;
  const scale = markSize / 24;
  const radius = rounded ? Math.round(size * 0.18) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${PAPER}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})"
     fill="none" stroke="${INK}" stroke-width="1.15"
     stroke-linecap="round" stroke-linejoin="round">${MARK}</g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, inset: 0.62, rounded: true },
  { file: "icon-512.png", size: 512, inset: 0.62, rounded: true },
  // maskable: 바깥 20% 가 잘릴 수 있으니 마크를 더 작게 둔다
  { file: "icon-192-maskable.png", size: 192, inset: 0.46, rounded: false },
  { file: "icon-512-maskable.png", size: 512, inset: 0.46, rounded: false },
  // iOS 홈 화면. iOS 가 알아서 모서리를 깎으므로 사각형으로 낸다
  { file: "apple-touch-icon.png", size: 180, inset: 0.6, rounded: false },
  { file: "favicon-32.png", size: 32, inset: 0.78, rounded: false },
];

await mkdir(outDir, { recursive: true });

for (const { file, size, inset, rounded } of targets) {
  const png = await sharp(Buffer.from(svg(size, inset, rounded))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(resolve(outDir, file), png);
  console.log(`${file}  ${size}x${size}  ${(png.byteLength / 1024).toFixed(1)} kB`);
}

// 벡터도 하나 남긴다 — 매니페스트가 쓸 수 있고, 다시 그릴 때의 원본이다.
await writeFile(resolve(outDir, "icon.svg"), svg(512, 0.62, true));
console.log("icon.svg");
