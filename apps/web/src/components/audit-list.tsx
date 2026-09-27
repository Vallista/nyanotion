import Link from "next/link";

/**
 * 감사 로그 목록. 서버 컴포넌트다 — 누를 것이 링크뿐이라 클라이언트로 갈 이유가 없다.
 *
 * **무슨 일인지를 아이콘이 아니라 말로 적는다.** 색이나 기호로 구분하면 나중에 이 화면을 보는
 * 사람(대개 뭔가 잘못됐을 때다)이 범례부터 찾아야 한다.
 */

type Event = {
  id: string;
  when: string;
  who: string;
  action: string;
  summary: string;
  documentId: string | null;
};

/** 행위 이름 → 사람 말. 모르는 이름은 그대로 보여 준다 (새 종류를 감추지 않는다). */
const LABELS: Record<string, string> = {
  "share.grant": "공유",
  "share.revoke": "공유 거둠",
  "link.create": "공개 링크",
  "link.revoke": "링크 닫음",
  "family.invite": "초대",
  "family.join": "합류",
  "family.role": "역할",
  "family.remove": "내보냄",
  "purchase.approve": "구매 승인",
  "purchase.reject": "구매 거절",
  "purchase.cancel": "주문 취소",
  "trash.empty": "모래상자 비움",
  "gpu.mode": "GPU",
};

/** 되돌릴 수 없거나 밖으로 열리는 일 — 눈에 띄어야 한다. */
const HEAVY = new Set(["link.create", "trash.empty", "purchase.approve", "family.remove"]);

export function AuditList({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-3)", padding: "6px 0", lineHeight: 1.8 }}>
        아직 남은 기록이 없습니다. 공유하거나 승인하면 여기 쌓입니다.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column" }}>
      {events.map((event) => {
        const body = (
          <>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--ink-4)",
                minWidth: 82,
                flexShrink: 0,
              }}
            >
              {LABELS[event.action] ?? event.action}
            </span>
            <span
              style={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: 13.5,
                color: "var(--ink)",
                fontWeight: HEAVY.has(event.action) ? 500 : 400,
                lineHeight: 1.6,
              }}
            >
              {event.summary}
            </span>
            <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0 }}>{event.who}</span>
            <span
              style={{ fontSize: 12, color: "var(--ink-4)", flexShrink: 0, minWidth: 74, textAlign: "right" }}
            >
              {event.when}
            </span>
          </>
        );

        const style = {
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap" as const,
          padding: "10px 0",
          borderBottom: "1px solid var(--line-soft)",
          textDecoration: "none",
        };

        return (
          <li key={event.id}>
            {event.documentId === null ? (
              <div style={style}>{body}</div>
            ) : (
              // 문서가 지워졌으면 404 가 뜬다 — 그것도 답이다 ("그 문서는 이제 없다").
              <Link href={`/d/${event.documentId}`} style={style}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
