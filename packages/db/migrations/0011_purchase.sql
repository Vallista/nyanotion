CREATE TABLE IF NOT EXISTS "purchase_item" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"state" text DEFAULT 'listed' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"max_price_krw" integer,
	"needed_by" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"price_krw" integer NOT NULL,
	"shipping_krw" integer DEFAULT 0 NOT NULL,
	"url" text NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"seller" text DEFAULT '' NOT NULL,
	"chosen" boolean DEFAULT false NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"offer_id" text,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"total_krw" integer NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancellable_until" timestamp with time zone NOT NULL,
	"placed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"external_id" text DEFAULT '' NOT NULL,
	"failure" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_item" ADD CONSTRAINT "purchase_item_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_item" ADD CONSTRAINT "purchase_item_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_offer" ADD CONSTRAINT "purchase_offer_item_id_purchase_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_item_id_purchase_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_offer_id_purchase_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."purchase_offer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_item_document_unique" ON "purchase_item" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_item_state_idx" ON "purchase_item" USING btree ("state","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_offer_item_idx" ON "purchase_offer" USING btree ("item_id","price_krw");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_order_item_idx" ON "purchase_order" USING btree ("item_id","approved_at");
