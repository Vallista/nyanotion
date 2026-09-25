import { effectiveRole, spacesForUser, type SpaceAccess } from "@nyanotion/auth";
import { getDocumentById, roleInFamily, type Document } from "@nyanotion/db";
import { roleAllows, type DocumentRole } from "@nyanotion/shared";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "./auth";

export type Viewer = {
  userId: string;
  email: string;
  name: string;
  /** 개인 space 하나와, 내가 속한 가족들의 space. */
  spaces: SpaceAccess[];
  personalSpace: SpaceAccess;
  /** 질의에 넘길 space id 목록 — "내가 들어갈 수 있는 곳" 그 자체다. */
  spaceIds: string[];
};

/** 로그인과 들어갈 수 있는 space 를 한 번에 확인한다. 없으면 /login 으로 보낸다. */
export async function requireViewer(): Promise<Viewer> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) redirect("/login");

  const spaces = await spacesForUser(session.user.id);
  const personalSpace = spaces.find((item) => item.kind === "personal");
  if (personalSpace === undefined) {
    // 가입 훅이 만들어 줬어야 한다. 없으면 데이터가 어긋난 상태다.
    throw new Error("개인 space 가 없습니다. 가입 훅이 실패했을 수 있습니다.");
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    spaces,
    personalSpace,
    spaceIds: spaces.map((item) => item.id),
  };
}

/**
 * 문서 하나를 권한과 함께 가져온다. **문서에 닿는 모든 경로가 여기를 지나야 한다.**
 *
 * 권한이 없으면 404 로 끝낸다 — 403 과 구분하면 "그 문서가 있긴 하다"를 알려 주게 된다.
 */
export async function requireDocument(
  documentId: string,
  need: DocumentRole = "viewer",
): Promise<{ viewer: Viewer; doc: Document; role: DocumentRole }> {
  const viewer = await requireViewer();
  const role = await effectiveRole(viewer.userId, documentId);
  if (role === null || !roleAllows(role, need)) notFound();

  const doc = await getDocumentById(documentId);
  if (doc === null) notFound();
  return { viewer, doc, role };
}

/** 서버 액션용 — 권한이 없으면 던진다 (액션에서는 notFound 가 어색하다). */
export async function assertCanWrite(
  documentId: string,
  need: DocumentRole = "editor",
): Promise<Viewer> {
  const viewer = await requireViewer();
  const role = await effectiveRole(viewer.userId, documentId);
  if (role === null || !roleAllows(role, need)) {
    throw new Error("이 문서를 고칠 권한이 없습니다.");
  }
  return viewer;
}

/**
 * 가족 수준 행위(초대·역할 바꾸기·내보내기)는 owner 나 admin 만.
 * **가족 역할과 문서 권한을 섞지 않는다** — 문서는 access.ts 가 따로 판정한다.
 */
export async function requireFamilyAdmin(organizationId: string): Promise<Viewer> {
  const viewer = await requireViewer();
  const role = await roleInFamily(organizationId, viewer.userId);
  if (role !== "owner" && role !== "admin") {
    throw new Error("이 가족을 관리할 권한이 없습니다.");
  }
  return viewer;
}

/** 문서를 공유·링크로 여는 건 그 문서의 owner 만. */
export async function requireDocumentOwner(documentId: string): Promise<Viewer> {
  return assertCanWrite(documentId, "owner");
}
