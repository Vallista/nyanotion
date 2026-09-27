import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { createPersonalSpace, db, hasOpenInvitation, isFirstUser, schema } from "@nyanotion/db";

/** 가족만 쓴다 — 초대 없이는 계정이 생기지 않는다. ARCHITECTURE.md §7 */
const allowPublicSignup = process.env.ALLOW_PUBLIC_SIGNUP === "true";

/**
 * 이 서버를 어떤 주소로 열어도 로그인이 되게 한다.
 *
 * 집 서버는 한 대인데 주소가 여럿이다 — `localhost`, 집 랜 IP, Tailscale IP, 나중엔 터널 도메인.
 * Better Auth 는 Origin 이 이 목록에 없으면 `invalid origin` 으로 막는다 (CSRF 방어).
 * 그래서 목록을 지우는 대신 실제로 쓰는 주소만 `.env` 의 `TRUSTED_ORIGINS` 에 적는다.
 * 쉼표로 구분하고, `https://*.example.com` 같은 와일드카드도 된다.
 */
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  ...(process.env.TRUSTED_ORIGINS ?? "").split(","),
]
  .map((value) => value?.trim())
  .filter((value): value is string => value !== undefined && value !== "");

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  /**
   * 로그인·가입 시도에 상한을 둔다. 비밀번호를 찍어 보는 것을 늦추는 용도다 —
   * 가족이 쓰다가 걸릴 만한 숫자는 아니다 (1분에 10번).
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  plugins: [organization(), nextCookies()],
  databaseHooks: {
    user: {
      create: {
        async before(newUser) {
          if (allowPublicSignup) return;
          if (await isFirstUser()) return;
          if (await hasOpenInvitation(newUser.email)) return;
          throw new APIError("FORBIDDEN", {
            message: "초대를 받은 주소만 가입할 수 있습니다.",
          });
        },
        async after(createdUser) {
          await createPersonalSpace(createdUser.id);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
