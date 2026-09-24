/**
 * 첫 문서 하나를 만든다. 빈 앱을 열었을 때 뭘 할 수 있는지 보이게 하려는 목적.
 *   pnpm --filter @nyanotion/db seed
 * 이미 문서가 있으면 아무것도 하지 않는다.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import { createDocument, listTree, setContent } from "../src/queries/documents.ts";
import { space, user } from "../src/schema/index.ts";

type Inline = { type: "text"; text: string; styles: Record<string, never> };
type Block = {
  id: string;
  type: string;
  props: Record<string, string | number | boolean>;
  content: Inline[];
  children: Block[];
};

const baseProps = { textColor: "default", backgroundColor: "default", textAlignment: "left" };

function block(type: string, text: string, extra: Record<string, string | number | boolean> = {}): Block {
  return {
    id: newId().slice(0, 12),
    type,
    props: { ...baseProps, ...extra },
    content: text === "" ? [] : [{ type: "text", text, styles: {} }],
    children: [],
  };
}

const welcome: Block[] = [
  block("paragraph", "여기에 적은 것은 이 집 서버에만 남습니다. 밖으로 나가지 않아요."),
  block("heading", "할 수 있는 것", { level: 2 }),
  block("bulletListItem", "왼쪽 + 로 문서를 만들고, 문서를 끌어서 다른 문서 안에 넣어 묶습니다"),
  block("bulletListItem", "제목을 두 번 누르면 사이드바에서 바로 이름을 바꿉니다"),
  block("bulletListItem", "/ 를 치면 제목·목록·인용 같은 블록 메뉴가 열립니다"),
  block("bulletListItem", "버린 문서는 모래상자에 남고, 되돌리면 하위 문서까지 함께 살아납니다"),
  block("heading", "아직 없는 것", { level: 2 }),
  block("checkListItem", "폰에서 오프라인으로 쓰고 나중에 합치기 (M2)", { checked: false }),
  block("checkListItem", "태그와 검색 (M3)", { checked: false }),
  block("checkListItem", "가족 초대와 문서 공유 (M4)", { checked: false }),
  block("checkListItem", "냥이 — 요약·이어쓰기·문서에 질문하기 (M5~M6)", { checked: false }),
  block("paragraph", ""),
  block("paragraph", "이 문서는 지워도 됩니다."),
];

async function main(): Promise<void> {
  const users = await db.select({ id: user.id }).from(user).limit(1);
  const owner = users[0];
  if (owner === undefined) throw new Error("계정이 없습니다. 먼저 첫 가입을 하세요.");

  const spaces = await db
    .select({ id: space.id })
    .from(space)
    .where(and(eq(space.kind, "personal"), eq(space.ownerUserId, owner.id)))
    .limit(1);
  const mySpace = spaces[0];
  if (mySpace === undefined) throw new Error("개인 space 가 없습니다.");

  const existing = await listTree(mySpace.id);
  if (existing.length > 0) {
    console.log(`문서가 이미 ${existing.length}개 있습니다 — 아무것도 하지 않습니다.`);
    return;
  }

  const id = await createDocument({
    spaceId: mySpace.id,
    userId: owner.id,
    title: "Nyanotion 시작하기",
  });
  await setContent(id, mySpace.id, welcome, owner.id);
  console.log(`만들었습니다: /d/${id}`);
}

await main();
process.exit(0);
