import Link from "next/link";

/** 46px 상단 바. 왼쪽은 빵가루, 오른쪽은 문서 동작. 시안 03 과 같은 높이·선. */
export function TopBar({
  crumbs,
  right,
}: {
  /** `href` 가 있으면 그리로, 없으면 `id` 의 문서로 간다. */
  crumbs: { id: string | null; title: string; href?: string }[];
  right?: React.ReactNode;
}) {
  return (
    <header
      style={{
        height: 46,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 18px 0 14px",
        borderBottom: "1px solid var(--line)",
        background: "var(--paper)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
          marginLeft: "var(--topbar-gutter, 0px)",
        }}
      >
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const label = (
            <span
              style={{
                fontSize: 13,
                color: last ? "var(--ink-2)" : "var(--ink-3)",
                padding: "2px 5px",
                borderRadius: "var(--radius)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 220,
                display: "inline-block",
              }}
            >
              {crumb.title}
            </span>
          );
          return (
            <span
              key={`${crumb.id ?? "root"}-${index}`}
              // 섹션으로 돌아가는 빵가루(체크리스트 등)는 짧으니 줄이지 않는다 — 폰에서 잘려 읽히지 않았다.
              style={{ display: "flex", alignItems: "center", minWidth: 0, flexShrink: crumb.href === undefined ? 1 : 0 }}
            >
              {index > 0 && (
                <span style={{ color: "var(--ink-4)", fontSize: 12.5, padding: "0 1px" }}>/</span>
              )}
              {last || (crumb.id === null && crumb.href === undefined) ? (
                label
              ) : (
                <Link href={crumb.href ?? `/d/${crumb.id}`} style={{ border: 0, color: "inherit", minWidth: 0 }}>
                  {label}
                </Link>
              )}
            </span>
          );
        })}
      </div>
      {right !== undefined && (
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {right}
        </span>
      )}
    </header>
  );
}
