/**
 * 사용자마다 고정된 색 하나. 지금은 Yjs 협업 옵션이 요구해서 쓰고,
 * 나중에 커서·이름표가 들어오면 그때 화면에 보인다.
 *
 * 다른 기기에도 그대로 가므로 CSS 변수가 아니라 값이다 — 라이트·다크 모두에서 보이는 시스템 색만.
 */
const PALETTE = ["#007aff", "#ff9500", "#af52de", "#34c759", "#ff2d55", "#a2845e"] as const;

export function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length] ?? PALETTE[0];
}
