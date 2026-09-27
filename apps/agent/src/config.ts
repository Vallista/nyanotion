import { loadEnv, optional } from "@nyanotion/db";
import { homedir } from "node:os";
import { resolve } from "node:path";

/**
 * 에이전트 설정.
 *
 * **브라우저 프로필은 저장소 밖에 둔다.** 그 안에 쿠팡·네이버 로그인 쿠키가 들어 있어서
 * 실수로 커밋될 여지를 아예 없애야 한다. 기본값은 홈 폴더다.
 */
export type Config = {
  /** 얼마나 자주 할 일을 확인하나. */
  pollMs: number;
  /** 크로미움 프로필 폴더. 로그인이 여기 남는다. */
  profileDir: string;
  /** 창을 띄울지. **기본은 띄운다** — 사람이 보고 있어야 안심하고 맡길 수 있다. */
  headed: boolean;
  naver: { clientId: string; clientSecret: string } | null;
  /** 한 번에 보여 줄 후보 수. 너무 많으면 고르기 어렵다. */
  maxOffers: number;
  /** 사이트 한 번 훑고 쉬는 시간. 예의이자 차단을 피하는 길. */
  politeMs: number;
};

export function readConfig(): Config {
  loadEnv();

  const id = optional("NAVER_CLIENT_ID", "");
  const secret = optional("NAVER_CLIENT_SECRET", "");

  return {
    pollMs: Number(optional("AGENT_POLL_MS", "15000")),
    profileDir: optional(
      "AGENT_PROFILE_DIR",
      resolve(homedir(), ".nyanotion", "browser-profile"),
    ),
    headed: optional("AGENT_HEADLESS", "0") !== "1",
    naver: id !== "" && secret !== "" ? { clientId: id, clientSecret: secret } : null,
    maxOffers: Number(optional("AGENT_MAX_OFFERS", "5")),
    politeMs: Number(optional("AGENT_POLITE_MS", "1500")),
  };
}

export function log(...parts: unknown[]): void {
  const now = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  console.log(`[${now}]`, ...parts);
}
