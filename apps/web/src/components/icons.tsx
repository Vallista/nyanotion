/**
 * 시안(Nyanotion 화면 설계)에서 그대로 옮긴 아이콘들. 16px 뷰박스, 선 두께 1.2 안팎.
 * 색은 넘기지 않고 currentColor 를 쓴다 — 부모가 정한다.
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

export function ChevronDown(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.4}>
      <path d="M4.2 6.2 8 10l3.8-3.8" />
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

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p} strokeWidth={p.strokeWidth ?? 1.25}>
      <circle cx="7.1" cy="7.1" r="4.5" />
      <path d="M10.4 10.4 13.8 13.8" />
    </Svg>
  );
}

/** 캣타워 — 층층이 쌓인 모양 */
export function TowerIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.6" y="10.6" width="10.8" height="3.2" rx="1.1" />
      <rect x="4.3" y="6.6" width="7.4" height="3.2" rx="1.1" />
      <rect x="6" y="2.6" width="4" height="3.2" rx="1.1" />
    </Svg>
  );
}

/** 모래상자 */
export function LitterBoxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.6 6h10.8l-.9 7a1.2 1.2 0 0 1-1.2 1H4.7a1.2 1.2 0 0 1-1.2-1z" />
      <path d="M2.6 6 4.1 3.2h7.8L13.4 6" />
      <path d="M6.6 9.4h.02M9.6 11h.02" />
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

export function GripIcon({ size = 13 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {[4.4, 8, 11.6].map((cy) => (
        <g key={cy}>
          <circle cx="5.2" cy={cy} r="1.05" fill="currentColor" />
          <circle cx="10.8" cy={cy} r="1.05" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

export function SidebarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.2" y="3" width="11.6" height="10" rx="1.4" />
      <path d="M6.4 3v10" />
    </Svg>
  );
}
