import { aiConfig, aiStatus } from "@nyanotion/ai";
import { currentEnv, hasVector, indexCoverage, listAudit, queueDepth } from "@nyanotion/db";
import { TopBar } from "@/components/top-bar";
import { formatWhen } from "@/lib/format";
import { requireViewer } from "@/lib/session";
import { AuditList } from "@/components/audit-list";

export const metadata = { title: "상태 — Nyanotion" };

/** 지금 이 순간의 값이다. 구울 것이 하나도 없다. */
export const dynamic = "force-dynamic";

/**
 * 서버가 지금 어떤지.
 *
 * **가족이 "왜 느리지", "왜 냥이가 안 되지" 를 스스로 확인할 수 있어야 한다.** 그래서
 * 관리자 전용으로 두지 않았다 — 여기 있는 것은 전부 "이 집 서버 한 대의 상태"이고,
 * 남의 문서 내용은 한 글자도 나오지 않는다. 감사 로그만 **내가 들어갈 수 있는 공간**으로 좁힌다.
 */
export default async function StatusPage() {
  const viewer = await requireViewer();

  const [ai, queue, vector, index, log] = await Promise.all([
    aiStatus(),
    queueDepth(),
    hasVector(),
    indexCoverage(),
    listAudit(viewer.spaceIds, { limit: 40 }),
  ]);

  return (
    <>
      <TopBar crumbs={[{ id: null, title: "상태" }]} />
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            margin: "0 auto",
            padding: "48px 16px 120px",
            display: "flex",
            flexDirection: "column",
            gap: 30,
          }}
        >
          <Section title="냥이 (로컬 LLM)">
            <Row
              label="GPU"
              value={ai.mode === "gaming" ? "게임에 넘김 — 생성은 기다립니다" : "쓸 수 있음"}
              warn={ai.mode === "gaming"}
            />
            <Row
              label="모델 서버"
              value={ai.reachable ? "닿습니다" : "닿지 않습니다 — Ollama 가 떠 있나요?"}
              warn={!ai.reachable}
            />
            <Row label="답하는 모델" value={aiConfig.chatModel} />
            <Row label="임베딩 모델" value={`${aiConfig.embedModel} (1024차원)`} />
            {ai.usingFallback && <Row label="지금은" value="클라우드로 우회 중" warn />}
          </Section>

          <Section title="문서 질의 색인">
            <Row
              label="색인된 문서"
              value={`${index.indexed} / ${index.total}개 · 토막 ${index.chunks}개`}
              warn={index.total > 0 && index.indexed < index.total}
            />
            <Row
              label="줄 서 있는 일"
              value={`대기 ${queue.queued} · 도는 중 ${queue.running}${
                queue.failed > 0 ? ` · 실패 ${queue.failed}` : ""
              }`}
              warn={queue.failed > 0}
            />
            <Row
              label="벡터 색인"
              value={
                vector
                  ? "pgvector 켜짐 (빠름)"
                  : "꺼짐 — real[] 로 계산합니다 (느리지만 정확합니다)"
              }
              warn={!vector}
            />
            {queue.queued > 0 && (
              <Note>
                색인이 끝나기 전에는 물어봐도 그 문서가 근거로 안 나옵니다. 워커가 돌고 있으면
                곧 끝납니다.
              </Note>
            )}
            {!vector && (
              <Note>
                빠르게 하려면 <code>pwsh scripts/enable-vector.ps1</code> — 다시 임베딩하지
                않습니다.
              </Note>
            )}
          </Section>

          <Section title="서버">
            <Row label="환경" value={currentEnv()} />
            <Row label="이 프로세스가 산 시간" value={uptime()} />
            <Row label="메모리" value={`${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`} />
          </Section>

          <Section title="기록">
            <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.8, marginBottom: 12 }}>
              권한이 바뀐 일 · 밖으로 열린 일 · 돈이 나간 일 · 되돌릴 수 없게 지운 일만 적습니다.
              문서를 고친 기록은 여기 없습니다 (그건 문서 자신이 들고 있습니다).
            </p>
            <AuditList
              events={log.map((event) => ({
                id: event.id,
                when: formatWhen(event.at),
                who: event.actorName === "" ? "누군가" : event.actorName,
                action: event.action,
                summary: event.summary,
                documentId: event.subjectType === "document" ? event.subjectId : null,
              }))}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function uptime(): string {
  const seconds = Math.floor(process.uptime());
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink-2)",
          marginBottom: 10,
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line-soft)",
          borderRadius: 7,
          padding: "4px 14px",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "10px 0",
        borderBottom: "1px solid var(--line-soft)",
        fontSize: 13.5,
      }}
    >
      <span style={{ color: "var(--ink-3)" }}>{label}</span>
      <span style={{ color: warn ? "var(--ink)" : "var(--ink-2)", fontWeight: warn ? 500 : 400 }}>
        {value}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12.5,
        color: "var(--ink-3)",
        lineHeight: 1.8,
        padding: "10px 0",
      }}
    >
      {children}
    </p>
  );
}
