"use server";

import {
  acceptInvitation,
  addProperty,
  addToCollection,
  archiveDocument,
  attachTag,
  collectionOfProperty,
  createFamily,
  createPublicLink,
  createCollection,
  createDocument,
  deleteCollection,
  deleteProperty,
  deleteTag,
  detachTag,
  emptyTrash,
  ensureSelectOption,
  ensureTag,
  getCollection,
  getDocumentById,
  recordAudit,
  inviteToFamily,
  moveDocument,
  moveInCollection,
  removeFromCollection,
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
  setPropertyValue,
  toggleFavorite,
  updateCollection,
  updateProperty,
  upsertShare,
  userByEmail,
  type CollectionFilter,
  type CollectionView,
  type PropertyType,
} from "@nyanotion/db";
import { unloadModels } from "@nyanotion/ai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assertCanWrite,
  requireDocumentOwner,
  requireFamilyAdmin,
  requireViewer,
  type Viewer,
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
  const gone = await emptyTrash(viewer.spaceIds);
  // 되돌릴 수 없다. 몇 개가 사라졌는지라도 남겨 둔다.
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "trash.empty",
    spaceId: viewer.personalSpace.id,
    summary: `모래상자를 비웠다 (${gone}개)`,
  });
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
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "family.invite",
    subjectType: "organization",
    subjectId: organizationId,
    summary: `${email} 을 가족으로 초대했다`,
    detail: { email, role },
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
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "family.role",
    subjectType: "organization",
    subjectId: organizationId,
    summary: `가족 구성원의 역할을 ${role} 로 바꿨다`,
    detail: { userId, role },
  });
  revalidatePath("/", "layout");
}

export async function removeMemberAction(organizationId: string, userId: string): Promise<void> {
  const viewer = await requireFamilyAdmin(organizationId);
  if (userId === viewer.userId) throw new Error("자기 자신을 내보낼 수 없습니다.");
  await removeMember(organizationId, userId);
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "family.remove",
    subjectType: "organization",
    subjectId: organizationId,
    summary: "가족에서 내보냈다",
    detail: { userId },
  });
  revalidatePath("/", "layout");
}

/** 초대 링크를 받아들인다. 로그인한 주소와 초대장 주소가 같아야 한다. */
export async function acceptInvitationAction(
  token: string,
): Promise<{ ok: boolean; reason?: string }> {
  const viewer = await requireViewer();
  const result = await acceptInvitation(token, viewer.userId, viewer.email);
  if (result.ok) {
    await recordAudit({
      actorId: viewer.userId,
      actorName: viewer.name,
      action: "family.join",
      summary: `${viewer.email} 이 가족에 들어왔다`,
    });
  }
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * 감사 로그에 한 줄. **로그가 실패해도 하던 일은 되돌리지 않는다** (`recordAudit` 안에서 삼킨다).
 * 문서 기준의 일은 그 문서의 공간을 붙여 둔다 — 그래야 "내가 볼 수 있는 로그"를 가를 수 있다.
 */
async function auditForDocument(
  viewer: { userId: string; name: string },
  documentId: string,
  action: Parameters<typeof recordAudit>[0]["action"],
  summary: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const doc = await getDocumentById(documentId);
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action,
    spaceId: doc?.spaceId ?? null,
    subjectType: "document",
    subjectId: documentId,
    summary,
    detail,
  });
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
  await auditForDocument(viewer, documentId, "share.grant", `${email} 에게 ${role} 로 공유`, {
    subjectType: "user",
    email,
    role,
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
  await auditForDocument(viewer, documentId, "share.grant", `가족 전체에 ${role} 로 공유`, {
    subjectType: "org",
    organizationId,
    role,
  });
  revalidatePath("/", "layout");
}

export async function removeShareAction(documentId: string, shareId: string): Promise<void> {
  const viewer = await requireDocumentOwner(documentId);
  await removeShare(shareId, documentId);
  await auditForDocument(viewer, documentId, "share.revoke", "공유를 거뒀다", { shareId });
  revalidatePath("/", "layout");
}

export async function createPublicLinkAction(documentId: string): Promise<{ token: string }> {
  const viewer = await requireDocumentOwner(documentId);
  const token = await createPublicLink({ documentId, createdBy: viewer.userId });
  // **로그인 없이 열리는 문**이다. 이건 반드시 기록으로 남아야 한다.
  await auditForDocument(viewer, documentId, "link.create", "공개 링크를 만들었다 (로그인 없이 열린다)");
  revalidatePath("/", "layout");
  return { token };
}

export async function revokePublicLinkAction(documentId: string, linkId: string): Promise<void> {
  const viewer = await requireDocumentOwner(documentId);
  await revokePublicLink(linkId, documentId);
  await auditForDocument(viewer, documentId, "link.revoke", "공개 링크를 닫았다", { linkId });
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
  const viewer = await requireViewer(); // 가족 누구나 바꿀 수 있다 — 집 한 대의 공용 스위치다
  await setGpuMode(mode);
  if (mode === "gaming") await unloadModels();
  // "그때 왜 냥이가 안 됐지"의 답이 된다.
  await recordAudit({
    actorId: viewer.userId,
    actorName: viewer.name,
    action: "gpu.mode",
    summary: mode === "gaming" ? "GPU 를 게임에 넘겼다" : "GPU 를 냥이에게 돌려줬다",
    detail: { mode },
  });
  revalidatePath("/", "layout");
}

/* ------------------------------------------------ 데이터베이스 (모음의 속성) */

/**
 * 손으로 담는 표를 만든다. **줄 하나가 문서다** — 눌러서 열면 본문에 메모를 쓸 수 있다.
 * 기본 속성 몇 개를 같이 만들어 둔다. 빈 표를 주면 뭘 해야 할지 모른다.
 */
export async function createDatabaseAction(name: string, spaceId?: string): Promise<void> {
  const viewer = await requireViewer();
  const target = spaceId ?? viewer.personalSpace.id;
  if (!viewer.spaceIds.includes(target)) throw new Error("이 공간에 표를 만들 수 없습니다.");

  const id = await createCollection({
    spaceId: target,
    userId: viewer.userId,
    name,
    filter: { tagIds: [], query: "" },
    view: "table",
    source: "manual",
  });
  await addProperty({ collectionId: id, name: "상태", type: "select" });
  await addProperty({ collectionId: id, name: "메모", type: "text" });
  revalidatePath("/", "layout");
  redirect(`/c/${id}`);
}

/**
 * 본문 안에 끼울 표를 하나 만들고 **id 를 돌려준다**. 화면을 옮기지 않는다 —
 * 부르는 쪽(에디터 블록)이 그 id 를 블록 속성에 적어야 하기 때문이다.
 *
 * 표는 문서와 같은 공간에 만든다. 그래야 문서를 볼 수 있는 사람이 표도 볼 수 있다.
 */
export async function createInlineDatabaseAction(
  documentId: string,
  name: string,
): Promise<{ collectionId: string }> {
  await assertCanWrite(documentId);
  const viewer = await requireViewer();

  const doc = await getDocumentById(documentId);
  if (doc === null) throw new Error("문서를 찾을 수 없습니다.");
  if (!viewer.spaceIds.includes(doc.spaceId)) throw new Error("이 공간에 표를 만들 수 없습니다.");

  const collectionId = await createCollection({
    spaceId: doc.spaceId,
    userId: viewer.userId,
    name: name.trim() === "" ? "표" : name.trim(),
    filter: { tagIds: [], query: "" },
    view: "table",
    source: "manual",
  });
  // 보드(선택)와 달력(날짜)이 만들자마자 뜻이 있도록 세 가지를 기본으로 둔다.
  await addProperty({ collectionId, name: "상태", type: "select" });
  await addProperty({ collectionId, name: "날짜", type: "date" });
  await addProperty({ collectionId, name: "메모", type: "text" });
  revalidatePath("/", "layout");
  return { collectionId };
}

/** 이 모음이 내가 들어갈 수 있는 공간의 것인지 확인하고 그 공간 id 를 돌려준다. */
async function collectionSpace(collectionId: string): Promise<{ viewer: Viewer; spaceId: string }> {
  const viewer = await requireViewer();
  const found = await getCollection(collectionId, viewer.spaceIds);
  if (found === null) throw new Error("표를 찾을 수 없습니다.");
  return { viewer, spaceId: found.spaceId };
}

export async function addPropertyAction(
  collectionId: string,
  name: string,
  type: PropertyType,
): Promise<void> {
  await collectionSpace(collectionId);
  await addProperty({ collectionId, name, type });
  revalidatePath("/", "layout");
}

export async function updatePropertyAction(
  collectionId: string,
  propertyId: string,
  patch: { name?: string; type?: PropertyType },
): Promise<void> {
  await collectionSpace(collectionId);
  await updateProperty(propertyId, collectionId, patch);
  revalidatePath("/", "layout");
}

/** 속성을 지우면 그 값들도 함께 사라진다. 문서는 그대로다. */
export async function deletePropertyAction(
  collectionId: string,
  propertyId: string,
): Promise<void> {
  await collectionSpace(collectionId);
  await deleteProperty(propertyId, collectionId);
  revalidatePath("/", "layout");
}

/** 셀 하나 고치기. **문서를 고칠 수 있어야 한다** — 표에 있다고 아무나 쓰지 못한다. */
export async function setValueAction(
  collectionId: string,
  documentId: string,
  propertyId: string,
  value: unknown,
): Promise<void> {
  await collectionSpace(collectionId);
  await assertCanWrite(documentId);
  // 속성이 정말 이 표의 것인지 — 다른 표의 속성 id 를 끼워 넣지 못하게.
  if ((await collectionOfProperty(propertyId)) !== collectionId) {
    throw new Error("이 표의 속성이 아닙니다.");
  }
  await setPropertyValue(documentId, propertyId, value);
  revalidatePath("/", "layout");
}

/** select 속성에 선택지를 더하면서 값으로도 넣는다 — 타이핑 한 번으로 끝나게. */
export async function setSelectValueAction(
  collectionId: string,
  documentId: string,
  propertyId: string,
  optionName: string,
): Promise<void> {
  await collectionSpace(collectionId);
  await assertCanWrite(documentId);
  if ((await collectionOfProperty(propertyId)) !== collectionId) {
    throw new Error("이 표의 속성이 아닙니다.");
  }
  if (optionName.trim() === "") {
    await setPropertyValue(documentId, propertyId, null);
  } else {
    const optionId = await ensureSelectOption(propertyId, collectionId, optionName);
    await setPropertyValue(documentId, propertyId, optionId);
  }
  revalidatePath("/", "layout");
}

/** 줄 하나 = 문서 하나. 표가 사는 공간에 만들고 표에 담는다. */
export async function addRowAction(collectionId: string, title = ""): Promise<string> {
  const { viewer, spaceId } = await collectionSpace(collectionId);
  const documentId = await createDocument({ spaceId, userId: viewer.userId, title });
  await addToCollection(collectionId, documentId);
  revalidatePath("/", "layout");
  return documentId;
}

/** 표에서 빼는 것일 뿐 문서는 남는다. 지우려면 문서를 모래상자로 보낸다. */
export async function removeRowAction(collectionId: string, documentId: string): Promise<void> {
  await collectionSpace(collectionId);
  await assertCanWrite(documentId);
  await removeFromCollection(collectionId, documentId);
  revalidatePath("/", "layout");
}

export async function moveRowAction(
  collectionId: string,
  documentId: string,
  afterDocumentId: string | null,
): Promise<void> {
  await collectionSpace(collectionId);
  await assertCanWrite(documentId);
  await moveInCollection(collectionId, documentId, afterDocumentId);
  revalidatePath("/", "layout");
}
