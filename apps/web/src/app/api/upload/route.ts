import { writeFile } from "node:fs/promises";
import { createAttachment } from "@nyanotion/db";
import { NextResponse } from "next/server";
import { assertCanWrite } from "@/lib/session";
import { take } from "@/lib/rate-limit";
import {
  MAX_UPLOAD_BYTES,
  ensureUploadDir,
  isAllowedType,
  pathForAttachment,
  safeFilename,
} from "@/lib/uploads";

/**
 * 에디터의 그림·파일 블록이 쓰는 문 하나.
 *
 * 권한은 **문서 기준**이다 — 고칠 수 있는 문서에만 올릴 수 있다. 그래서 documentId 를 같이 받는다.
 * 종류는 허용 목록으로 막고(uploads.ts), 크기는 25MB 까지.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "폼을 읽지 못했습니다" }, { status: 400 });
  }

  const documentId = form.get("documentId");
  const file = form.get("file");
  if (typeof documentId !== "string" || documentId === "") {
    return NextResponse.json({ error: "documentId 가 필요합니다" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file 이 필요합니다" }, { status: 400 });
  }

  // 권한이 없으면 여기서 끝 — 파일을 받아 보지도 않는다.
  const viewer = await assertCanWrite(documentId);

  // 파일 하나하나는 25MB 로 막혀 있지만, 빠르게 되풀이하면 디스크가 찬다.
  const verdict = take("upload", viewer.userId);
  if (!verdict.ok) {
    return NextResponse.json(
      {
        error: `파일을 너무 자주 올렸습니다. ${verdict.retryAfterSeconds}초 뒤에 다시 해 주세요.`,
        retryAfter: verdict.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `파일이 너무 큽니다 (최대 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)` },
      { status: 413 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "빈 파일입니다" }, { status: 400 });
  }
  const contentType = file.type === "" ? "application/octet-stream" : file.type;
  if (!isAllowedType(contentType)) {
    return NextResponse.json({ error: `넣을 수 없는 종류입니다 (${contentType})` }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // 실제로 읽은 크기도 확인한다 — 알려 준 size 를 믿지 않는다.
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다" }, { status: 413 });
  }

  // 먼저 줄을 만들고(=id 를 얻고) 그 이름으로 디스크에 쓴다.
  const id = await createAttachment({
    documentId,
    uploadedBy: viewer.userId,
    filename: safeFilename(file.name),
    contentType: contentType.split(";")[0]?.trim().toLowerCase() ?? contentType,
    size: bytes.byteLength,
  });

  await ensureUploadDir();
  await writeFile(pathForAttachment(id), bytes);

  return NextResponse.json({ id, url: `/api/file/${id}` }, { headers: { "cache-control": "no-store" } });
}
