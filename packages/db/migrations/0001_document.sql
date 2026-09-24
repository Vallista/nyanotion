CREATE TABLE IF NOT EXISTS "document" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"parent_id" text,
	"position" text NOT NULL,
	"type" text DEFAULT 'page' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"icon" text,
	"content_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ydoc_state" text,
	"text_plain" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"is_template" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_parent_id_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document" ADD CONSTRAINT "document_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tree_idx" ON "document" USING btree ("space_id","parent_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_live_idx" ON "document" USING btree ("space_id") WHERE "document"."archived_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_parent_idx" ON "document" USING btree ("parent_id");