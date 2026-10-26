import { dayNotes, listReviews } from "@nyanotion/db";
import { addDays, homeNow, monthKey, periodLabel, periodRange, weekKey, type ReviewPeriodKind } from "@nyanotion/shared";
import { JournalScreen, type PeriodChoice } from "@/components/life/journal-screen";
import { TopBar } from "@/components/top-bar";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "기록" };

/**
 * 기록 — 주간·월간 회고와 하루 기록 (`docs/15-today.md`). 나만 본다.
 * `?k=week|month&p=<기간>` 으로 쓸 기간을 고른다. 안 고르면 이번 주.
 */
export default async function JournalPage({ searchParams }: { searchParams: Promise<{ k?: string; p?: string }> }) {
  const viewer = await requireViewer();
  const { day: today } = homeNow();
  const params = await searchParams;

  const thisWeek = weekKey(today);
  const lastWeek = weekKey(addDays(today, -7));
  const thisMonth = monthKey(today);
  const lastMonth = monthKey(addDays(`${thisMonth}-01`, -1));
  const choice = (kind: ReviewPeriodKind, period: string, label: string): PeriodChoice => ({ kind, period, label });
  const choices = [
    choice("week", thisWeek, "이번 주"),
    choice("week", lastWeek, "지난주"),
    choice("month", thisMonth, "이번 달"),
    choice("month", lastMonth, "지난달"),
  ];

  // 주소로 고른 기간 — 모양이 맞고 오늘 이전에 시작한 것만. 아니면 이번 주.
  const kind: ReviewPeriodKind = params.k === "month" ? "month" : "week";
  const asked = params.p !== undefined ? periodRange(kind, params.p) : null;
  const selected =
    asked !== null && asked.from <= today && params.p !== undefined
      ? (choices.find((c) => c.kind === kind && c.period === params.p) ?? choice(kind, params.p, periodLabel(kind, params.p)))
      : choices[0]!;
  if (!choices.some((c) => c.kind === selected.kind && c.period === selected.period)) choices.push(selected);

  const range = periodRange(selected.kind, selected.period)!;
  const from = [range.from, addDays(today, -62)].sort()[0]!;
  const [reviews, notes] = await Promise.all([listReviews(viewer.userId, 200), dayNotes(viewer.userId, from, today)]);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "기록" }]} />
      <JournalScreen today={today} choices={choices} selected={selected} reviews={reviews} notes={notes} />
    </>
  );
}
