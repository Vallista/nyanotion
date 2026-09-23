import { defineConfig } from "drizzle-kit";
import { loadEnv } from "./src/env";

loadEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_URL! },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
