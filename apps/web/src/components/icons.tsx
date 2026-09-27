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

/** 홈 화면에 추가 — 기기에 내려받는 모양 */
export function InstallIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 2.6v7.2" />
      <path d="m5.2 7.2 2.8 2.6 2.8-2.6" />
      <path d="M3 10.6v1.8a1.2 1.2 0 0 0 1.2 1.2h7.6a1.2 1.2 0 0 0 1.2-1.2v-1.8" />
    </Svg>
  );
}

/** 츄르 — 즐겨찾기. 고양이 간식 스틱 모양. */
export function ChuruIcon({ size = 15, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path
        d="M10.6 1.9 3.1 9.4a2.3 2.3 0 0 0-.6 1.1l-.6 2.6 2.6-.6c.42-.1.8-.31 1.1-.6l7.5-7.5a1.9 1.9 0 0 0-2.5-2.5z"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.18 : 0}
      />
      <path d="M9.6 3 13 6.4" />
    </svg>
  );
}

/** 모음 — 저장된 필터. 겹쳐 놓은 카드 모양. */
export function CollectionIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.4" y="5.4" width="11.2" height="8.2" rx="1.2" />
      <path d="M4.2 3.4h7.6M5.2 1.6h5.6" />
    </Svg>
  );
}

/** 가족 — 사람 둘 */
export function FamilyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="6" cy="5.4" r="2.3" />
      <path d="M1.9 13.4c0-2.3 1.8-3.8 4.1-3.8s4.1 1.5 4.1 3.8" />
      <path d="M11 4.1a2.1 2.1 0 0 1 0 4M11.6 9.9c1.7.3 2.9 1.6 2.9 3.5" />
    </Svg>
  );
}

/** 공유 — 시안 03 의 상단 바 아이콘 */
export function ShareIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6.6 8.9 9.4 7.1M6.6 7.1 9.4 8.9" />
      <circle cx="4.7" cy="8" r="1.9" />
      <circle cx="11.3" cy="4.4" r="1.9" />
      <circle cx="11.3" cy="11.6" r="1.9" />
    </Svg>
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

/** 살 것 — 장바구니 */
export function CartIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.9 2.4h1.8l1.7 7.4h6.3l1.6-5.3H4.4" />
      <circle cx="6.4" cy="12.7" r="1.1" />
      <circle cx="11.2" cy="12.7" r="1.1" />
    </Svg>
  );
}

/** 물어보기 — 말풍선 안의 물음표. 검색(돋보기)과 구별되어야 한다. */
export function AskIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 3.6h12v7.2H7.4L4.3 13.4v-2.6H2z" />
      <path d="M6.6 6.1a1.5 1.5 0 0 1 2.9.5c0 1-1.4 1-1.4 2" />
      <circle cx="8.1" cy="9.4" r="0.45" />
    </Svg>
  );
}

/** 상태 — 맥박 한 줄. */
export function PulseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M1.6 8h3l1.6-4.4 2.6 8.8L10.9 8h3.5" />
    </Svg>
  );
}
