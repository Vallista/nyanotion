import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres `bytea`. Drizzle 에 기본 타입이 없어 직접 만든다.
 * Yjs 문서 상태(`document.ydoc_state`)가 이 타입이다 — base64 문자열로 돌리면 33% 더 크고
 * 인코딩 실수가 조용히 문서를 깨뜨린다.
 */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});

/**
 * Postgres `tsvector`. 전문검색용이며 항상 생성 칼럼이다 — 직접 쓰지 않는다.
 * 한국어 형태소 분석기가 기본으로 없으므로 `simple` 설정을 쓰고,
 * 부분 단어는 `pg_trgm` 이 맡는다 (docs/03-dev-environment.md).
 */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});
