/**
 * 도란 마크 — 지붕 아래 체크 하나. "우리 집 할 일을 같이 챙긴다"는 뜻.
 * 로그인·사이드바·설치·초대·공개 링크·오프라인 화면에 쓴다. 앱 아이콘은 `scripts/make-icons.mjs` 가 같은 path 로 만든다.
 */
export function BrandMark({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M3.6 10.6 12 4l8.4 6.6" />
      <path d="M5.9 9v9.3c0 .8.6 1.4 1.4 1.4h9.4c.8 0 1.4-.6 1.4-1.4V9" />
      <path d="m9.3 14.3 2 2 3.6-3.9" />
    </svg>
  );
}

/** 도우미(로컬 AI) 표시 — 반짝이 하나. 상태 배지·제안 막대·슬래시 메뉴에 쓴다. */
export function AssistantMark({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.15}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M11 4.5c.7 3.9 2.6 5.8 6.5 6.5-3.9.7-5.8 2.6-6.5 6.5-.7-3.9-2.6-5.8-6.5-6.5 3.9-.7 5.8-2.6 6.5-6.5z" />
      <path d="M18 15.5c.3 1.5 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5z" />
    </svg>
  );
}
