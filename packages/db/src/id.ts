import { init } from "@paralleldrive/cuid2";

/** 모든 테이블의 id. 24자 cuid2 — 정렬 가능하지 않고, 추측하기 어렵다. */
export const newId = init({ length: 24 });
