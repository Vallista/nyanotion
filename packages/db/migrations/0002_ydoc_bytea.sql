-- ydoc_state 를 text → bytea 로. M2 부터 여기에 Yjs 문서 상태가 들어간다.
-- 지금까지 이 칼럼에 쓴 코드가 없어 전부 NULL 이므로 옮길 데이터가 없다 →
-- text 를 bytea 로 캐스팅할 수 없으니 칼럼을 지우고 다시 만든다.
ALTER TABLE "document" DROP COLUMN IF EXISTS "ydoc_state";--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "ydoc_state" bytea;
