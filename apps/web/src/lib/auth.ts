import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import { createPersonalSpace, db, hasOpenInvitation, isFirstUser, schema } from "@nyanotion/db";

/** 가족만 쓴다 — 초대 없이는 계정이 생기지 않는다. ARCHITECTURE.md §7 */
const allowPublicSignup = process.env.ALLOW_PUBLIC_SIGNUP === "true";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
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
