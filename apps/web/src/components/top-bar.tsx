import Link from "next/link";

/** 46px 상단 바. 왼쪽은 빵가루, 오른쪽은 문서 동작. 시안 03 과 같은 높이·선. */
export function TopBar({
  crumbs,
  right,
}: {
  crumbs: { id: string | null; title: string }[];
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
            <span key={`${crumb.id ?? "root"}-${index}`} style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              {index > 0 && (
                <span style={{ color: "var(--ink-4)", fontSize: 12.5, padding: "0 1px" }}>/</span>
              )}
              {crumb.id === null || last ? (
                label
              ) : (
                <Link href={`/d/${crumb.id}`} style={{ border: 0, color: "inherit", minWidth: 0 }}>
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
