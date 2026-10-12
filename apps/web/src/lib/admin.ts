import { firstAccountId } from "@nyanotion/db";
import { notFound } from "next/navigation";
import { requireViewer, type Viewer } from "./session";

/**
 * **서버 어드민** — 계정을 만들고 막는 사람. 가족 역할(owner/admin)과 다른 축이다.
 *
 * 누구인지는 설정이 정한다: `ADMIN_EMAILS` (쉼표 구분). 비어 있으면 **이 서버의 첫 계정.**
 * DB 에 "어드민" 칸을 두지 않은 이유 — 화면에서 어드민을 늘리는 길이 생기면 그 길 하나로
 * 서버 전체가 넘어간다. 설정 파일은 이 집 컴퓨터에 손을 댈 수 있는 사람만 바꾼다.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value !== "");
}

export async function isAdmin(viewer: Pick<Viewer, "userId" | "email">): Promise<boolean> {
  const emails = adminEmails();
  if (emails.length > 0) return emails.includes(viewer.email.toLowerCase());
  return (await firstAccountId()) === viewer.userId;
}

/**
 * 어드민 화면·동작의 문. **어드민이 아니면 404** — 그런 화면이 있다는 것도 알려 주지 않는다
 * (문서 권한과 같은 규칙).
 */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!(await isAdmin(viewer))) notFound();
  return viewer;
}

/** 서버 액션용 — 액션에서는 notFound 가 어색하므로 던진다. */
export async function assertAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!(await isAdmin(viewer))) throw new Error("어드민만 할 수 있습니다.");
  return viewer;
}
