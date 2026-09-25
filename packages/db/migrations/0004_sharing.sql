CREATE TABLE IF NOT EXISTS "document_share" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"role" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_link" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_share" ADD CONSTRAINT "document_share_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_share" ADD CONSTRAINT "document_share_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_link" ADD CONSTRAINT "public_link_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_link" ADD CONSTRAINT "public_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_share_unique" ON "document_share" USING btree ("document_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_share_subject_idx" ON "document_share" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_share_document_idx" ON "document_share" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_link_document_idx" ON "public_link" USING btree ("document_id");