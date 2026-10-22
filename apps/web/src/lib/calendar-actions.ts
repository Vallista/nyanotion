"use server";

import {
  addCalendarFeed,
  removeCalendarFeed,
  requestFeedRefresh,
  spaceOfCalendarFeed,
} from "@nyanotion/db";
import { FEED_COLORS, normalizeFeedUrl } from "@nyanotion/shared";
import { revalidatePath } from "next/cache";
import { requireViewer, type Viewer } from "@/lib/session";

/**
 * 외부 캘린더 구독의 서버 동작 — `docs/14-calendar.md`.
 *
 * 권한은 **space** 다. 가족 space 에 달면 그 가족 모두가 일정을 본다. 달고 떼려면 그 space 에
 * 쓸 수 있어야 한다 (체크리스트 만들기와 같은 기준 — 손님은 못 한다). 없는 구독과 남의 구독은 같은 말로 거절한다.
 */

function refresh(): void {
  revalidatePath("/", "layout");
  revalidatePath("/calendars");
}

function writableSpace(viewer: Viewer, spaceId: string) {
  const target = viewer.spaces.find((space) => space.id === spaceId);
  if (target === undefined || (target.baseRole !== "editor" && target.baseRole !== "owner")) {
    throw new Error("이 공간에 캘린더를 달 수 없습니다.");
  }
  return target;
}

async function feedGate(feedId: string): Promise<Viewer> {
  const viewer = await requireViewer();
  const spaceId = await spaceOfCalendarFeed(feedId);
  if (spaceId === null || !viewer.spaceIds.includes(spaceId)) throw new Error("캘린더를 찾을 수 없습니다.");
  writableSpace(viewer, spaceId);
  return viewer;
}

/** 구독을 단다. 일정은 워커가 곧(30초 안에) 가져온다. */
export async function addCalendarFeedAction(input: {
  spaceId: string;
  name: string;
  url: string;
  color?: string | null;
}): Promise<string> {
  const viewer = await requireViewer();
  writableSpace(viewer, input.spaceId);

  const name = input.name.trim().slice(0, 80);
  if (name === "") throw new Error("캘린더 이름을 적어 주세요.");
  const url = normalizeFeedUrl(input.url);
  if (url === null) {
    throw new Error("https:// 또는 webcal:// 로 시작하는 iCal 주소를 넣어 주세요.");
  }
  const color =
    input.color && (FEED_COLORS as readonly string[]).includes(input.color) ? input.color : null;

  const id = await addCalendarFeed({ spaceId: input.spaceId, userId: viewer.userId, name, url, color });
  refresh();
  return id;
}

/** 구독을 뗀다. 가져온 일정만 사라지고 원본 캘린더는 그대로다. */
export async function removeCalendarFeedAction(feedId: string): Promise<void> {
  await feedGate(feedId);
  await removeCalendarFeed(feedId);
  refresh();
}

/** 지금 다시 가져오게 한다. */
export async function refreshCalendarFeedAction(feedId: string): Promise<void> {
  await feedGate(feedId);
  await requestFeedRefresh(feedId);
  refresh();
}
