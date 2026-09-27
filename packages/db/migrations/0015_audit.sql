CREATE TABLE IF NOT EXISTS "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"space_id" text,
	"subject_type" text DEFAULT '' NOT NULL,
	"subject_id" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_recent_idx" ON "audit_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_space_idx" ON "audit_event" USING btree ("space_id","at");
