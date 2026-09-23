/** Nyanotion 마크. 고양이는 여기, 빈 화면 일러스트, 냥이 아이콘 세 군데에만 쓴다. */
export function CatMark({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
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
      <path d="M4.4 9.6V3.6l4.5 2.9" />
      <path d="M19.6 9.6V3.6l-4.5 2.9" />
      <path d="M4.4 9.6c0-.7 3.4-2.8 7.6-2.8s7.6 2.1 7.6 2.8c0 5.4-3.4 9.4-7.6 9.4s-7.6-4-7.6-9.4z" />
      <path d="M9.2 12.3v.9M14.8 12.3v.9" />
      <path d="M10.9 15.4c.7.7 1.5.7 2.2 0" />
    </svg>
  );
}
