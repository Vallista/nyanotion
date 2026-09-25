"use server";

import {
  acceptInvitation,
  archiveDocument,
  attachTag,
  createFamily,
  createPublicLink,
  createCollection,
  createDocument,
  deleteCollection,
  deleteTag,
  detachTag,
  emptyTrash,
  ensureTag,
  getDocumentById,
  inviteToFamily,
  moveDocument,
  removeMember,
  removeShare,
  renameFamily,
  renameDocument,
  renameTagName,
  restoreDocument,
  revokeInvitation,
  revokePublicLink,
  searchDocuments,
  setGpuMode,
  setMemberRole,
  toggleFavorite,
  updateCollection,
  upsertShare,
  userByEmail,
  type CollectionFilter,
  type CollectionView,
} from "@nyanotion/db";
import { unloadModels } from "@nyanotion/ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assertCanWrite,
  requireDocumentOwner,
  requireFamilyAdmin,
  requireViewer,
} from "./session";

/**
 * **모든 동작은 권한을 먼저 확인한다.**
 * 문서 하나를 건드리는 건 `assertCanWrite()`(= access.ts), 목록은 viewer.spaceIds 로 좁힌다.
 * 라우트에 조건을 손으로 짜 넣지 말 것.
 */

/* ---------------------------------------------------------------- 문서 */

export async function createDocumentAction(
  parentId: string | null,
  spaceId?: string,
): Promise<void> {
  const viewer = await requireViewer();

  // 하위 문서는 부모와 같은 space 에, 그리고 부모를 고칠 수 있어야 만든다.
  let targetSpace = spaceId ?? viewer.personalSpace.id;
  if (parentId !== null) {
    await assertCanWrite(parentId);
    const parent = await getDocumentById(parentId);
    if (parent === null) throw new Error("부모 문서를 찾을 수 없습니다.");
    targetSpace = parent.spaceId;
  } else if (!viewer.spaceIds.includes(targetSpace)) {
    throw new Error("이 공간에 문서를 만들 수 없습니다.");
  }

  const id = await createDocument({ spaceId: targetSpace, userId: viewer.userId, parentId });
  revalidatePath("/", "layout");
  redirect(`/d/${id}`);
}

export async function renameDocumentAction(id: string, title: string): Promise<void> {
  const viewer = await assertCanWrite(id);
  await renameDocument(id, title.slice(0, 300), viewer.userId);
  revalidatePath("/", "layout");
}

export async function moveDocumentAction(
  id: string,
  parentId: string | null,
  afterId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  await assertCanWrite(id);
  // 부모가 바뀌면 그 부모도 고칠 수 있어야 한다.
  if (parentId !== null) await assertCanWrite(parentId);
  const result = await moveDocument({ id, parentId, afterId });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function archiveDocumentAction(id: string): Promise<void> {
  await assertCanWrite(id);
  await archiveDocument(id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function restoreDocumentAction(id: string): Promise<void> {
  await assertCanWrite(id);
  await restoreDocument(id);
  revalidatePath("/", "layout");
}

/** 모래상자 비우기 — 내가 들어갈 수 있는 space 들에서만. */
export async function emptyTrashAction(): Promise<void> {
  const viewer = await requireViewer();
  await emptyTrash(viewer.spaceIds);
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------- 태그 · 츄르 · 검색 */

export async function searchAction(
  query: string,
  tagIds: string[] = [],
): Promise<{ id: string; title: string; snippet: string; updatedAt: string }[]> {
  const viewer = await requireViewer();
  const hits = await searchDocuments(viewer.spaceIds, query, { tagIds, limit: 20 });
  return hits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    snippet: hit.snippet,
    updatedAt: hit.updatedAt.toISOString(),
  }));
}

/** 켜고 끈다. 돌려주는 값은 바뀐 뒤 상태. 읽을 수만 있어도 츄르는 꽂을 수 있다. */
export async function toggleFavoriteAction(documentId: string): Promise<boolean> {
  const viewer = await assertCanWrite(documentId, "viewer");
  const on = await toggleFavorite(viewer.userId, documentId);
  revalidatePath("/", "layout");
  return on;
}

/** 이름으로 붙인다 — 없으면 만들고, 있으면 그걸 쓴다. 태그는 문서가 사는 space 에 만든다. */
export async function addTagAction(documentId: string, name: string): Promise<void> {
  await assertCanWrite(documentId);
  const doc = await getDocumentById(documentId);
  if (doc === null) return;
  const tagId = await ensureTag(doc.spaceId, name);
  await attachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function removeTagAction(documentId: string, tagId: string): Promise<void> {
  await assertCanWrite(documentId);
  await detachTag(documentId, tagId);
  revalidatePath("/", "layout");
}

export async function renameTagAction(tagId: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  for (const spaceId of viewer.spaceIds) await renameTagName(tagId, spaceId, name);
  revalidatePath("/", "layout");
}

/** 태그만 사라진다 — 달려 있던 문서는 그대로 남는다. */
export async function deleteTagAction(tagId: string): Promise<void> {
  const viewer = await requireViewer();
  for (const spaceId of viewer.spaceIds) await deleteTag(tagId, spaceId);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------------ 모음 */

export async function createCollectionAction(
  name: string,
  filter: CollectionFilter,
  view: CollectionView = "list",
  spaceId?: string,
): Promise<void> {
  const viewer = await requireViewer();
  const target = spaceId ?? viewer.personalSpace.id;
  if (!viewer.spaceIds.includes(target)) throw new Error("이 공간에 모음을 만들 수 없습니다.");
  const id = await createCollection({
    spaceId: target,
    userId: viewer.userId,
    name,
    filter,
    view,
  });
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

export async function updateCollectionAction(
  id: string,
  patch: { name?: string; filter?: CollectionFilter; view?: CollectionView },
): Promise<void> {
  const viewer = await requireViewer();
  await updateCollection(id, viewer.spaceIds, patch);
  revalidatePath("/", "layout");
}

/** 모음만 사라진다 — 문서는 그대로 남는다. */
export async function deleteCollectionAction(id: string): Promise<void> {
  const viewer = await requireViewer();
  await deleteCollection(id, viewer.spaceIds);
  revalidatePath("/", "layout");
  redirect("/");
}

/* ------------------------------------------------------------------ 가족 */

export async function createFamilyAction(name: string): Promise<void> {
  const viewer = await requireViewer();
  const { organizationId } = await createFamily({ name, ownerUserId: viewer.userId });
  revalidatePath("/", "layout");
  redirect(`/family/${organizationId}`);
}

export async function renameFamilyAction(organizationId: string, name: string): Promise<void> {
  await requireFamilyAdmin(organizationId);
  await renameFamily(organizationId, name);
  revalidatePath("/", "layout");
}

/** 초대장을 만들고 링크를 돌려준다. 메일 발송은 아직 없다 — 링크를 직접 전한다. */
export async function inviteToFamilyAction(
  organizationId: string,
  email: string,
  role: string,
): Promise<{ token: string }> {
  const viewer = await requireFamilyAdmin(organizationId);
  const token = await inviteToFamily({
    organizationId,
    email,
    role: role === "admin" || role === "guest" ? role : "member",
    inviterId: viewer.userId,
  });
  revalidatePath("/", "layout");
  return { token };
}

export async function revokeInvitationAction(
  organizationId: string,
  invitationId: string,
): Promise<void> {
  await requireFamilyAdmin(organizationId);
  await revokeInvitation(invitationId, organizationId);
  revalidatePath("/", "layout");
}

export async function setMemberRoleAction(
  organizationId: string,
  userId: string,
  role: string,
): Promise<void> {
  const viewer = await requireFamilyAdmin(organizationId);
  // 자기 자신을 강등해 가족에 owner 가 없어지는 일을 막는다.
  if (userId === viewer.userId && role !== "owner") {
    throw new Error("자기 역할은 스스로 낮출 수 없습니다.");
  }
  await setMemberRole(organizationId, userId, role);
  revalidatePath("/", "layout");
}

export async function removeMemberAction(organizationId: string, userId: string): Promise<void> {
  const viewer = await requireFamilyAdmin(organizationId);
  if (userId === viewer.userId) throw new Error("자기 자신을 내보낼 수 없습니다.");
  await removeMember(organizationId, userId);
  revalidatePath("/", "layout");
}

/** 초대 링크를 받아들인다. 로그인한 주소와 초대장 주소가 같아야 한다. */
export async function acceptInvitationAction(
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  const viewer = await requireViewer();
  const result = await acceptInvitation(token, viewer.userId, viewer.email);
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/* ------------------------------------------------------------------ 공유 */

/** 주소로 사람에게 공유한다. 아직 계정이 없으면 먼저 가족으로 초대해야 한다. */
export async function shareWithPersonAction(
  documentId: string,
  email: string,
  role: string,
): Promise<{ ok: boolean; reason?: string }> {
  const viewer = await requireDocumentOwner(documentId);
  const target = await userByEmail(email);
  if (target === null) return { ok: false, reason: "no-account" };
  if (target.id === viewer.userId) return { ok: false, reason: "self" };
  await upsertShare({
    documentId,
    subjectType: "user",
    subjectId: target.id,
    role,
    createdBy: viewer.userId,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function shareWithFamilyAction(
  documentId: string,
  organizationId: string,
  role: string,
): Promise<void> {
  const viewer = await requireDocumentOwner(documentId);
  // 내가 속한 가족에만 열 수 있다.
  if (!viewer.spaces.some((item) => item.organizationId === organizationId)) {
    throw new Error("이 가족에 공유할 수 없습니다.");
  }
  await upsertShare({
    documentId,
    subjectType: "org",
    subjectId: organizationId,
    role,
    createdBy: viewer.userId,
  });
  revalidatePath("/", "layout");
}

export async function removeShareAction(documentId: string, shareId: string): Promise<void> {
  await requireDocumentOwner(documentId);
  await removeShare(shareId, documentId);
  revalidatePath("/", "layout");
}

export async function createPublicLinkAction(documentId: string): Promise<{ token: string }> {
  const viewer = await requireDocumentOwner(documentId);
  const token = await createPublicLink({ documentId, createdBy: viewer.userId });
  revalidatePath("/", "layout");
  return { token };
}

export async function revokePublicLinkAction(documentId: string, linkId: string): Promise<void> {
  await requireDocumentOwner(documentId);
  await revokePublicLink(linkId, documentId);
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------------ GPU 모드 */

/**
 * 게임이 GPU 를 쓸 때 냥이를 비켜 세운다.
 *
 * `gaming` 으로 바꾸면 모델을 VRAM 에서 곧바로 내린다 — 토글만 해 두고 메모리가 안 비면
 * 아무 의미가 없다. **문서 편집·동기화·검색은 어느 모드에서도 그대로 돈다.**
 */
export async function setGpuModeAction(mode: "free" | "gaming"): Promise<void> {
  await requireViewer(); // 가족 누구나 바꿀 수 있다 — 집 한 대의 공용 스위치다
  await setGpuMode(mode);
  if (mode === "gaming") await unloadModels();
  revalidatePath("/", "layout");
}
