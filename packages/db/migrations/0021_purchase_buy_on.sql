-- 언제 살지. 그날이 되면 에이전트가 적어 둔 것을 찾기 시작한다 (`YYYY-MM-DD`, Asia/Seoul).
ALTER TABLE "purchase_item" ADD COLUMN IF NOT EXISTS "buy_on" text;
