-- 외부 캘린더 구독(iCal) · 그 일정을 가져다 둔 사본
CREATE TABLE IF NOT EXISTS "calendar_feed" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"color" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_feed" ADD CONSTRAINT "calendar_feed_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_feed_space_idx" ON "calendar_feed" USING btree ("space_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_event" (
	"id" text PRIMARY KEY NOT NULL,
	"feed_id" text NOT NULL,
	"uid" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"starts_on" text NOT NULL,
	"start_time" text,
	"ends_on" text NOT NULL,
	"end_time" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calendar_event" ADD CONSTRAINT "calendar_event_feed_id_calendar_feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."calendar_feed"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_event_range_idx" ON "calendar_event" USING btree ("feed_id","starts_on","ends_on");
