/**
 * 아주 단순한 레이트 리밋.
 *
 * **이건 DDoS 방어가 아니다.** 이 서버는 터널 뒤에 있고 로그인해야 들어온다 — 밖에서 때리는
 * 것보다 **안에서 새는 것**이 현실적인 위험이다. 재시도 루프에 빠진 폰, `setInterval` 을
 * 잘못 건 탭, 혼자 스무 번 물어보는 사람 하나가 GPU 나 디스크를 다 먹는 것을 막는 게 목적이다.
 *
 * 그래서 메모리에 둔다 — 서버가 한 프로세스고, 재시작하면 잊어도 되는 종류의 상태다.
 * DB 에 두면 막으려는 비용(질의)을 막는 방법으로 쓰게 된다.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** 새는 것을 막자고 메모리가 새면 안 된다 — 가끔 지난 것을 치운다. */
let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type Limit = {
  /** 창 하나에서 몇 번까지. */
  max: number;
  /** 창 길이(밀리초). */
  windowMs: number;
};

/**
 * 값이 비싼 순서대로 —
 * `ask` 는 임베딩 + 생성이라 GPU 를 두 번 쓴다. `write` 는 GPU 한 번.
 * `upload` 는 디스크. `ticket`·`mention` 은 싸지만 자동으로 도는 자리라 상한을 둔다.
 */
export const LIMITS = {
  ask: { max: 20, windowMs: 5 * 60_000 },
  write: { max: 40, windowMs: 5 * 60_000 },
  upload: { max: 60, windowMs: 10 * 60_000 },
  ticket: { max: 120, windowMs: 60_000 },
  mention: { max: 300, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

export type Verdict = {
  ok: boolean;
  /** 남은 횟수. */
  left: number;
  /** 몇 초 뒤에 풀리는지. */
  retryAfterSeconds: number;
};

/** 한 번 쓴다. `ok: false` 면 부르는 쪽이 429 로 끝내야 한다. */
export function take(name: LimitName, who: string): Verdict {
  const limit: Limit = LIMITS[name];
  const now = Date.now();
  sweep(now);

  const key = `${name}:${who}`;
  const bucket = buckets.get(key);
  if (bucket === undefined || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { ok: true, left: limit.max - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit.max) {
    return {
      ok: false,
      left: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { ok: true, left: limit.max - bucket.count, retryAfterSeconds: 0 };
}

/**
 * 막혔을 때 돌려줄 응답. **왜 막혔는지와 언제 풀리는지를 말한다** —
 * 가족이 쓰는 앱에서 "429" 만 뜨면 고장으로 보인다.
 */
export function tooManyRequests(verdict: Verdict, what: string): Response {
  return Response.json(
    {
      error: `${what}를 너무 자주 했습니다. ${verdict.retryAfterSeconds}초 뒤에 다시 해 주세요.`,
      retryAfter: verdict.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "retry-after": String(verdict.retryAfterSeconds) },
    },
  );
}

/** 지금 몇 개의 통이 살아 있는지 — 상태 화면이 본다. */
export function activeBuckets(): number {
  return buckets.size;
}
