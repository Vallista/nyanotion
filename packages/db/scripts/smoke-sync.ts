/**
 * 동기화 점검 — 폴더 · 변경 번호 · 나중에 고친 쪽이 이김 · 지운 표시 · 토큰.
 *   pnpm --filter @nyanotion/db smoke:sync
 *
 * 잠깐 계정 하나와 체크리스트 둘을 만들고 끝나면 치운다.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  userByApiToken,
} from "../src/queries/api-tokens.ts";
import {
  addChecklistItem,
  addFolder,
  applyChanges,
  createChecklist,
  deleteFolder,
  listChecklistItems,
  listFolders,
  removeChecklistItem,
  renameFolder,
  setChecklistItemDone,
  syncChanges,
  updateChecklistItem,
} from "../src/queries/checklists.ts";
import { document, space, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const made = { users: [] as string[], spaces: [] as string[] };
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function main(): Promise<void> {
  const userId = newId();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: "SYNCSMOKE",
    email: `syncsmoke-${userId.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(userId);
  const spaceId = newId();
  await db.insert(space).values({ id: spaceId, kind: "personal", ownerUserId: userId, name: "SYNCSMOKE" });
  made.spaces.push(spaceId);

  const list = await createChecklist({ spaceId, userId, title: "SYNCSMOKE 할 일" });
  const other = await createChecklist({ spaceId, userId, title: "SYNCSMOKE 다른 것" });

  console.log("폴더");
  const work = await addFolder(list.id, { name: "회사" });
  const sub = await addFolder(list.id, { name: "회의", parentId: work });
  check("만든다", (await listFolders(list.id)).length === 2);
  let dupe = false;
  try {
    await addFolder(list.id, { name: "회사" });
  } catch {
    dupe = true;
  }
  check("같은 자리 같은 이름은 안 된다", dupe);
  let foreign = false;
  try {
    await addFolder(other.id, { name: "x", parentId: work });
  } catch {
    foreign = true;
  }
  check("**다른 체크리스트의 폴더 아래에는 못 만든다**", foreign);

  const inSub = await addChecklistItem(list.id, userId, { title: "안건 정리", folderId: sub });
  const loose = await addChecklistItem(list.id, userId, { title: "우유" });

  console.log("\n변경 번호");
  const first = await syncChanges(list.id, 0);
  check("처음엔 전부 온다", first.folders.length === 2 && first.items.length === 2, first);
  check("**다른 체크리스트 것은 안 온다**", (await syncChanges(other.id, 0)).items.length === 0);
  const c1 = first.cursor;
  check("커서 다음엔 아무것도 없다", (await syncChanges(list.id, c1)).items.length === 0);
  await updateChecklistItem(loose, { title: "우유 2개" });
  const after = await syncChanges(list.id, c1);
  check("고친 것만 온다", after.items.length === 1 && after.items[0]?.title === "우유 2개", after.items);
  const c2 = after.cursor;
  await setChecklistItemDone(loose, true, userId);
  check("체크도 번호를 받는다", (await syncChanges(list.id, c2)).items[0]?.done === true);

  console.log("\n지운 표시");
  const c3 = (await syncChanges(list.id, 0)).cursor;
  await removeChecklistItem(loose);
  const del = await syncChanges(list.id, c3);
  check("**지운 것도 '지웠다'로 온다**", del.items.some((i) => i.id === loose && i.deleted), del.items);
  check("목록에서는 빠진다", !(await listChecklistItems(list.id)).some((i) => i.id === loose));

  console.log("\n폴더 지우기 — 안의 것은 위로");
  const c4 = (await syncChanges(list.id, 0)).cursor;
  await deleteFolder(sub);
  const moved = (await listChecklistItems(list.id)).find((i) => i.id === inSub);
  check("항목은 위 폴더로 올라간다", moved?.folderId === work, moved?.folderId);
  const fdel = await syncChanges(list.id, c4);
  check("지운 폴더와 옮겨진 항목이 같이 온다", fdel.folders.some((f) => f.id === sub && f.deleted) && fdel.items.some((i) => i.id === inSub));
  await renameFolder(work, "회사 일");
  check("이름 바꾸기", (await listFolders(list.id)).find((f) => f.id === work)?.name === "회사 일");

  console.log("\n받기 — Bento 에서 온 것");
  const bentoId = "t_1700000000000_abc123";
  const r1 = await applyChanges(list.id, userId, {
    folders: [{ id: "f-bento-1", name: "집안일", updatedAt: iso() }],
    items: [
      {
        id: bentoId,
        title: "분리수거",
        dueOn: "2026-10-20",
        dueTime: "08:00",
        startAt: "2026-10-20T08:00:00",
        estMin: 15,
        tags: ["집"],
        groupName: "생활",
        notes: "토요일 아침",
        subtasks: [{ id: "s1", title: "캔", done: false }],
        folderId: "f-bento-1",
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: iso(),
      },
    ],
  });
  check("받아 들인다", r1.applied === 2 && r1.rejected.length === 0, r1);
  const got = (await listChecklistItems(list.id)).find((i) => i.id === bentoId);
  check("**Bento 의 id 를 그대로 쓴다**", got !== undefined);
  check("폴더·메모·하위 항목이 들어간다", got?.folderId === "f-bento-1" && got?.notes === "토요일 아침" && got?.subtasks.length === 1, got);
  const round = (await syncChanges(list.id, 0)).items.find((i) => i.id === bentoId);
  check("돌려줄 때 Bento 필드가 그대로", round?.startAt === "2026-10-20T08:00:00" && round?.estMin === 15 && round?.groupName === "생활" && round?.tags[0] === "집", round);

  console.log("\n나중에 고친 쪽이 이긴다");
  const old = await applyChanges(list.id, userId, {
    items: [{ id: bentoId, title: "옛날 제목", updatedAt: "2020-01-01T00:00:00Z" }],
  });
  check("**옛 시각의 수정은 버린다**", old.stale.includes(bentoId) && old.applied === 0, old);
  check("서버 것이 남는다", (await listChecklistItems(list.id)).find((i) => i.id === bentoId)?.title === "분리수거");
  check("**버려진 것의 지금 서버 값을 같이 돌려준다**", old.current.items[0]?.id === bentoId && old.current.items[0]?.title === "분리수거", old.current);
  await applyChanges(list.id, userId, {
    items: [{ id: bentoId, title: "미래 제목", updatedAt: iso(10 * 365 * 86_400_000) }],
  });
  const fut = await applyChanges(list.id, userId, {
    items: [{ id: bentoId, title: "지금 제목", updatedAt: iso(1000) }],
  });
  check("**미래 시각은 지금으로 깎는다** — 시계가 앞선 기기가 영원히 이기지 않게", fut.applied === 1, fut);
  const done = await applyChanges(list.id, userId, { items: [{ id: bentoId, done: true, updatedAt: iso(2000) }] });
  check("체크도 받는다", done.applied === 1 && (await listChecklistItems(list.id)).find((i) => i.id === bentoId)?.done === true);
  const gone = await applyChanges(list.id, userId, { items: [{ id: bentoId, deleted: true, updatedAt: iso(3000) }] });
  check("지우기도 받는다", gone.applied === 1 && !(await listChecklistItems(list.id)).some((i) => i.id === bentoId));

  console.log("\n이상한 것은 안 받는다");
  const bad = await applyChanges(list.id, userId, {
    items: [
      { id: "has space", title: "x", updatedAt: iso() },
      { id: "ok-1", title: "", updatedAt: iso() },
      { id: "ok-2", title: "x", dueOn: "10/20", updatedAt: iso() },
      { id: "ok-3", title: "x", updatedAt: "어제" },
    ],
  });
  check("id · 빈 제목 · 날짜 모양 · 시각 모양", bad.rejected.length === 4 && bad.applied === 0, bad);
  const stolen = await applyChanges(other.id, userId, { items: [{ id: inSub, title: "가로채기", updatedAt: iso(9000) }] });
  check("**다른 체크리스트의 항목 id 로는 못 덮는다**", stolen.rejected[0]?.reason === "other-checklist", stolen);

  console.log("\n토큰");
  const { id: tokenId, token } = await createApiToken(userId, "맥북 Bento");
  check("nyt_ 로 시작한다", token.startsWith("nyt_") && token.length > 40);
  check("토큰으로 그 사람을 찾는다", (await userByApiToken(token))?.userId === userId);
  check("틀린 토큰은 null", (await userByApiToken(`${token}x`)) === null && (await userByApiToken("abc")) === null);
  const listed = await listApiTokens(userId);
  check("목록에는 앞 몇 글자만", listed.length === 1 && listed[0]?.prefix === token.slice(0, 10) && !JSON.stringify(listed).includes(token));
  check("남의 토큰은 못 끊는다", !(await revokeApiToken(newId(), tokenId)));
  check("끊는다", await revokeApiToken(userId, tokenId));
  check("**끊은 토큰은 안 된다**", (await userByApiToken(token)) === null);
  const { token: t2 } = await createApiToken(userId, "다시");
  await db.update(user).set({ disabledAt: new Date() }).where(eq(user.id, userId));
  check("**막힌 계정의 토큰은 안 된다**", (await userByApiToken(t2)) === null);
}

async function cleanup(): Promise<void> {
  if (made.spaces.length > 0) {
    await db.delete(document).where(inArray(document.spaceId, made.spaces));
    await db.delete(space).where(inArray(space.id, made.spaces));
  }
  if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
