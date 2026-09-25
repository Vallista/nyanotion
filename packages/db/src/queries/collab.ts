import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { document, space } from "../schema/index";

/**
 * Hocuspocus(apps/collab) 가 쓰는 질의. WebSocket 은 Next 의 세션 미들웨어를 거치지 않으므로
 * 표(packages/shared/src/ticket.ts)로 인증하고, 소유권은 여기서 다시 확인한다.
 */

export type CollabDocument = {
  id: string;
  spaceId: string;
  title: string;
  contentJson: unknown;
  ydocState: Uint8Array | null;
};

/**
 * 이 사용자가 열 수 있는 문서인가. 열 수 없으면 null —
 * 존재 여부를 알려주지 않기 위해 "없음"과 "권한 없음"을 구분하지 않는다.
 *
 * M2 에서는 개인 space 소유자만. **M4 에서 이 함수가 access.ts 를 부르게 된다.**
 */
export async function documentForCollab(
  documentId: string,
  userId: string,
): Promise<CollabDocument | null> {
  const rows = await db
    .select({
      id: document.id,
      spaceId: document.spaceId,
      title: document.title,
      contentJson: document.contentJson,
      ydocState: document.ydocState,
    })
    .from(document)
    .innerJoin(space, eq(space.id, document.spaceId))
    .where(
      and(
        eq(document.id, documentId),
        eq(space.kind, "personal"),
        eq(space.ownerUserId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

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
