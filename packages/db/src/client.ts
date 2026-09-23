import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { required } from "./env";
import * as schema from "./schema/index";

const globalForDb = globalThis as unknown as {
  __nyanotionSql?: ReturnType<typeof postgres>;
};

// Next.js 개발 서버는 모듈을 다시 불러온다 → 연결이 쌓이지 않게 전역에 하나만 둔다.
const sql = globalForDb.__nyanotionSql ?? postgres(required("DATABASE_URL"), { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__nyanotionSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
export type Db = typeof db;
