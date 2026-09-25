import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * 문서 찾기.
 *
 * 한국어에는 Postgres 기본 형태소 분석기가 없다. `to_tsvector('simple')` 은 띄어쓰기로만 쪼개므로
 * "장보"로 "장보기"를 못 찾는다. 그래서 두 가지를 같이 쓴다:
 *   1. tsvector — 단어가 맞아떨어질 때 빠르고 순위도 매겨진다
 *   2. trigram(`pg_trgm`) — 부분 문자열과 오타를 잡는다
 * 가족 규모(문서 수백 개)에서는 이 조합으로 충분하다. 부족해지면 그때 형태소 분석기를 검토한다.
 */

export type SearchHit = {
  id: string;
  title: string;
  snippet: string;
  updatedAt: Date;
  score: number;
};

/** 원시 SQL 의 결과는 타입이 보장되지 않는다 — 드라이버가 무엇을 주든 받아 낸다. */
type Row = {
  id: string;
  title: string;
  text_plain: string;
  updated_at: unknown;
  score: unknown;
};

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 찾은 말 주변만 잘라 낸다. ts_headline 은 'simple' 설정에서 한국어를 잘 못 자른다. */
function snippetAround(text: string, query: string, width = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return "";
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return flat.length > width ? `${flat.slice(0, width)}…` : flat;
  const start = Math.max(0, at - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

export async function searchDocuments(
  spaceId: string,
  query: string,
  options: { limit?: number; tagIds?: string[] } = {},
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  const limit = options.limit ?? 20;
  const tagIds = options.tagIds ?? [];

  // 검색어가 없으면 태그 필터만 적용해 최근 순으로 준다 (팔레트를 열자마자 보이는 목록).
  const hasQuery = trimmed !== "";
  const pattern = `%${trimmed}%`;

  const rows = await db.execute<Row>(sql`
    select d.id,
           d.title,
           d.text_plain,
           d.updated_at,
           ${
             hasQuery
               ? sql`(
                   ts_rank(d.search_tsv, plainto_tsquery('simple', ${trimmed})) * 4
                   + similarity(d.title, ${trimmed}) * 3
                   + case when d.title ilike ${pattern} then 1.5 else 0 end
                   + case when d.text_plain ilike ${pattern} then 0.5 else 0 end
                 )`
               : sql`0`
           }::float8 as score
      from document d
     where d.space_id = ${spaceId}
       and d.archived_at is null
       ${
         hasQuery
           ? sql`and (
               d.search_tsv @@ plainto_tsquery('simple', ${trimmed})
               or d.title ilike ${pattern}
               or d.text_plain ilike ${pattern}
             )`
           : sql``
       }
       ${
         tagIds.length > 0
           ? sql`and exists (
               select 1 from document_tag dt
                where dt.document_id = d.id
                  and dt.tag_id in ${tagIds}
             )`
           : sql``
       }
     order by score desc, d.updated_at desc
     limit ${limit}
  `);

  return Array.from(rows).map((row) => ({
    id: row.id,
    title: row.title,
    snippet: snippetAround(row.text_plain ?? "", trimmed),
    updatedAt: asDate(row.updated_at),
    score: asNumber(row.score),
  }));
}
