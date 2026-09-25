import { eq } from "drizzle-orm";
import { db } from "../client";
import { document } from "../schema/index";

/**
 * Hocuspocus(apps/collab) 가 쓰는 질의.
 * **권한 판정은 여기가 아니라 `packages/auth/access.ts` 가 한다** — 이 파일은 저장만 맡는다.
 */

/**
 * Yjs 상태를 원본으로 저장하고, 같은 트랜잭션에서 파생값을 갱신한다.
 * 파생값(`content_json`·`text_plain`)이 있어야 검색·렌더·LLM 이 CRDT 를 몰라도 된다.
 */
export async function saveYdoc(input: {
  documentId: string;
  ydocState: Uint8Array;
  contentJson: unknown;
  textPlain: string;
  title: string;
  userId: string;
}): Promise<void> {
  await db
    .update(document)
    .set({
      ydocState: input.ydocState,
      contentJson: input.contentJson,
      textPlain: input.textPlain,
      title: input.title,
      updatedBy: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(document.id, input.documentId));
}
