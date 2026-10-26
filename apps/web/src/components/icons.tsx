/**
 * 시안(도란 화면 설계)에서 그대로 옮긴 아이콘들. 16px 뷰박스, 선 두께 1.2 안팎.
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

/** 폴더 — 문서를 묶어 두는 문서. 열면 여느 문서처럼 본문도 있다. */
export function FolderIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.2 4.4a1.2 1.2 0 0 1 1.2-1.2h2.8l1.4 1.5h5a1.2 1.2 0 0 1 1.2 1.2v6.2a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z" />
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

/** 캘린더 — 첫 화면 */
export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.6" y="3.4" width="10.8" height="10" rx="1.4" />
      <path d="M2.6 6.6h10.8M5.6 2.2v2.4M10.4 2.2v2.4" />
      <path d="M5.4 9.4h.02M8 9.4h.02M10.6 9.4h.02M5.4 11.6h.02M8 11.6h.02" />
    </Svg>
  );
}

/** 휴지통 */
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

/** 체크리스트 — 체크 표시 둘과 줄. */
export function ChecklistIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.2 4.2l1.3 1.3 2.2-2.4M2.2 10.2l1.3 1.3 2.2-2.4" />
      <path d="M8 4.4h6M8 10.4h6" />
    </Svg>
  );
}

/** 루틴 — 한 바퀴 도는 화살표. */
export function RoutineIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.75" />
      <path d="M11.9 1.9v2.6h-2.6" />
      <path d="m6 8.1 1.4 1.4 2.6-2.8" />
    </Svg>
  );
}

/** 오늘 — 해가 반쯤 뜬 지평선. */
export function TodayIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 11.5h12" />
      <path d="M4.6 11.5a3.4 3.4 0 0 1 6.8 0" />
      <path d="M8 3.2v1.6M3.6 5.4l1.1 1.1M12.4 5.4l-1.1 1.1" />
    </Svg>
  );
}

/** 메모함 — 받은 것을 담는 쟁반. */
export function InboxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 9.2 4.3 3.6c.1-.4.5-.6.9-.6h5.6c.4 0 .8.2.9.6l1.8 5.6" />
      <path d="M2.5 9.2v2.8c0 .6.4 1 1 1h9c.6 0 1-.4 1-1V9.2h-3.2l-.8 1.5H6.5l-.8-1.5z" />
    </Svg>
  );
}

/** 기록 — 펼친 공책. */
export function JournalIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4.2C6.8 3.3 5 3 2.6 3.1v8.8c2.4-.1 4.2.2 5.4 1.1 1.2-.9 3-1.2 5.4-1.1V3.1C11 3 9.2 3.3 8 4.2z" />
      <path d="M8 4.2V13" />
    </Svg>
  );
}

/** 재생 · 멈춤 — 타이머 단추. 채운 모양이라 선 대신 면이다. */
export function PlayIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ display: "block" }}>
      <path d="M3.2 1.8v8.4L10 6z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" style={{ display: "block" }}>
      <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1" fill="currentColor" />
    </svg>
  );
}

/** 빈 체크 상자와 찬 체크 상자. 터치로 누를 자리라 테두리를 굵게 둔다. */
export function CheckBoxIcon({ size = 18, checked = false }: IconProps & { checked?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect
        x="1.75"
        y="1.75"
        width="14.5"
        height="14.5"
        rx="3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill={checked ? "currentColor" : "none"}
      />
      {checked && (
        <path
          d="M5.2 9.2l2.5 2.5 5.1-5.4"
          stroke="var(--paper)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** 어드민 — 열쇠. */
export function KeyIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.2" cy="8" r="2.6" />
      <path d="M7.8 8h6.4M11.6 8v2.2M13.6 8v1.6" />
    </Svg>
  );
}
