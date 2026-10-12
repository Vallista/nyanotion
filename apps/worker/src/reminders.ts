/**
 * 체크리스트 일정 알림.
 *
 * 색인과 달리 **GPU 를 쓰지 않으므로 게임 중에도 돈다.** 1분에 한 번, 때가 된 항목을 모아
 * 웹 푸시로 보낸다 (시간을 안 정한 일은 그날 아침 9시).
 *
 * 받는 사람: 담당자가 있으면 그 사람만, 없으면 그 체크리스트를 지켜보는 사람 모두
 * (가족 체크리스트면 가족, 개인 것이면 주인 — `watchersOfDocument`).
 * 담당자가 그새 가족에서 빠졌으면 지켜보는 사람 모두에게 간다.
 *
 * **보내지 못해도 "알렸음"으로 적는다.** VAPID 키가 없거나 기기가 없을 때 1분마다 같은 일을
 * 다시 시도하면 로그만 쌓인다. 알림은 덤이고, 일정은 화면에 그대로 있다.
 */
import { dueReminders, markReminded, watchersOfDocument } from "@nyanotion/db";
import { sendToUsers } from "@nyanotion/notify";
import { describeDue, homeNow } from "@nyanotion/shared";

export async function sendDueReminders(now: Date = new Date()): Promise<{ sent: number; items: number }> {
  const clock = homeNow(now);
  const due = await dueReminders(clock);
  if (due.length === 0) return { sent: 0, items: 0 };

  let sent = 0;
  for (const item of due) {
    try {
      const watchers = await watchersOfDocument(item.documentId);
      const targets =
        item.assigneeId !== null && watchers.includes(item.assigneeId) ? [item.assigneeId] : watchers;
      if (targets.length === 0) continue;

      const when = describeDue(item.dueOn, clock.day).label;
      const list = item.checklistTitle.trim() === "" ? "체크리스트" : item.checklistTitle;
      const result = await sendToUsers(targets, {
        title: item.title,
        body: `${list} · ${when}${item.dueTime === null ? "" : ` ${item.dueTime}`}`,
        url: `/lists/${item.checklistId}`,
        tag: `checklist:${item.id}`,
        kind: "checklist-due",
      });
      sent += result.sent;
    } catch (error) {
      console.warn(
        `[알림] ${item.title} 을 보내지 못했습니다:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await markReminded(due.map((item) => item.id));
  return { sent, items: due.length };
}
