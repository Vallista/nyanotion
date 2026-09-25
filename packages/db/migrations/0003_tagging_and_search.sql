CREATE TABLE IF NOT EXISTS "collection" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"filter_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"view" text DEFAULT 'list' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_tag" (
	"document_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "document_tag_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "favorite" (
	"user_id" text NOT NULL,
	"document_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(text_plain, ''))) STORED;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection" ADD CONSTRAINT "collection_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection" ADD CONSTRAINT "collection_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tag" ADD CONSTRAINT "document_tag_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tag" ADD CONSTRAINT "document_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "favorite" ADD CONSTRAINT "favorite_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tag" ADD CONSTRAINT "tag_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_space_idx" ON "collection" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tag_tag_idx" ON "document_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_space_name_uidx" ON "tag" USING btree ("space_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_search_idx" ON "document" USING gin ("search_tsv");--> statement-breakpoint
-- 한국어에는 형태소 분석기가 기본으로 없어 to_tsvector('simple') 는 띄어쓰기로만 쪼갠다.
-- "장보" 로 "장보기" 를 찾으려면 부분 문자열 검색이 필요하다 → trigram 색인.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_title_trgm_idx" ON "document" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_text_trgm_idx" ON "document" USING gin ("text_plain" gin_trgm_ops);
