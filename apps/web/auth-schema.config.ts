/**
 * @better-auth/cli generate 전용 설정.
 * 실제 DB·스키마를 불러오지 않는다 (스키마를 만들어 내는 게 목적이므로 순환이 된다).
 * 플러그인·옵션은 apps/web/src/lib/auth.ts 와 반드시 같게 유지할 것.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
