-- 구매 기록이 살 것보다 오래 살게 한다.
--
-- 0011 에서는 purchase_order.item_id 가 cascade 라, 살 것을 목록에서 빼면 구매 기록까지
-- 사라졌다. "히스토리가 남는다" 가 이 기능의 요구사항 절반이므로 가리키는 것들을 전부
-- 끊어질 수 있게 바꾸고, 화면에 필요한 값은 주문 줄에 복사해 둔다.

ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "space_id" text;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "item_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN IF NOT EXISTS "document_id" text;--> statement-breakpoint

-- 이미 있는 줄의 값을 살 것 → 문서에서 채운다.
UPDATE "purchase_order" o
SET "space_id" = d."space_id",
    "document_id" = d."id",
    "item_title" = d."title"
FROM "purchase_item" i
JOIN "document" d ON d."id" = i."document_id"
WHERE o."item_id" = i."id" AND o."space_id" IS NULL;--> statement-breakpoint

-- 채울 수 없는 줄(살 것이 이미 없는 것)은 남겨 둘 근거가 없다. 새 표라 실제로는 없다.
DELETE FROM "purchase_order" WHERE "space_id" IS NULL;--> statement-breakpoint

ALTER TABLE "purchase_order" ALTER COLUMN "space_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order" ALTER COLUMN "item_id" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "purchase_order" DROP CONSTRAINT IF EXISTS "purchase_order_item_id_purchase_item_id_fk";--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_item_id_purchase_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "purchase_order_space_idx" ON "purchase_order" USING btree ("space_id","approved_at");
