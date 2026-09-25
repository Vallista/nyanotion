import Link from "next/link";
import { formatWhen } from "@/lib/format";
import { displayTitle } from "@/lib/tree";
import { PageIcon } from "./icons";

export type TableRow = {
  id: string;
  title: string;
  snippet: string;
  updatedAt: Date;
  tags: string[];
};

/**
 * 모음의 두 가지 모습. 표는 좁은 화면에서 가로로 넘치므로 스스로 스크롤한다 —
 * 본문이 가로로 밀리면 안 된다.
 */
export function DocumentTable({ rows, view }: { rows: TableRow[]; view: "list" | "table" }) {
  if (view === "list") {
    return (
      <ul style={{ padding: 0 }}>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/d/${row.id}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 8px",
                border: 0,
                color: "var(--ink)",
                borderBottom: "1px solid var(--line-soft)",
              }}
            >
              <span style={{ display: "flex", color: "var(--ink-4)", marginTop: 3 }}>
                <PageIcon size={15} />
              </span>
              <span style={{ flexGrow: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5 }}>{displayTitle(row.title)}</span>
                {row.snippet !== "" && (
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: "var(--ink-3)",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.snippet}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", flexShrink: 0, marginTop: 3 }}>
                {formatWhen(row.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <Th>제목</Th>
            <Th>태그</Th>
            <Th align="right">수정</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <td style={{ padding: "9px 10px 9px 0" }}>
                <Link
                  href={`/d/${row.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: 0,
                    color: "var(--ink)",
                    fontSize: 14,
                  }}
                >
                  <span style={{ display: "flex", color: "var(--ink-4)" }}>
                    <PageIcon size={14} />
                  </span>
                  {displayTitle(row.title)}
                </Link>
              </td>
              <td style={{ padding: "9px 10px" }}>
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {row.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 18,
                        padding: "0 6px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--chip)",
                        fontSize: 11,
                        color: "var(--ink-3)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              </td>
              <td
                style={{
                  padding: "9px 0 9px 10px",
                  textAlign: "right",
                  fontSize: 12,
                  color: "var(--ink-3)",
                  whiteSpace: "nowrap",
                }}
              >
                {formatWhen(row.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: align === "right" ? "0 0 8px 10px" : "0 10px 8px 0",
        fontSize: 11.5,
        fontWeight: 500,
        color: "var(--ink-3)",
        letterSpacing: "0.01em",
        borderBottom: "1px solid var(--line)",
      }}
    >
      {children}
    </th>
  );
}
