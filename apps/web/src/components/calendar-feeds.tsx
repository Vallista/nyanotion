"use client";

import type { FeedSummary } from "@nyanotion/db";
import { FEED_COLORS, calendarColorVar } from "@nyanotion/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addCalendarFeedAction,
  refreshCalendarFeedAction,
  removeCalendarFeedAction,
} from "@/lib/calendar-actions";
import { formatWhen } from "@/lib/format";
import { eventColor, type CalSpace } from "./calendar-model";
import { SmallButton, inputStyle } from "./checklist-item";

/**
 * 구독한 캘린더 목록과 새로 달기. 주소는 달 때 한 번만 받고 다시 보여 주지 않는다 —
 * 구글의 "비공개 주소"는 주소 자체가 열쇠라서, 화면에 남겨 두면 어깨 너머로 샌다.
 */
export function CalendarFeeds({ feeds, spaces }: { feeds: FeedSummary[]; spaces: CalSpace[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const writable = spaces.filter((space) => space.canWrite);
  const [spaceId, setSpaceId] = useState(writable[0]?.id ?? "");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<string>(FEED_COLORS[feeds.length % FEED_COLORS.length] ?? FEED_COLORS[0]);

  const run = (task: () => Promise<unknown>, after?: () => void) =>
    startTransition(async () => {
      setProblem(null);
      try {
        await task();
        after?.();
        router.refresh();
      } catch (error) {
        setProblem(error instanceof Error ? error.message : "하지 못했어요.");
      }
    });

  const spaceName = (id: string) => spaces.find((space) => space.id === id)?.name ?? "";
  const canWrite = (id: string) => spaces.find((space) => space.id === id)?.canWrite ?? false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 6 }}>캘린더 연결</h1>
        <p style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.7 }}>
          가족이 쓰는 캘린더의 iCal 주소를 달면 첫 화면 캘린더에 그 일정이 같이 보여요. 읽기만 합니다 —
          도란이 그 캘린더를 고치지는 않아요. 15분마다 새로 가져옵니다.
        </p>
      </section>

      <section aria-label="연결한 캘린더">
        <h2 style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)", marginBottom: 8 }}>
          연결한 캘린더 {feeds.length}
        </h2>
        {feeds.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)" }}>아직 없어요.</p>
        ) : (
          <ul style={{ padding: 0, margin: 0, borderTop: "1px solid var(--line-soft)" }}>
            {feeds.map((feed) => (
              <li
                key={feed.id}
                style={{
                  listStyle: "none",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 2px",
                  borderBottom: "1px solid var(--line-soft)",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    marginTop: 5,
                    flexShrink: 0,
                    background: eventColor({ feedId: feed.id, color: feed.color }),
                  }}
                />
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 500 }}>{feed.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
                    {spaceName(feed.spaceId) === "나만" ? "나만 봄" : `${spaceName(feed.spaceId)} 가족이 같이 봄`} · {feed.host}
                    <br />
                    {feed.fetchedAt === null
                      ? feed.error === null
                        ? "곧 가져와요 (30초쯤)"
                        : "아직 못 가져왔어요"
                      : `일정 ${feed.events}개 · ${formatWhen(new Date(feed.fetchedAt))} 가져옴`}
                  </div>
                  {feed.error !== null && (
                    <p style={{ fontSize: 12, color: "var(--late)", marginTop: 2 }}>{feed.error}</p>
                  )}
                </div>
                {canWrite(feed.spaceId) && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <SmallButton disabled={busy} onClick={() => run(() => refreshCalendarFeedAction(feed.id))}>
                      지금 가져오기
                    </SmallButton>
                    <SmallButton
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`"${feed.name}" 연결을 끊을까요? 가져온 일정만 사라지고 원래 캘린더는 그대로예요.`)) {
                          run(() => removeCalendarFeedAction(feed.id));
                        }
                      }}
                    >
                      끊기
                    </SmallButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {writable.length > 0 && (
        <section aria-label="캘린더 달기" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3)" }}>새로 달기</h2>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-3)" }}>
            누가 보나
            <select
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value)}
              style={{ ...inputStyle, width: "100%" }}
            >
              {writable.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.kind === "org" ? `${space.name} 가족 모두` : "나만"}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-3)" }}>
            이름
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 우리집 캘린더"
              style={{ ...inputStyle, width: "100%" }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--ink-3)" }}>
            iCal 주소
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              autoComplete="off"
              spellCheck={false}
              style={{ ...inputStyle, width: "100%" }}
            />
          </label>
          <div role="radiogroup" aria-label="색" style={{ display: "flex", gap: 8 }}>
            {FEED_COLORS.map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={color === value}
                aria-label={`색 ${FEED_COLORS.indexOf(value) + 1}`}
                onClick={() => setColor(value)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: calendarColorVar(value),
                  outline: color === value ? "2px solid var(--ink)" : "none",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <div>
            <SmallButton
              primary
              disabled={busy || name.trim() === "" || url.trim() === "" || spaceId === ""}
              onClick={() =>
                run(
                  () => addCalendarFeedAction({ spaceId, name, url, color }),
                  () => {
                    setName("");
                    setUrl("");
                  },
                )
              }
            >
              달기
            </SmallButton>
          </div>
          {problem !== null && (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--late)" }}>
              {problem}
            </p>
          )}

          <details style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.75, marginTop: 6 }}>
            <summary style={{ cursor: "pointer", color: "var(--ink-3)" }}>iCal 주소는 어디서 찾나요?</summary>
            <ul style={{ paddingLeft: 18, marginTop: 6 }}>
              <li>
                <strong style={{ fontWeight: 500 }}>구글 캘린더</strong> — 컴퓨터에서 설정 → 왼쪽에서 그 캘린더 →
                &ldquo;캘린더 통합&rdquo; → <em>iCal 형식의 비공개 주소</em>를 복사하세요. 공개하지 않아도 됩니다.
              </li>
              <li>
                <strong style={{ fontWeight: 500 }}>애플(iCloud) 캘린더</strong> — 캘린더 앱에서 그 캘린더의 공유
                설정 → &ldquo;공개 캘린더&rdquo;를 켜고 링크(webcal://…)를 복사하세요.
              </li>
              <li>그 밖의 캘린더도 iCal(.ics) 구독 주소를 주면 됩니다. https 주소만 받아요.</li>
            </ul>
            <p style={{ marginTop: 6, color: "var(--ink-3)" }}>
              비공개 주소는 그 자체가 열쇠예요. 여기 달고 나면 다시 보여 주지 않습니다.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
