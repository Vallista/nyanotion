import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 서버 하나가 들고 있는 작은 상태. 지금은 GPU 모드 하나뿐이다.
 *
 * 파일이 아니라 DB 에 두는 이유: `apps/web` 과 `apps/worker` 가 서로 다른 프로세스인데
 * 같은 값을 봐야 하고, 재시작해도 남아야 한다.
 */
export const serverSetting = pgTable("server_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ServerSetting = typeof serverSetting.$inferSelect;
