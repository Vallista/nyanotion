CREATE TABLE IF NOT EXISTS "comment_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"block_id" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_thread_id_comment_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_thread_document_idx" ON "comment_thread" USING btree ("document_id","resolved");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_thread_block_idx" ON "comment_thread" USING btree ("document_id","block_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comment_thread_idx" ON "comment" USING btree ("thread_id","created_at");
