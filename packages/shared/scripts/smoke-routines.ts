/**
 * 루틴 규칙·통계 점검 — DB 없이 돈다.
 *   pnpm --filter @nyanotion/shared smoke
 *
 * 맥 Bento(`routines.rs`)·iPhone(`RoutineKit`)과 같은 규칙이어야 하는 것들이다. 여기서 하나가 바뀌면 셋을 같이 본다.
 */
import {
  RoutineRuleError,
  applyRoutineArchive,
  applyRoutineCheck,
  applyRoutineMinutes,
  checkRoutineDate,
  commitRoutineTimer,
  compareRoutineRates,
  indexRoutineLogs,
  isScheduledOn,
  normalizeRoutineInput,
  perfectStreak,
  routineInsights,
  routineRows,
  routineStreak,
  summarizeRoutines,
  type RoutineItem,
  type RoutineLogItem,
} from "../src/routines.ts";
import { addDays } from "../src/checklist.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}
function throwsRule(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof RoutineRuleError;
  }
}

const NOW = "2026-10-26T01:00:00.000Z";
const TODAY = "2026-10-26"; // 월요일

function routine(over: Partial<RoutineItem> = {}): RoutineItem {
  return {
    id: "rt_a",
    title: "독서",
    color: "blue",
    slot: "evening",
    schedule: { freq: "daily", weekdays: [] },
    goalMin: null,
    startDate: "2026-09-01",
    archivedAt: null,
    pauses: [],
    order: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}
function done(routineId: string, date: string): RoutineLogItem {
  return { routineId, date, done: true, doneAt: NOW, secs: 0, sessions: [], updatedAt: NOW };
}

console.log("입력 정리");
{
  check("빈 이름 거절", throwsRule(() => normalizeRoutineInput({ ...routine(), title: "  " })));
  const all7 = normalizeRoutineInput({ ...routine(), schedule: { freq: "weekly", weekdays: [0, 1, 2, 3, 4, 5, 6, 3] } });
  check("일곱 요일 = 매일", all7.schedule.freq === "daily" && all7.schedule.weekdays.length === 0, all7.schedule);
  check("요일 없는 매주 거절", throwsRule(() => normalizeRoutineInput({ ...routine(), schedule: { freq: "weekly", weekdays: [] } })));
  const odd = normalizeRoutineInput({ ...routine(), goalMin: 0, color: "pink", slot: "night" });
  check("목표 0 = 없음, 모르는 색·시간대는 기본값", odd.goalMin === null && odd.color === "blue" && odd.slot === "anytime", odd);
  check("목표 600분 초과 거절", throwsRule(() => normalizeRoutineInput({ ...routine(), goalMin: 601 })));
  check("없는 날짜 거절", throwsRule(() => normalizeRoutineInput({ ...routine(), startDate: "2026-02-30" })));
}

console.log("기록 날짜");
{
  const r = routine({ startDate: "2026-10-20" });
  check("미래 거절", throwsRule(() => checkRoutineDate(r, "2026-10-27", TODAY)));
  check("시작 전 거절", throwsRule(() => checkRoutineDate(r, "2026-10-19", TODAY)));
  check("오늘·지난날 허용", !throwsRule(() => checkRoutineDate(r, TODAY, TODAY)) && !throwsRule(() => checkRoutineDate(r, "2026-10-20", TODAY)));
}

console.log("체크 · 시간");
{
  const r = routine({ goalMin: 10 });
  const on = applyRoutineCheck(r, undefined, TODAY, true, TODAY, NOW);
  check("체크하면 완료 + 시각", on?.done === true && on.doneAt === NOW, on);
  const off = applyRoutineCheck(r, on ?? undefined, TODAY, false, TODAY, NOW);
  check("시간 없이 해제하면 줄을 지운다", off === null, off);
  const nine = applyRoutineMinutes(r, undefined, TODAY, 9, TODAY, NOW);
  check("목표 전은 미완료", nine.log?.done === false && !nine.reachedGoal, nine);
  const ten = applyRoutineMinutes(r, nine.log ?? undefined, TODAY, 10, TODAY, NOW);
  check("목표를 채우면 완료", ten.log?.done === true && ten.reachedGoal, ten);
  const back = applyRoutineMinutes(r, ten.log ?? undefined, TODAY, 3, TODAY, NOW);
  check("시간을 줄여도 완료는 그대로", back.log?.done === true && back.log.secs === 180 && !back.reachedGoal, back);
  const keep = applyRoutineCheck(r, back.log ?? undefined, TODAY, false, TODAY, NOW);
  check("시간이 있으면 해제해도 줄은 남는다", keep !== null && keep.done === false && keep.secs === 180, keep);
}

console.log("타이머");
{
  const r = routine({ goalMin: 30 });
  const start = "2026-10-26T00:00:00.000Z";
  const zero = commitRoutineTimer(r, { routineId: r.id, date: TODAY, startedAt: start }, undefined, new Date(start));
  check("0초는 기록 없음", zero === null, zero);
  const half = commitRoutineTimer(r, { routineId: r.id, date: TODAY, startedAt: start }, undefined, new Date(Date.parse(start) + 31 * 60_000));
  check("31분이면 목표 30분 채움", half?.addedSecs === 31 * 60 && half.reachedGoal && half.log.done && half.log.sessions.length === 1, half);
  const long = commitRoutineTimer(r, { routineId: r.id, date: TODAY, startedAt: start }, undefined, new Date(Date.parse(start) + 13 * 3600_000));
  check("세션은 12시간에서 자른다", long?.capped === true && long.addedSecs === 12 * 3600, long && { capped: long.capped, secs: long.addedSecs });
  check("시작한 날에 적는다", long?.log.date === TODAY);
}

console.log("보관 · 꺼내기");
{
  const r = routine();
  const a = applyRoutineArchive(r, true, "2026-10-20", NOW);
  check("보관일부터 예정 아님", a.archivedAt === "2026-10-20" && !isScheduledOn(a, "2026-10-20") && isScheduledOn(a, "2026-10-19"));
  const b = applyRoutineArchive(a, false, TODAY, NOW);
  check("꺼내면 보관일~어제가 쉬는 구간", b.archivedAt === null && b.pauses.length === 1 && b.pauses[0]!.from === "2026-10-20" && b.pauses[0]!.to === "2026-10-25", b.pauses);
  check("쉬는 동안은 예정 아님, 오늘은 예정", !isScheduledOn(b, "2026-10-22") && isScheduledOn(b, TODAY));
  const same = applyRoutineArchive(applyRoutineArchive(r, true, TODAY, NOW), false, TODAY, NOW);
  check("같은 날 꺼내면 구간 없음", same.pauses.length === 0, same.pauses);
}

console.log("스트릭");
{
  const r = routine({ startDate: "2026-10-20" });
  const logs = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => done(r.id, d));
  const s = routineStreak(r, indexRoutineLogs(logs), TODAY);
  check("오늘 안 한 것은 끊김이 아니다", s.current === 5 && s.pendingToday && s.best === 5, s);
  const weekly = routine({ id: "rt_w", startDate: "2026-10-01", schedule: { freq: "weekly", weekdays: [1, 3, 5] } });
  const wl = ["2026-10-19", "2026-10-21", "2026-10-23"].map((d) => done(weekly.id, d));
  const ws = routineStreak(weekly, indexRoutineLogs(wl), TODAY);
  check("예정일만 센다", ws.current === 3, ws);
  const p = perfectStreak([r], indexRoutineLogs(logs), TODAY);
  check("모두 끝낸 날 연속도 오늘은 진행 중", p.current === 5, p);
}

console.log("비교는 끝난 날끼리");
{
  const a = routine({ id: "rt_a", startDate: "2026-10-01" });
  const b = routine({ id: "rt_b", startDate: "2026-10-01" });
  // 지난주(10/18~) 매일 둘 다, 이번 주 일·월(어제까지) 둘 다, 오늘은 하나만 했다.
  const days = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
  const logs = days.flatMap((d) => [done(a.id, d), done(b.id, d)]);
  logs.push(done(a.id, TODAY));
  const idx = indexRoutineLogs(logs);
  const ws = "2026-10-25";
  const week = summarizeRoutines([a, b], idx, ws, TODAY, TODAY);
  check("기간 요약은 오늘까지 그대로 센다", week.done === 3 && week.scheduled === 4, week);
  const cmp = compareRoutineRates([a, b], idx, ws, addDays(ws, 6), addDays(ws, -7), addDays(ws, -1), TODAY);
  check("비교는 어제까지 — 오늘 남은 것 때문에 떨어지지 않는다", cmp?.delta === 0 && cmp.through === "2026-10-25", cmp);
  const first = compareRoutineRates([a, b], idx, TODAY, TODAY, "2026-10-25", "2026-10-25", TODAY);
  check("끝난 날이 없으면 비교하지 않는다", first === null, first);
  const insights = routineInsights([a, b], idx, TODAY);
  check("주 비교 문장은 끝난 날이 이틀은 돼야", !insights.some((i) => i.id === "week-delta"), insights.map((i) => i.id));
  const fresh = routine({ id: "rt_new", startDate: TODAY });
  const [row] = routineRows([fresh], idx, TODAY);
  check("오늘 만든 루틴은 달성률 없음(0% 아님)", row?.rate30.rate === null && row.recent.at(-1) === "pending", row?.rate30);
  const [rowB] = routineRows([{ ...b, startDate: "2026-10-18" }], idx, TODAY);
  check("루틴별 30일 달성률도 오늘 남은 것은 빼고 센다", rowB?.rate30.rate === 1, rowB?.rate30);
}

console.log("");
if (failures > 0) {
  console.log(`실패 ${failures}건`);
  process.exit(1);
}
console.log("모두 통과");
