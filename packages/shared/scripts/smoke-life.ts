/**
 * 생활 기록 규칙 점검 — 일정 모양 · 옮기기 · 메모 · 회고 기간. DB 없이 돈다.
 *   pnpm --filter @nyanotion/shared smoke
 */
import {
  LifeRuleError,
  cleanLevel,
  memoTitle,
  movePlanEvent,
  normalizeMemo,
  normalizePlanEvent,
  periodLabel,
  periodRange,
  weekKey,
} from "../src/life.ts";
import { planBentoImport } from "../src/bento-import.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}
function rejects(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof LifeRuleError;
  }
}

console.log("일정 모양");
{
  const allDay = normalizePlanEvent({ title: " 가족 여행 ", startsOn: "2026-11-01", endsOn: "2026-11-03" });
  check("종일 · 여러 날", allDay.title === "가족 여행" && allDay.startTime === null && allDay.endTime === null && allDay.endsOn === "2026-11-03", allDay);
  const noEnd = normalizePlanEvent({ title: "치과", startsOn: "2026-11-02", startTime: "14:30" });
  check("끝 시각이 없으면 한 시간 뒤", noEnd.endTime === "15:30" && noEnd.endsOn === "2026-11-02", noEnd);
  const late = normalizePlanEvent({ title: "야간", startsOn: "2026-11-02", startTime: "23:30" });
  check("자정을 넘기면 23:59 에서 자른다", late.endTime === "23:59", late);
  check("이름 없음 거절", rejects(() => normalizePlanEvent({ title: "  ", startsOn: "2026-11-02" })));
  check("없는 날 거절", rejects(() => normalizePlanEvent({ title: "a", startsOn: "2026-02-30" })));
  check("끝 날이 앞이면 거절", rejects(() => normalizePlanEvent({ title: "a", startsOn: "2026-11-02", endsOn: "2026-11-01" })));
  check("같은 날 끝이 시작보다 앞이면 거절", rejects(() => normalizePlanEvent({ title: "a", startsOn: "2026-11-02", startTime: "10:00", endTime: "09:00" })));
  const overnight = normalizePlanEvent({ title: "캠핑", startsOn: "2026-11-02", startTime: "18:00", endsOn: "2026-11-03", endTime: "10:00" });
  check("여러 날 시간 일정은 끝이 시작보다 일러도 된다", overnight.endTime === "10:00", overnight);
  const odd = normalizePlanEvent({ title: "a", startsOn: "2026-11-02", color: "#123456", location: "  ", note: "" });
  check("모르는 색·빈 장소·빈 메모는 없음", odd.color === null && odd.location === null && odd.note === null, odd);
}

console.log("일정 옮기기");
{
  const base = normalizePlanEvent({ title: "회의", startsOn: "2026-11-02", startTime: "10:00", endTime: "11:30" });
  const moved = movePlanEvent(base, "2026-11-04", "15:00");
  check("길이 그대로", moved.startsOn === "2026-11-04" && moved.startTime === "15:00" && moved.endTime === "16:30" && moved.endsOn === "2026-11-04", moved);
  const toAllDay = movePlanEvent(base, "2026-11-05", null);
  check("종일 줄에 놓으면 종일", toAllDay.startTime === null && toAllDay.endTime === null && toAllDay.endsOn === "2026-11-05", toAllDay);
  const trip = normalizePlanEvent({ title: "여행", startsOn: "2026-11-01", endsOn: "2026-11-03" });
  const tripMoved = movePlanEvent(trip, "2026-11-10", null);
  check("여러 날 종일은 날 수 그대로", tripMoved.startsOn === "2026-11-10" && tripMoved.endsOn === "2026-11-12", tripMoved);
  const toTimed = movePlanEvent(trip, "2026-11-10", "09:00");
  check("종일을 시간 칸에 놓으면 한 시간짜리", toTimed.startTime === "09:00" && toTimed.endTime === "10:00" && toTimed.endsOn === "2026-11-10", toTimed);
  const spill = movePlanEvent(base, "2026-11-02", "23:00");
  check("자정을 넘기면 다음 날로", spill.endsOn === "2026-11-03" && spill.endTime === "00:30", spill);
  const exact = movePlanEvent(normalizePlanEvent({ title: "a", startsOn: "2026-11-02", startTime: "22:00", endTime: "23:00" }), "2026-11-02", "23:00");
  check("자정에 딱 끝나면 그날 23:59", exact.endsOn === "2026-11-02" && exact.endTime === "23:59", exact);
  check("옮긴 결과도 규칙을 지난다", !rejects(() => normalizePlanEvent(spill)) && !rejects(() => normalizePlanEvent(exact)));
}

console.log("메모 · 기분");
{
  check("빈 메모 거절", rejects(() => normalizeMemo("  \n ")));
  check("첫 줄이 제목", memoTitle("\n  장보기 목록  \n우유\n계란") === "장보기 목록");
  check("기분은 1~5 정수", cleanLevel(3.4) === 3 && cleanLevel(0) === null && cleanLevel(6) === null && cleanLevel(null) === null);
}

console.log("회고 기간");
{
  check("주 이름", weekKey("2026-10-26") === "2026-W44", weekKey("2026-10-26"));
  check("1월 1일이 든 주가 1주", weekKey("2026-01-01") === "2025-W53" || weekKey("2026-01-01") === "2026-W01", weekKey("2026-01-01"));
  const r = periodRange("week", weekKey("2026-10-26"));
  check("주 이름 → 일요일~토요일", r?.from === "2026-10-25" && r.to === "2026-10-31", r);
  const m = periodRange("month", "2026-02");
  check("달 → 첫날~말일", m?.from === "2026-02-01" && m.to === "2026-02-28", m);
  check("틀린 모양은 null", periodRange("week", "2026-44") === null && periodRange("month", "2026-13") === null);
  check("이름표", periodLabel("week", "2026-W44") === "10월 25일 – 31일 주" && periodLabel("month", "2026-10") === "2026년 10월", [periodLabel("week", "2026-W44"), periodLabel("month", "2026-10")]);
  // 모든 날이 자기 주 이름으로 돌아온다 — 2년치.
  let bad = 0;
  for (let i = 0; i < 730; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
    const range = periodRange("week", weekKey(d));
    if (range === null || d < range.from || d > range.to) bad += 1;
  }
  check("2년 동안 날 → 주 이름 → 범위가 그 날을 품는다", bad === 0, bad);
}

console.log("Bento 에서 옮기기 (모양 바꾸기)");
{
  const block = (id: string, extra: Record<string, unknown>) => ({ id, date: "2026-10-21", start: "10:00", end: "11:00", title: id, kind: "meet", source: "local", attendees: [], done: false, createdAt: "2026-10-01T00:00:00Z", ...extra });
  const plan = planBentoImport({
    version: 1,
    blocks: [
      block("meet", {}),
      block("trip", { start: "00:00", end: "00:00", endDate: "2026-10-23", kind: "leisure" }),
      block("late", { start: "22:00", end: "24:00", kind: "deep" }),
      block("gcal", { source: "gcal" }),
      block("task", { taskId: "t1" }),
      block("routine", { kind: "routine" }),
      block("someday", { start: "", end: "" }),
      block("bad", { date: "2026-02-30" }),
      block("weird id/../x", {}),
    ],
    moods: [
      { date: "2026-10-24", energy: 0.75, mood: 1, retrospectiveNote: " 좋았다 " },
      { date: "2026-10-25" },
    ],
    summaries: [
      { kind: "weekly", period: "2026-W42", text: "요약" },
      { kind: "monthly", period: "2026-9", text: "모양 틀림" },
    ],
    thoughts: [
      { id: "t1", type: "thought", state: "inbox", title: "제목", body: "본문" },
      { id: "t2", type: "blog", state: "inbox", title: "블로그 글감" },
      { id: "t3", type: "thought", state: "archived", title: "끝" },
    ],
  });
  const ids = plan.events.map((e) => e.sourceId);
  check("내 블록만 일정으로(외부·할 일·루틴·시간 없음·없는 날 빼고)", ids.join(",") === "meet,trip,late,weirdid..x", ids);
  check("빠진 까닭을 센다", JSON.stringify(plan.skipped) === JSON.stringify({ external: 1, task: 1, routine: 1, unscheduled: 1, invalid: 1, thoughts: 1, days: 1, reviews: 1 }), plan.skipped);
  const trip = plan.events.find((e) => e.sourceId === "trip");
  check("00:00–00:00 은 종일 여러 날", trip?.startTime === null && trip.endsOn === "2026-10-23", trip);
  check("24:00 은 23:59", plan.events.find((e) => e.sourceId === "late")?.endTime === "23:59");
  check("종류 → 색", plan.events.find((e) => e.sourceId === "meet")?.color === "#4f7cac");
  check("생각만 메모로, 끝낸 것은 끝낸 메모", plan.memos.length === 2 && plan.memos[0]?.text === "제목\n본문" && plan.memos[1]?.done === true, plan.memos);
  check("기분 0~1 → 1~5, 회고 다듬기", plan.days.length === 1 && plan.days[0]?.mood === 5 && plan.days[0]?.energy === 4 && plan.days[0]?.retro === "좋았다", plan.days);
  check("요약 → 회고(모양이 맞는 것만)", plan.reviews.length === 1 && plan.reviews[0]?.kind === "week", plan.reviews);
  check("모양이 아니면 거절", rejects(() => planBentoImport("x")));
}

console.log("");
if (failures > 0) {
  console.log(`실패 ${failures}건`);
  process.exit(1);
}
console.log("모두 통과");
