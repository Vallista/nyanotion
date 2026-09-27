CREATE TABLE IF NOT EXISTS "ai_job" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"document_id" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"block_id" text DEFAULT '' NOT NULL,
	"heading" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" real[],
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_job_pending_idx" ON "ai_job" USING btree ("kind","document_id") WHERE "state" = 'queued';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_job_claim_idx" ON "ai_job" USING btree ("run_after") WHERE "state" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_chunk_slot_idx" ON "document_chunk" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_doc_idx" ON "document_chunk" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_fts_idx" ON "document_chunk" USING gin (to_tsvector('simple', "text"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_trgm_idx" ON "document_chunk" USING gin ("text" gin_trgm_ops);--> statement-breakpoint
CREATE OR REPLACE FUNCTION nyan_cosine_distance(a real[], b real[]) RETURNS float8
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
	SELECT 1 - (
		sum(x::float8 * y::float8)
		/ nullif(sqrt(sum(x::float8 * x::float8)) * sqrt(sum(y::float8 * y::float8)), 0)
	)
	  FROM unnest(a, b) AS t(x, y)
$$;
