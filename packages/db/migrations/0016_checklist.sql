CREATE TABLE IF NOT EXISTS "checklist" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"done_by" text,
	"due_on" text,
	"due_time" text,
	"repeat" text DEFAULT 'none' NOT NULL,
	"assignee_id" text,
	"position" text COLLATE "C" NOT NULL,
	"purchase_item_id" text,
	"reminded_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist" ADD CONSTRAINT "checklist_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist" ADD CONSTRAINT "checklist_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_checklist_id_checklist_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_done_by_user_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_purchase_item_id_purchase_item_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_item"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_item" ADD CONSTRAINT "checklist_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "checklist_document_unique" ON "checklist" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_item_list_idx" ON "checklist_item" USING btree ("checklist_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_item_due_idx" ON "checklist_item" USING btree ("done","due_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_item_purchase_idx" ON "checklist_item" USING btree ("purchase_item_id");
