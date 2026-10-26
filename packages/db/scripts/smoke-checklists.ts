/**
 * 체크리스트 점검 — 만들기 · 일정 · 반복 · 구매 연결 · 알림 · **남의 것은 안 보인다.**
 *   pnpm --filter @nyanotion/db smoke:checklists
 *
 * 두 사람(A·B)을 잠깐 만들고 끝나면 치운다. 실제 계정·문서는 건드리지 않는다.
 */
import { addDays, homeNow, nextDueOn, projectRepeats, startOfWeek, visibleRange } from "@nyanotion/shared";
import { eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import {
  addChecklistItem,
  agenda,
  calendarItems,
  checklistOfDocument,
  completeItemsForPurchase,
  createChecklist,
  documentOfChecklist,
  dueCount,
  dueReminders,
  linkPurchase,
  listChecklistItems,
  listChecklists,
  markReminded,
  openItems,
  primaryChecklist,
  ownerOfChecklistItem,
  setChecklistItemDone,
  updateChecklistItem,
} from "../src/queries/checklists.ts";
import { createDocument } from "../src/queries/documents.ts";
import { createItem } from "../src/queries/purchases.ts";
import { checklistItem, document, space, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TAG = "CHKSMOKE";
const made = { users: [] as string[], spaces: [] as string[] };

async function makeUser(label: string): Promise<{ userId: string; spaceId: string }> {
  const userId = newId();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: `${TAG} ${label}`,
    email: `${TAG.toLowerCase()}-${label}-${userId.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(userId);
  const spaceId = newId();
  await db.insert(space).values({
    id: spaceId,
    kind: "personal",
    ownerUserId: userId,
    name: `${TAG} ${label} 내 문서`,
  });
  made.spaces.push(spaceId);
  return { userId, spaceId };
}

async function main(): Promise<void> {
  console.log("날짜 규칙");
  check("매달 31일 → 2월 28일", nextDueOn("2026-01-31", "monthly", 31) === "2026-02-28");
  check("**2월 28일에서 원래 날(31)로 3월 31일**", nextDueOn("2026-02-28", "monthly", 31) === "2026-03-31");
  check("12월 → 다음 해 1월", nextDueOn("2026-12-15", "monthly") === "2027-01-15");
  check("매주는 7일 뒤", nextDueOn("2026-10-12", "weekly") === "2026-10-19");
  check("반복 없으면 null", nextDueOn("2026-10-12", "none") === null);
  check("평일 — 금요일 다음은 월요일", nextDueOn("2026-10-16", "weekdays") === "2026-10-19");
  check("평일 — 토요일 다음도 월요일", nextDueOn("2026-10-17", "weekdays") === "2026-10-19");
  check("평일 — 화요일 다음은 수요일", nextDueOn("2026-10-20", "weekdays") === "2026-10-21");
  check("매년 — 같은 달 같은 날", nextDueOn("2026-05-08", "yearly") === "2027-05-08");
  check("매년 — 2월 29일은 없는 해에 28일", nextDueOn("2028-02-29", "yearly", 29) === "2029-02-28");
  check("**매년 — 원래 날(29)로 돌아간다**", nextDueOn("2031-02-28", "yearly", 29) === "2032-02-29");
  check(
    "캘린더가 그리는 앞날 — 지금 줄 빼고 범위 안만",
    projectRepeats("2026-10-06", "weekly", "2026-10-11", "2026-10-31").join() === "2026-10-13,2026-10-20,2026-10-27",
  );
  check("주는 일요일에 시작한다", startOfWeek("2026-10-21") === "2026-10-18");
  check("달 보기는 6주", visibleRange("month", "2026-10-20").from === "2026-09-27" && visibleRange("month", "2026-10-20").to === "2026-11-07");

  console.log("\n칼럼");
  const collation = await db.execute(
    sql`select collation_name from information_schema.columns where table_name = 'checklist_item' and column_name = 'position'`,
  );
  check(
    'position 이 COLLATE "C" 다',
    (collation as unknown as { collation_name: string }[])[0]?.collation_name === "C",
    collation,
  );

  const a = await makeUser("a");
  const b = await makeUser("b");
  const today = homeNow().day;

  console.log("\n만들기");
  const list = await createChecklist({ spaceId: a.spaceId, userId: a.userId, title: `${TAG} 장보기` });
  check("문서가 같이 생긴다", (await documentOfChecklist(list.id)) === list.documentId);
  check("문서에서 체크리스트를 찾는다", (await checklistOfDocument(list.documentId)) === list.id);

  const milk = await addChecklistItem(list.id, a.userId, { title: "우유" });
  const call = await addChecklistItem(list.id, a.userId, {
    title: "병원 예약",
    dueOn: today,
    dueTime: "00:00",
  });
  const rent = await addChecklistItem(list.id, a.userId, {
    title: "관리비",
    dueOn: "2026-01-31",
    repeat: "monthly",
  });
  const noDayTime = await addChecklistItem(list.id, a.userId, {
    title: "날짜 없는 시간",
    dueTime: "10:00",
    repeat: "daily",
  });

  const items = await listChecklistItems(list.id);
  check("항목 넷", items.length === 4, items.length);
  check("적은 순서대로", items.map((i) => i.id).join() === [milk, call, rent, noDayTime].join());
  const orphan = items.find((i) => i.id === noDayTime);
  check("날짜 없으면 시간·반복은 버린다", orphan?.dueTime === null && orphan?.repeat === "none", orphan);

  console.log("\n목록과 일정 — 남의 것은 안 보인다");
  const mine = await listChecklists([a.spaceId]);
  const found = mine.find((row) => row.id === list.id);
  check("A 목록에 있다", found !== undefined);
  check("남은 수 4 · 한 것 0", found?.open === 4 && found?.done === 0, found);
  check("**B 목록에는 없다**", !(await listChecklists([b.spaceId])).some((row) => row.id === list.id));

  const week = await agenda([a.spaceId], addDays(today, 7));
  check("A 일정에 오늘 일과 지난 관리비", week.some((r) => r.id === call) && week.some((r) => r.id === rent));
  check("날짜 없는 항목은 일정에 없다", !week.some((r) => r.id === milk));
  check("**B 일정에는 없다**", (await agenda([b.spaceId], addDays(today, 7))).length === 0);
  check("오늘까지 할 일 2", (await dueCount([a.spaceId], today)) === 2);
  check("B 는 0", (await dueCount([b.spaceId], today)) === 0);
  const open = await openItems([a.spaceId]);
  check("첫 화면 목록에 안 한 것 넷 (날짜 없는 것까지)", open.length === 4, open.length);
  check("날짜 있는 것이 먼저, 이른 순", open[0]?.id === rent && open[1]?.id === call, open.map((r) => r.title));
  check("**B 첫 화면에는 없다**", (await openItems([b.spaceId])).length === 0);
  check("기본 체크리스트는 가장 먼저 만든 것", (await primaryChecklist(a.spaceId))?.id === list.id);
  check("체크리스트가 없는 공간은 null", (await primaryChecklist(b.spaceId)) === null);
  check("항목 → 문서를 찾는다 (권한 판정용)", (await ownerOfChecklistItem(milk))?.documentId === list.documentId);

  console.log("\n체크와 반복");
  const next = await setChecklistItemDone(rent, true, a.userId);
  check("반복 항목을 체크하면 다음 줄이 생긴다", next !== null);
  const after = await listChecklistItems(list.id);
  const nextRow = after.find((i) => i.id === next);
  check("다음 날짜 2026-02-28", nextRow?.dueOn === "2026-02-28", nextRow?.dueOn);
  check("체크한 줄은 남고 한 사람이 적힌다", after.find((i) => i.id === rent)?.doneBy === a.userId);
  check("**두 번 체크해도 다음 줄이 또 생기지 않는다**", (await setChecklistItemDone(rent, true, a.userId)) === null);
  const third = await setChecklistItemDone(next!, true, a.userId);
  const thirdRow = (await listChecklistItems(list.id)).find((i) => i.id === third);
  check("**그다음은 원래 날로 2026-03-31**", thirdRow?.dueOn === "2026-03-31", thirdRow?.dueOn);
  check("풀면 한 사람이 지워진다", (await setChecklistItemDone(rent, false, a.userId)) === null);
  check(
    "푼 줄은 doneBy 가 없다",
    (await listChecklistItems(list.id)).find((i) => i.id === rent)?.doneBy === null,
  );

  console.log("\n캘린더 — 시간 칸에 놓은 할 일");
  const trash = await addChecklistItem(list.id, a.userId, {
    title: "분리수거",
    dueOn: today,
    dueTime: "14:00",
    estMin: 90,
    repeat: "weekly",
  });
  const range = await calendarItems([a.spaceId], today, addDays(today, 20));
  const placed = range.find((r) => r.id === trash);
  check("범위 안 할 일이 시간·길이와 함께 나온다", placed?.dueTime === "14:00" && placed?.estMin === 90, placed);
  check("범위 앞이어도 안 한 반복 할 일은 나온다 (앞날을 그려야 하므로)", range.some((r) => r.id === third));
  check("범위 앞의 한 일은 안 나온다", !range.some((r) => r.id === next));
  check("날짜 없는 할 일(백로그)은 안 나온다", !range.some((r) => r.id === milk));
  check("**B 캘린더에는 없다**", (await calendarItems([b.spaceId], today, addDays(today, 20))).length === 0);
  const nextTrash = await setChecklistItemDone(trash, true, a.userId);
  const nextTrashRow = (await listChecklistItems(list.id)).find((i) => i.id === nextTrash);
  check(
    "반복으로 생긴 다음 줄도 같은 시각·길이",
    nextTrashRow?.dueOn === addDays(today, 7) && nextTrashRow?.dueTime === "14:00" && nextTrashRow?.estMin === 90,
    nextTrashRow,
  );
  check("그날 한 일은 캘린더에 남는다", (await calendarItems([a.spaceId], today, today)).some((r) => r.id === trash && r.done));
  await updateChecklistItem(milk, { dueOn: today, dueTime: "09:30", estMin: 30 });
  check(
    "백로그에서 놓으면 그 날·시각·길이로",
    (await calendarItems([a.spaceId], today, today)).some((r) => r.id === milk && r.dueTime === "09:30" && r.estMin === 30),
  );
  await updateChecklistItem(milk, { dueOn: null, estMin: null });
  check(
    "백로그로 되돌리면 시간도 같이 빠진다",
    (await listChecklistItems(list.id)).find((i) => i.id === milk)?.dueTime === null,
  );
  await setChecklistItemDone(nextTrash!, true, a.userId);
  await db.update(checklistItem).set({ deletedAt: new Date() }).where(like(checklistItem.title, "분리수거"));

  console.log("\n알림");
  const now = homeNow();
  const reminders = await dueReminders(now);
  check("시간이 지난 오늘 일은 알릴 차례", reminders.some((r) => r.id === call));
  check("너무 지난 일(1월)은 한꺼번에 울리지 않는다", !reminders.some((r) => r.dueOn < addDays(now.day, -1)));
  await markReminded([call]);
  check("한 번 알리면 다시 안 고른다", !(await dueReminders(now)).some((r) => r.id === call));
  await updateChecklistItem(call, { dueTime: "00:01" });
  check("시간을 바꾸면 다시 알린다", (await dueReminders(now)).some((r) => r.id === call));

  console.log("\n구매 연결");
  const buyDoc = await createDocument({
    spaceId: a.spaceId,
    userId: a.userId,
    parentId: list.documentId,
    title: `${TAG} 우유`,
  });
  const purchaseId = await createItem({ documentId: buyDoc, createdBy: a.userId });
  await linkPurchase(milk, purchaseId);
  const linked = (await listChecklistItems(list.id)).find((i) => i.id === milk);
  check("살 것 상태가 같이 보인다", linked?.purchaseState === "listed", linked?.purchaseState);
  check("받으면 체크리스트 항목도 체크된다", (await completeItemsForPurchase(purchaseId, a.userId)) === 1);
  check("체크됐다", (await listChecklistItems(list.id)).find((i) => i.id === milk)?.done === true);

  console.log("\n문서를 휴지통으로");
  await db.update(document).set({ archivedAt: new Date() }).where(eq(document.id, list.documentId));
  check("목록에서 빠진다", !(await listChecklists([a.spaceId])).some((row) => row.id === list.id));
  check("일정에서도 빠진다", (await agenda([a.spaceId], addDays(today, 7))).length === 0);
  check("알림도 안 간다", !(await dueReminders(now)).some((r) => r.checklistId === list.id));
}

async function cleanup(): Promise<void> {
  // 문서를 지우면 체크리스트·항목·살 것이 cascade 로 따라간다.
  await db.delete(document).where(like(document.title, `${TAG}%`));
  await db.delete(document).where(inArray(document.spaceId, made.spaces.length > 0 ? made.spaces : [""]));
  if (made.spaces.length > 0) await db.delete(space).where(inArray(space.id, made.spaces));
  if (made.users.length > 0) {
    await db.delete(checklistItem).where(inArray(checklistItem.createdBy, made.users));
    await db.delete(user).where(inArray(user.id, made.users));
  }
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
