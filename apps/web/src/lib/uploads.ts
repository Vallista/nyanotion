import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 올린 파일이 있는 곳. 바이트는 DB 가 아니라 디스크에 둔다 —
 * 집 서버 한 대라서 굳이 오브젝트 스토리지를 끌어올 이유가 없다.
 *
 * 기본값은 `apps/web/.data/uploads` (git 무시). 다른 디스크에 두려면 UPLOAD_DIR 을 준다.
 */
export function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR;
  if (configured !== undefined && configured !== "") return configured;
  return path.join(process.cwd(), ".data", "uploads");
}

export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/** 파일 하나가 놓일 자리. id 는 cuid2 라 경로 조작이 끼어들 여지가 없지만 한 번 더 막는다. */
export function pathForAttachment(id: string): string {
  if (!/^[a-z0-9]{8,64}$/i.test(id)) throw new Error("파일 id 가 이상합니다");
  return path.join(uploadDir(), id);
}

/** 25MB. 집 회선으로 올리고 받는 것을 생각한 값. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * 받아 줄 종류. **허용 목록**이다 — 모르는 종류는 막는다.
 *
 * `image/svg+xml` 과 `text/html` 은 일부러 뺐다. 둘 다 스크립트를 품을 수 있어서,
 * 같은 오리진에서 그대로 열어 주면 로그인 쿠키를 들고 있는 브라우저에서 실행된다.
 */
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/zip",
  "application/json",
]);

export function isAllowedType(contentType: string): boolean {
  return ALLOWED.has(contentType.split(";")[0]?.trim().toLowerCase() ?? "");
}

/** 브라우저 안에서 바로 보여 줘도 되는 종류. 나머지는 내려받기로 넘긴다. */
export function canRenderInline(contentType: string): boolean {
  const kind = contentType.split("/")[0];
  return kind === "image" || kind === "video" || kind === "audio" || contentType === "application/pdf";
}

/** 헤더에 넣기 안전한 파일 이름. 줄바꿈·따옴표를 없애고 길이를 자른다. */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"\\]/g, "").trim();
  return cleaned === "" ? "file" : cleaned.slice(0, 120);
}
