/**
 * 사용자마다 고정된 색 하나. 지금은 Yjs 협업 옵션이 요구해서 쓰고,
 * 나중에 커서·이름표가 들어오면 그때 화면에 보인다.
 *
 * 시안의 절제된 팔레트 안에서만 고른다 — 형광색을 만들지 말 것.
 */
const PALETTE = ["#4c6b57", "#3f5e77", "#6b5570", "#8a5a3c", "#5a6b4c", "#77553f"] as const;

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0];
}
