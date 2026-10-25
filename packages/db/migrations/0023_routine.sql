-- 루틴(습관) — Bento(맥) · iPhone 앱이 같이 쓰는 사람 한 명의 것. 동기화 규칙은 체크리스트와 같다 (docs/13-sync.md)
CREATE SEQUENCE IF NOT EXISTS "routine_rev_seq";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routine" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"color" text DEFAULT 'blue' NOT NULL,
	"slot" text DEFAULT 'anytime' NOT NULL,
	"freq" text DEFAULT 'daily' NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goal_min" integer,
	"start_date" text NOT NULL,
	"archived_at" text,
	"pauses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"rev" bigint DEFAULT nextval('routine_rev_seq') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routine" ADD CONSTRAINT "routine_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routine_user_rev_idx" ON "routine" USING btree ("user_id","rev");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routine_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"routine_id" text NOT NULL,
	"date" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"secs" integer DEFAULT 0 NOT NULL,
	"sessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"rev" bigint DEFAULT nextval('routine_rev_seq') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routine_log" ADD CONSTRAINT "routine_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routine_log_user_rev_idx" ON "routine_log" USING btree ("user_id","rev");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "routine_log_user_day_unique" ON "routine_log" USING btree ("user_id","routine_id","date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routine_timer" (
	"user_id" text PRIMARY KEY NOT NULL,
	"routine_id" text,
	"date" text,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rev" bigint DEFAULT nextval('routine_rev_seq') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "routine_timer" ADD CONSTRAINT "routine_timer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
