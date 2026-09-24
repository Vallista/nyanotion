import { personalSpaceOf } from "@nyanotion/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  /** M1 에서는 개인 space 하나. M4 에서 가족 space 가 붙는다. */
  spaceId: string;
  spaceName: string;
};

/**
 * 로그인과 space 를 한 번에 확인한다. 없으면 /login 으로 보낸다.
 * M4 부터는 여기가 아니라 access.ts 가 문서별 권한을 판정한다 — 이 함수는 "누구인가"까지만.
 */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect("/login");

  const space = await personalSpaceOf(session.user.id);
  if (space === null) {
    // 가입 훅이 만들어 줬어야 한다. 없으면 데이터가 어긋난 상태다.
    throw new Error("개인 space 가 없습니다. 가입 훅이 실패했을 수 있습니다.");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    spaceId: space.id,
    spaceName: space.name,
  };
}
