-- 체크리스트 폴더 · Bento 필드 · 동기화(rev · 지운 표시) · 개인 토큰
CREATE SEQUENCE IF NOT EXISTS "checklist_rev_seq";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checklist_folder" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"rev" bigint DEFAULT nextval('checklist_rev_seq') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_folder" ADD CONSTRAINT "checklist_folder_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_folder_rev_idx" ON "checklist_folder" USING btree ("checklist_id","rev");
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "folder_id" text;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "start_at" text;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "est_min" integer;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "color" text;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "kind" text;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "group_name" text;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "subtasks" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "checklist_item" ADD COLUMN IF NOT EXISTS "rev" bigint DEFAULT nextval('checklist_rev_seq') NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_item_rev_idx" ON "checklist_item" USING btree ("checklist_id","rev");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_token_hash_unique" ON "api_token" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_token_user_idx" ON "api_token" USING btree ("user_id");
