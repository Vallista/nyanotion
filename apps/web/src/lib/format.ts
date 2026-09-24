/** 집 서버가 한국에 있으므로 표시 시간대를 고정한다 — 서버·클라이언트가 같은 문자열을 만들어야 한다. */
const TIME_ZONE = "Asia/Seoul";

const time = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const dayAndTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const fullDate = new Intl.DateTimeFormat("ko-KR", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 오늘이면 "오후 7:12", 올해면 "9월 24일 오후 7:12", 그 전이면 "2025년 12월 3일". */
export function formatWhen(value: Date, now: Date = new Date()): string {
  const sameDay =
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate();
  if (sameDay) return time.format(value);
  if (value.getFullYear() === now.getFullYear()) return dayAndTime.format(value);
  return fullDate.format(value);
}
