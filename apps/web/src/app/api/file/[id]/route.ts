import { readFile } from "node:fs/promises";
import { canRead } from "@nyanotion/auth";
import { documentIsPubliclyShared, getAttachment } from "@nyanotion/db";
import { NextResponse } from "next/server";
import { optionalViewer } from "@/lib/session";
import { canRenderInline, pathForAttachment, safeFilename } from "@/lib/uploads";

/**
 * 올린 파일을 내준다.
 *
 * **id 를 안다고 내주지 않는다.** 붙어 있는 문서를 읽을 수 있어야 한다 — 로그인해서 권한이 있거나,
 * 그 문서가 지금 공개 링크로 열려 있거나. 없으면 404 다 (403 을 쓰면 "그 파일은 있다"를 알려 준다).
 *
 * 종류는 **올릴 때 확인해 둔 값만** 쓰고 nosniff 를 붙인다. 브라우저가 내용을 보고 종류를
 * 다시 추측하면 허용 목록이 소용없어진다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const row = await getAttachment(id);
  if (row === null) return new NextResponse("찾을 수 없습니다", { status: 404 });

  const viewer = await optionalViewer();
  const allowed =
    viewer !== null
      ? await canRead(viewer.userId, row.documentId)
      : await documentIsPubliclyShared(row.documentId);
  if (!allowed) return new NextResponse("찾을 수 없습니다", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(pathForAttachment(row.id));
  } catch {
    // 줄은 있는데 파일이 없다 — 디스크가 갈렸거나 손으로 지웠다.
    return new NextResponse("파일이 사라졌습니다", { status: 410 });
  }

  const inline = canRenderInline(row.contentType);
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(
    safeFilename(row.filename),
  )}`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": row.contentType,
      "content-length": String(bytes.byteLength),
      "content-disposition": disposition,
      "x-content-type-options": "nosniff",
      // 파일은 한 번 올라가면 바뀌지 않는다(새로 올리면 새 id). 다만 권한이 걸리므로 private.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
