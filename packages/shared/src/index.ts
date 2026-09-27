export * from "./ai-tasks";
export * from "./ticket";
export * from "./blocks";
export * from "./chunk";
export * from "./rag-prompts";
export * from "./position";

/**
 * 서버·클라이언트·워커가 함께 쓰는 타입과 규칙.
 * 여기에는 런타임 의존이 거의 없어야 한다 (Next·Drizzle·DOM 모두 모르는 코드).
 */

/** 문서에 대한 권한. 낮은 것부터 높은 순. */
export const DOCUMENT_ROLES = ["viewer", "commenter", "editor", "owner"] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

/** 가족(조직) 안에서의 역할. 문서 권한과 섞지 않는다 — 가족 수준 행위에만 쓴다. */
export const FAMILY_ROLES = ["guest", "member", "admin", "owner"] as const;
export type FamilyRole = (typeof FAMILY_ROLES)[number];

/** space 종류. 개인과 가족을 하나의 개념으로 묶는다. */
export type SpaceKind = "personal" | "org";

const documentRank = new Map<DocumentRole, number>(DOCUMENT_ROLES.map((r, i) => [r, i]));

/** 둘 중 더 강한 권한. 실효 권한은 여러 출처의 최댓값이다. */
export function strongerRole(a: DocumentRole | null, b: DocumentRole | null): DocumentRole | null {
  if (a === null) return b;
  if (b === null) return a;
  return (documentRank.get(a) ?? 0) >= (documentRank.get(b) ?? 0) ? a : b;
}

/** `have` 로 `needed` 를 할 수 있는가. */
export function roleAllows(have: DocumentRole | null, needed: DocumentRole): boolean {
  if (have === null) return false;
  return (documentRank.get(have) ?? 0) >= (documentRank.get(needed) ?? 0);
}

/** 가족 역할이 그 가족 space 문서에 대해 갖는 기본 문서 권한. */
export function familyRoleToDocumentRole(role: FamilyRole): DocumentRole | null {
  switch (role) {
    case "owner":
    case "admin":
      return "owner";
    case "member":
      return "editor";
    case "guest":
      return null;
  }
}
