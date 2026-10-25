/**
 * 루틴 동기화 점검 — 변경 번호 · 나중에 고친 쪽이 이김 · 지운 표시 · 기록 id · 타이머 · 남의 것.
 *   pnpm --filter @nyanotion/db smoke:routines
 *
 * 잠깐 계정 둘을 만들고 끝나면 치운다(루틴·기록·타이머는 계정과 같이 지워진다).
 */
import { inArray } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import { applyRoutineChanges, routineChanges, routineLogId } from "../src/queries/routines.ts";
import { user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const made: string[] = [];
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

async function makeUser(name: string): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name,
    email: `${name.toLowerCase()}-${id.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.push(id);
  return id;
}

const reading = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: "독서",
  color: "blue",
  slot: "evening",
  schedule: { freq: "daily", weekdays: [] },
  goalMin: 20,
  startDate: "2026-10-01",
  archivedAt: null,
  pauses: [],
  order: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: iso(-60_000),
  ...extra,
});

async function main(): Promise<void> {
  const me = await makeUser("ROUTINESMOKE");
  const other = await makeUser("ROUTINEOTHER");

  console.log("\n처음 올리기");
  const first = await applyRoutineChanges(me, {
    routines: [
      reading("rt_read"),
      reading("rt_gym", { title: "운동", color: "orange", schedule: { freq: "weekly", weekdays: [5, 1, 3, 1] } }),
    ],
    logs: [
      { routineId: "rt_read", date: "2026-10-24", done: true, secs: 1500, updatedAt: iso(-50_000) },
      {
        routineId: "rt_read",
        date: "2026-10-25",
        done: false,
        secs: 300,
        sessions: [{ start: "2026-10-25T10:00:00Z", end: "2026-10-25T10:05:00Z", secs: 300 }],
        updatedAt: iso(-50_000),
      },
    ],
    timer: { routineId: "rt_read", date: "2026-10-25", startedAt: iso(-30_000), updatedAt: iso(-30_000) },
  });
  check("루틴 둘 · 기록 둘 · 타이머 하나", first.applied === 5 && first.rejected.length === 0, first);

  const all = await routineChanges(me, 0);
  check("받으면 다 온다", all.routines.length === 2 && all.logs.length === 2 && all.timer?.routineId === "rt_read", all);
  const gym = all.routines.find((r) => r.id === "rt_gym");
  check("요일은 겹친 것을 빼고 정렬한다", JSON.stringify(gym?.schedule) === JSON.stringify({ freq: "weekly", weekdays: [1, 3, 5] }), gym);
  const log24 = all.logs.find((l) => l.date === "2026-10-24");
  check("기록 id 는 <루틴>:<날짜>", log24?.id === routineLogId("rt_read", "2026-10-24") && log24?.id === "rt_read:2026-10-24", log24);
  check("완료하면 doneAt 이 찍힌다", log24?.done === true && log24.doneAt !== null);
  check("세션이 남는다", all.logs.find((l) => l.date === "2026-10-25")?.sessions.length === 1);
  const cursor = all.cursor;
  check("커서는 받은 것 중 가장 큰 번호", cursor > 0 && cursor >= Math.max(...all.routines.map((r) => r.rev), ...all.logs.map((l) => l.rev)));
  check("다시 받으면 없다", (await routineChanges(me, cursor)).routines.length === 0);
  check("**남의 것은 안 보인다**", (await routineChanges(other, 0)).routines.length === 0);

  console.log("\n나중에 고친 쪽이 이긴다");
  const newer = await applyRoutineChanges(me, { routines: [reading("rt_read", { title: "독서 30분", goalMin: 30, updatedAt: iso(-10_000) })] });
  check("더 나중 것은 들어간다", newer.applied === 1);
  const older = await applyRoutineChanges(me, { routines: [reading("rt_read", { title: "옛 이름", updatedAt: iso(-40_000) })] });
  check("더 이른 것은 버리고 stale", older.applied === 0 && older.stale.includes("rt_read"), older);
  check("**버린 것의 지금 값을 같이 준다**", older.current.routines[0]?.title === "독서 30분", older.current);
  const future = await applyRoutineChanges(me, { routines: [reading("rt_read", { title: "미래", updatedAt: iso(86_400_000) })] });
  const afterFuture = (await routineChanges(me, cursor)).routines.find((r) => r.id === "rt_read");
  check(
    "미래 시각은 지금으로 깎는다",
    future.applied === 1 && afterFuture !== undefined && Date.parse(afterFuture.updatedAt) <= Date.now() + 1000,
    afterFuture,
  );
  const right = await applyRoutineChanges(me, { routines: [reading("rt_read", { title: "독서 30분", updatedAt: iso(1000) })] });
  check("깎인 미래보다 나중이면 다시 이긴다", right.applied === 1, right);

  console.log("\n기록");
  const relog = await applyRoutineChanges(me, {
    logs: [{ routineId: "rt_read", date: "2026-10-25", done: true, secs: 1500, updatedAt: iso(2000) }],
  });
  const log25 = (await routineChanges(me, cursor)).logs.find((l) => l.date === "2026-10-25");
  check("같은 날 같은 루틴은 같은 줄을 고친다", relog.applied === 1 && log25?.done === true && log25.secs === 1500, log25);
  check("세션을 안 보내면 지킨다", log25?.sessions.length === 1, log25);
  const uncheck = await applyRoutineChanges(me, {
    logs: [{ routineId: "rt_read", date: "2026-10-25", done: false, updatedAt: iso(3000) }],
  });
  const log25b = (await routineChanges(me, cursor)).logs.find((l) => l.date === "2026-10-25");
  check("체크를 풀면 doneAt 도 빈다", uncheck.applied === 1 && log25b?.done === false && log25b.doneAt === null, log25b);
  const delLog = await applyRoutineChanges(me, {
    logs: [{ routineId: "rt_read", date: "2026-10-25", deleted: true, updatedAt: iso(4000) }],
  });
  check("기록 지우기는 지운 표시", delLog.applied === 1 && (await routineChanges(me, cursor)).logs.find((l) => l.date === "2026-10-25")?.deleted === true);
  const revive = await applyRoutineChanges(me, {
    logs: [{ routineId: "rt_read", date: "2026-10-25", done: true, updatedAt: iso(5000) }],
  });
  check("지운 뒤 더 나중에 고치면 되살아난다", revive.applied === 1 && (await routineChanges(me, cursor)).logs.find((l) => l.date === "2026-10-25")?.deleted === false);

  console.log("\n타이머");
  const stop = await applyRoutineChanges(me, { timer: { routineId: null, updatedAt: iso(6000) } });
  const t1 = (await routineChanges(me, cursor)).timer;
  check("멈추면 routineId 가 빈 채로 온다", stop.applied === 1 && t1 !== null && t1.routineId === null && t1.startedAt === null, t1);
  const staleTimer = await applyRoutineChanges(me, {
    timer: { routineId: "rt_gym", date: "2026-10-25", startedAt: iso(-1000), updatedAt: iso(-1000) },
  });
  check("타이머도 이른 것은 버린다", staleTimer.stale.includes("timer") && staleTimer.current.timer?.routineId === null, staleTimer);
  const badTimer = await applyRoutineChanges(me, { timer: { routineId: "rt_gym", date: "어제", startedAt: iso(), updatedAt: iso(7000) } });
  check("모양이 틀린 타이머는 받지 않는다", badTimer.rejected[0]?.id === "timer", badTimer);
  const t2 = await applyRoutineChanges(me, {
    timer: { routineId: "rt_gym", date: "2026-10-25", startedAt: iso(7000), updatedAt: iso(7000) },
  });
  const tCursor = (await routineChanges(me, 0)).cursor;
  check("다시 켠다", t2.applied === 1 && (await routineChanges(me, cursor)).timer?.routineId === "rt_gym");

  console.log("\n루틴 지우기");
  const del = await applyRoutineChanges(me, { routines: [{ id: "rt_gym", deleted: true, updatedAt: iso(8000) }] });
  const afterDel = await routineChanges(me, tCursor);
  check("루틴은 지운 표시로 온다", del.applied === 1 && afterDel.routines.find((r) => r.id === "rt_gym")?.deleted === true, afterDel);
  check("**그 루틴의 타이머는 멈춘다**", afterDel.timer?.routineId === null, afterDel.timer);
  await applyRoutineChanges(me, {
    logs: [{ routineId: "rt_read", date: "2026-10-23", done: true, updatedAt: iso(9000) }],
  });
  const delRead = await applyRoutineChanges(me, { routines: [{ id: "rt_read", deleted: true, updatedAt: iso(10_000) }] });
  const afterRead = await routineChanges(me, tCursor);
  const readLogs = afterRead.logs.filter((l) => l.routineId === "rt_read");
  check(
    "**그 루틴의 기록도 따라 지운다**",
    delRead.applied === 1 && readLogs.length >= 3 && readLogs.every((l) => l.deleted),
    readLogs.map((l) => [l.date, l.deleted]),
  );
  const again = await applyRoutineChanges(me, { routines: [{ id: "rt_read", deleted: true, updatedAt: iso(11_000) }] });
  check("이미 지운 것을 또 지우면 아무 일도 없다", again.applied === 0);
  const back = await applyRoutineChanges(me, { routines: [reading("rt_read", { updatedAt: iso(12_000) })] });
  check("지운 뒤 더 나중에 고치면 되살아난다", back.applied === 1 && (await routineChanges(me, tCursor)).routines.find((r) => r.id === "rt_read")?.deleted === false);

  console.log("\n받지 않는 것");
  const bad = await applyRoutineChanges(me, {
    routines: [
      { id: "bad id!", updatedAt: iso() },
      { id: "with:colon", title: "x", schedule: { freq: "daily" }, startDate: "2026-10-01", updatedAt: iso() },
      reading("rt_c1", { color: "#ff0000" }),
      reading("rt_c2", { slot: "noon" }),
      reading("rt_c3", { schedule: { freq: "weekly", weekdays: [] } }),
      reading("rt_c4", { goalMin: 601 }),
      reading("rt_c5", { startDate: "2026-02-30" }),
      reading("rt_c6", { title: "   " }),
      { id: "rt_c7", title: "제목만", updatedAt: iso() },
      reading("rt_c8", { updatedAt: "어제" }),
    ],
    logs: [
      { routineId: "rt_read", date: "10/25", updatedAt: iso() },
      { id: "rt_read:2026-10-01", routineId: "rt_read", date: "2026-10-02", updatedAt: iso() },
      { routineId: "rt_read", date: "2026-10-03", secs: 90_000, updatedAt: iso() },
      { routineId: "rt_read", date: "2026-10-04", done: "yes" as unknown as boolean, updatedAt: iso() },
    ],
  });
  check("모양이 틀린 것은 전부 rejected", bad.applied === 0 && bad.rejected.length === 14, bad.rejected);
  const unknownDel = await applyRoutineChanges(me, { routines: [{ id: "rt_ghost", deleted: true, updatedAt: iso() }] });
  check("모르는 것을 지우라면 아무 일도 없다", unknownDel.applied === 0 && unknownDel.rejected.length === 0);

  console.log("\n남의 것");
  const stealR = await applyRoutineChanges(other, { routines: [reading("rt_read", { title: "가로채기", updatedAt: iso(20_000) })] });
  check("**남의 루틴 id 로는 못 덮는다**", stealR.rejected[0]?.reason === "other-user", stealR);
  const stealL = await applyRoutineChanges(other, {
    logs: [{ routineId: "rt_read", date: "2026-10-24", done: false, updatedAt: iso(20_000) }],
  });
  check("**남의 기록 id 로는 못 덮는다**", stealL.rejected[0]?.reason === "other-user", stealL);
  const otherTimer = await applyRoutineChanges(other, {
    timer: { routineId: "rt_x", date: "2026-10-25", startedAt: iso(), updatedAt: iso() },
  });
  check("타이머는 사람마다 따로", otherTimer.applied === 1 && (await routineChanges(me, 0)).timer?.routineId !== "rt_x");

  console.log("\n나눠 받기");
  const many = Array.from({ length: 5 }, (_, i) => ({
    routineId: "rt_read",
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    done: true,
    updatedAt: iso(30_000 + i),
  }));
  await applyRoutineChanges(me, { logs: many });
  let since = tCursor;
  let pages = 0;
  const seen = new Set<string>();
  for (;;) {
    const page = await routineChanges(me, since, 2);
    pages += 1;
    page.logs.forEach((l) => seen.add(l.id));
    since = page.cursor;
    if (!page.more || pages > 20) break;
  }
  check("한도로 나눠 받아도 빠지는 것이 없다", many.every((m) => seen.has(routineLogId(m.routineId, m.date))) && pages > 2, { pages, seen: seen.size });
}

async function cleanup(): Promise<void> {
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
