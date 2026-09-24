import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * 형제 문서 사이의 정렬 키. 사이에 끼워 넣을 때 다른 행을 건드리지 않는다 —
 * 순번(0,1,2…) 재배열을 하면 한 번 옮길 때마다 형제 전체를 UPDATE 해야 한다.
 */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** 맨 뒤에 붙일 키. */
export function positionAfterLast(last: string | null): string {
  return generateKeyBetween(last, null);
}

/** 맨 앞에 붙일 키. */
export function positionBeforeFirst(first: string | null): string {
  return generateKeyBetween(null, first);
}

/** 한 번에 n개. */
export function positionsBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before, after, count);
}
