import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { attachment } from "../schema/attachment";
import { publicLink } from "../schema/sharing";

export type AttachmentRow = {
  id: string;
  documentId: string;
  filename: string;
  contentType: string;
  size: number;
};

/** 올린 파일 한 줄을 남기고 id 를 돌려준다. 바이트 저장은 부르는 쪽 몫이다. */
export async function createAttachment(input: {
  documentId: string;
  uploadedBy: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<string> {
  const id = newId();
  await db.insert(attachment).values({ id, ...input });
  return id;
}

export async function getAttachment(id: string): Promise<AttachmentRow | null> {
  const rows = await db
    .select({
      id: attachment.id,
      documentId: attachment.documentId,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
    })
    .from(attachment)
    .where(eq(attachment.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * 이 문서가 **지금** 공개 링크로 열려 있는가. 로그인하지 않은 사람에게 그림을 내줄지 판단할 때만 쓴다.
 *
 * 공개 링크는 이미 본문을 통째로 보여 주므로, 같은 문서에 붙은 그림을 막는 것은 의미가 없다.
 * 다만 비밀번호가 걸린 링크는 예외로 둔다 — 그건 본문도 막혀 있다.
 */
export async function documentIsPubliclyShared(documentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: publicLink.id })
    .from(publicLink)
    .where(
      and(
        eq(publicLink.documentId, documentId),
        isNull(publicLink.passwordHash),
        or(isNull(publicLink.expiresAt), gt(publicLink.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
