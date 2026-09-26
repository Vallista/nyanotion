CREATE TABLE IF NOT EXISTS "collection_item" (
	"collection_id" text NOT NULL,
	"document_id" text NOT NULL,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_item_collection_id_document_id_pk" PRIMARY KEY("collection_id","document_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_value" (
	"document_id" text NOT NULL,
	"property_id" text NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_value_document_id_property_id_pk" PRIMARY KEY("document_id","property_id")
);
--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "source" text DEFAULT 'filter' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property" ADD CONSTRAINT "property_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_value" ADD CONSTRAINT "property_value_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_value" ADD CONSTRAINT "property_value_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "collection_item_order_idx" ON "collection_item" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_collection_idx" ON "property" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_value_property_idx" ON "property_value" USING btree ("property_id");