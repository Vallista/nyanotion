/**
 * 생활 기록 점검 — 일정은 space 로, 메모·기분·회고는 사람으로 좁혀지는지. 남의 것이 안 보이고 안 고쳐지는지.
 *   pnpm --filter @nyanotion/db smoke:life
 *
 * 잠깐 계정 둘(과 개인 space)을 만들고 끝나면 치운다 — 계정을 지우면 space·일정·메모·기록이 같이 지워진다.
 */
import { inArray } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import {
  addMemo,
  addPlanEvent,
  countOpenMemos,
  dayNotes,
  getMemo,
  importLife,
  listMemos,
  listReviews,
  planEvents,
  removeMemo,
  removePlanEvent,
  saveDayNote,
  saveReview,
  spaceOfPlanEvent,
  updateMemo,
  updatePlanEvent,
} from "../src/queries/life.ts";
import { planEvent, space, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const made: string[] = [];

async function makeUser(name: string): Promise<{ userId: string; spaceId: string }> {
  const userId = newId();
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name,
    email: `${name.toLowerCase()}-${userId.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.push(userId);
  const spaceId = newId();
  await db.insert(space).values({ id: spaceId, kind: "personal", ownerUserId: userId, name: name });
  return { userId, spaceId };
}

const event = (title: string, startsOn: string, endsOn = startsOn) => ({
  title,
  startsOn,
  startTime: null,
  endsOn,
  endTime: null,
  color: null,
  location: null,
  note: null,
});

async function main(): Promise<void> {
  const me = await makeUser("LIFESMOKE");
  const other = await makeUser("LIFEOTHER");

  console.log("\n일정 — space 로 좁힌다");
  const trip = await addPlanEvent(me.spaceId, me.userId, event("여행", "2026-11-01", "2026-11-03"));
  const theirs = await addPlanEvent(other.spaceId, other.userId, event("남의 약속", "2026-11-02"));
  const mine = await planEvents([me.spaceId], "2026-11-02", "2026-11-02");
  check("걸친 날로도 찾는다(여러 날 일정)", mine.some((e) => e.id === trip), mine.map((e) => e.title));
  check("남의 space 일정은 안 보인다", !mine.some((e) => e.id === theirs));
  check("space 가 없으면 아무것도", (await planEvents([], "2026-01-01", "2026-12-31")).length === 0);
  check("범위 밖은 안 나온다", (await planEvents([me.spaceId], "2026-11-04", "2026-11-30")).length === 0);
  check("일정의 space 를 알려 준다(권한은 부르는 쪽이)", (await spaceOfPlanEvent(theirs)) === other.spaceId);
  await updatePlanEvent(trip, { ...event("가족 여행", "2026-11-01", "2026-11-04"), startTime: null });
  const after = await planEvents([me.spaceId], "2026-11-04", "2026-11-04");
  check("고치면 바뀐다", after[0]?.title === "가족 여행" && after[0]?.endsOn === "2026-11-04", after);
  await removePlanEvent(trip);
  check("지우면 없다", (await spaceOfPlanEvent(trip)) === null);

  console.log("\n메모 — 사람으로 좁힌다");
  const m1 = await addMemo(me.userId, "장보기\n우유");
  const m2 = await addMemo(me.userId, "블로그 글감");
  const theirMemo = await addMemo(other.userId, "남의 메모");
  const list = await listMemos(me.userId);
  check("내 메모만 보인다", list.open.length === 2 && !list.open.some((m) => m.id === theirMemo), list.open.map((m) => m.text));
  check("새것 먼저", list.open[0]?.id === m2, list.open.map((m) => m.id));
  check("남의 메모는 id 로도 못 읽는다", (await getMemo(me.userId, theirMemo)) === null);
  check("남의 메모는 고쳐지지 않는다", (await updateMemo(me.userId, theirMemo, { text: "가로채기" })) === false);
  check("남의 메모는 지워지지 않는다", (await removeMemo(me.userId, theirMemo)) === false);
  check("남의 메모는 그대로", (await getMemo(other.userId, theirMemo))?.text === "남의 메모");
  await updateMemo(me.userId, m1, { done: true, movedTo: "todo:x" });
  const afterDone = await listMemos(me.userId);
  check("끝낸 것은 아래로", afterDone.open.length === 1 && afterDone.done[0]?.id === m1 && afterDone.done[0]?.movedTo === "todo:x", afterDone);
  check("열린 메모 수", (await countOpenMemos(me.userId)) === 1);
  await updateMemo(me.userId, m1, { done: false, movedTo: null });
  check("되돌리면 다시 위로", (await countOpenMemos(me.userId)) === 2);

  console.log("\n기분 · 하루 회고");
  await saveDayNote(me.userId, "2026-10-26", { mood: 4, energy: 3 });
  await saveDayNote(me.userId, "2026-10-26", { retro: "잘 쉬었다" });
  await saveDayNote(other.userId, "2026-10-26", { mood: 1, note: "남의 하루" });
  const notes = await dayNotes(me.userId, "2026-10-01", "2026-10-31");
  check("준 칸만 고친다(앞서 적은 기분이 남는다)", notes.length === 1 && notes[0]?.mood === 4 && notes[0]?.retro === "잘 쉬었다", notes);
  check("남의 기록은 안 보인다", !notes.some((n) => n.note === "남의 하루"));
  await saveDayNote(me.userId, "2026-10-26", { mood: null, energy: null, retro: null });
  check("다 비우면 줄이 사라진다", (await dayNotes(me.userId, "2026-10-26", "2026-10-26")).length === 0);
  check("남의 기록은 그대로", (await dayNotes(other.userId, "2026-10-26", "2026-10-26"))[0]?.mood === 1);

  console.log("\n주간 · 월간 회고");
  await saveReview(me.userId, "week", "2026-W43", "첫 글");
  await saveReview(me.userId, "week", "2026-W43", "고친 글");
  await saveReview(me.userId, "month", "2026-10", "10월");
  await saveReview(other.userId, "week", "2026-W43", "남의 회고");
  const reviews = await listReviews(me.userId);
  check("같은 기간은 한 줄(고치면 덮는다)", reviews.filter((r) => r.kind === "week").length === 1 && reviews.find((r) => r.kind === "week")?.text === "고친 글", reviews);
  check("남의 회고는 안 보인다", reviews.length === 2 && !reviews.some((r) => r.text === "남의 회고"));
  await saveReview(me.userId, "month", "2026-10", "   ");
  check("빈 글이면 지운다", (await listReviews(me.userId)).length === 1);
  check("남의 회고는 그대로", (await listReviews(other.userId)).length === 1);

  // 위에서 쓴 것을 치우고 옮기기를 본다.
  await saveReview(me.userId, "week", "2026-W43", "");
  await saveReview(other.userId, "week", "2026-W43", "");
  for (const m of (await listMemos(other.userId)).open) await removeMemo(other.userId, m.id);
  await importChecks(me, other);
}

async function importChecks(me: { userId: string; spaceId: string }, other: { userId: string; spaceId: string }): Promise<void> {
  console.log("\nBento 에서 옮기기");
  const data = {
    events: [{ ...event("팀 회의", "2026-10-20"), startTime: "10:00", endTime: "11:00", sourceId: "b1" }],
    memos: [{ sourceId: "t1", text: "옮겨 온 생각", done: false, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z" }],
    days: [
      { date: "2026-10-24", mood: 5, energy: 4, note: "좋은 날", retro: null },
      { date: "2026-10-25", mood: 1, energy: 1, note: "Bento 한 줄", retro: "Bento 회고" },
    ],
    reviews: [
      { kind: "week" as const, period: "2026-W42", text: "AI 요약", createdAt: "2026-10-18T00:00:00.000Z" },
      { kind: "week" as const, period: "2026-W43", text: "AI 가 덮으면 안 됨", createdAt: "2026-10-25T00:00:00.000Z" },
    ],
  };
  await saveDayNote(me.userId, "2026-10-25", { mood: 3, retro: null });
  await saveReview(me.userId, "week", "2026-W43", "손으로 쓴 회고");
  const first = await importLife(me.userId, me.spaceId, data);
  check("처음엔 더한다", first.events.added === 1 && first.memos.added === 1 && first.days.added === 1 && first.reviews.added === 1, first);
  check("손으로 쓴 회고는 그대로(있던 것으로 센다)", first.reviews.existing === 1 && (await listReviews(me.userId)).some((r) => r.period === "2026-W43" && r.text === "손으로 쓴 회고"));
  const day25 = (await dayNotes(me.userId, "2026-10-25", "2026-10-25"))[0];
  check("하루 기록은 빈칸만 채운다(도란에서 적은 기분이 이긴다)", first.days.filled === 1 && day25?.mood === 3 && day25?.note === "Bento 한 줄" && day25?.retro === "Bento 회고", day25);
  const again = await importLife(me.userId, me.spaceId, data);
  check("다시 옮겨도 겹치지 않는다", again.events.added === 0 && again.memos.added === 0 && again.days.added === 0 && again.days.filled === 0 && again.reviews.added === 0, again);
  const theirs = await importLife(other.userId, other.spaceId, data);
  check("같은 Bento id 라도 사람마다 따로", theirs.events.added === 1 && theirs.memos.added === 1, theirs);
  check("옮긴 일정은 그 사람 space 에만", (await planEvents([me.spaceId], "2026-10-20", "2026-10-20")).length === 1 && (await planEvents([other.spaceId], "2026-10-20", "2026-10-20")).length === 1);
  check("옮긴 메모는 그 사람 것만", (await listMemos(other.userId)).open.length === 1);
}

async function cleanup(): Promise<void> {
  // 일정의 created_by 는 계정이 지워지는 일을 생각하지 않는다(계정은 막기만 한다) — 먼저 치운다.
  if (made.length > 0) await db.delete(planEvent).where(inArray(planEvent.createdBy, made));
  if (made.length > 0) await db.delete(user).where(inArray(user.id, made));
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}
console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
