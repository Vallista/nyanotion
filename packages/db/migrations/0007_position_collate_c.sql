-- 정렬 키(fractional index)는 **바이트 순서**를 전제한다.
-- 이 DB 의 기본 콜레이션은 Korean_Korea.949 라 'a0' 를 'Zz' 보다 앞에 놓는데,
-- 맨 앞에 끼워 넣을 때 생기는 키가 바로 'Zz' 꼴이라 순서가 뒤집힌다.
--
-- document.position 에도 같은 문제가 잠복해 있었다 — 아직 맨 앞으로 끈 적이 없어 안 드러났을 뿐이다.
-- 두 칼럼 모두 C 콜레이션(바이트 순서)으로 고정한다.
ALTER TABLE "document" ALTER COLUMN "position" TYPE text COLLATE "C";--> statement-breakpoint
ALTER TABLE "collection_item" ALTER COLUMN "position" TYPE text COLLATE "C";
