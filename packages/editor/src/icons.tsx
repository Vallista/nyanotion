/**
 * 에디터가 쓰는 아이콘. 시안과 같은 규칙 — 16px 뷰박스, 선 두께 1.2 안팎, 색은 currentColor.
 *
 * 앱에도 같은 모양의 `components/icons.tsx` 가 있다. 일부러 나눠 두었다 —
 * 이 패키지가 앱을 import 하면 분리한 뜻이 없어진다. 겹치는 것은 넷뿐이라 복사가 싸다.
 */
type IconProps = { size?: number; strokeWidth?: number };

function Svg({
  size = 15,
  strokeWidth = 1.2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {children}
    </svg>
  );
}

export function PageIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.3 2.2H4.7A1.5 1.5 0 0 0 3.2 3.7v8.6a1.5 1.5 0 0 0 1.5 1.5h6.6a1.5 1.5 0 0 0 1.5-1.5V5.9z" />
      <path d="M9.3 2.2v3.7h3.5" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.3}>
      <path d="M8 3.3v9.4M3.3 8h9.4" />
    </Svg>
  );
}

export function DotsIcon({ size = 15 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <circle cx="3.6" cy="8" r=".95" fill="currentColor" />
      <circle cx="8" cy="8" r=".95" fill="currentColor" />
      <circle cx="12.4" cy="8" r=".95" fill="currentColor" />
    </svg>
  );
}

export function TableIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.2" />
      <path d="M2.4 6.4h11.2M6.4 6.4v6.4" />
    </Svg>
  );
}

/** 보드 — 세로로 선 칸들 */
export function BoardIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.2" y="3" width="3.4" height="10" rx="1" />
      <rect x="6.5" y="3" width="3.4" height="7" rx="1" />
      <rect x="10.8" y="3" width="3" height="9" rx="1" />
    </Svg>
  );
}

/** 달력 */
export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.4" y="3.6" width="11.2" height="10" rx="1.2" />
      <path d="M2.4 6.6h11.2M5.6 2.4v2.4M10.4 2.4v2.4" />
    </Svg>
  );
}

/** 콜아웃 — 말풍선 안의 느낌표 자리 */
export function CalloutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.4 9.6a1.6 1.6 0 0 1-1.6 1.6H6.2L3.2 13.8V4.2a1.6 1.6 0 0 1 1.6-1.6h7a1.6 1.6 0 0 1 1.6 1.6z" />
      <path d="M8.3 5.6v2.6M8.3 9.6h.02" />
    </Svg>
  );
}

/** 수식 — 시그마 */
export function MathIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M11.6 3.2H4.4l3.4 4.7-3.4 4.9h7.2" />
    </Svg>
  );
}

/** 멘션 — 골뱅이 */
export function MentionIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M10.4 5.6v3.2a1.8 1.8 0 0 0 3.2 0V8a5.6 5.6 0 1 0-2.2 4.4" />
    </Svg>
  );
}

/** 댓글 */
export function CommentIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.4 9.2a1.6 1.6 0 0 1-1.6 1.6H6.4L3.4 13.4V4.6A1.6 1.6 0 0 1 5 3h6.8a1.6 1.6 0 0 1 1.6 1.6z" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.5}>
      <path d="m3.4 8.4 3 3 6.2-6.8" />
    </Svg>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.3}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </Svg>
  );
}

export function ChevronDown(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.4}>
      <path d="M4.2 6.2 8 10l3.8-3.8" />
    </Svg>
  );
}

export function ChevronLeft(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.4}>
      <path d="M9.8 4.2 6 8l3.8 3.8" />
    </Svg>
  );
}

export function ChevronRight(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.4}>
      <path d="M6.2 4.2 10 8l-3.8 3.8" />
    </Svg>
  );
}
