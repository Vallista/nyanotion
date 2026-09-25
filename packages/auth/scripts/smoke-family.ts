/**
 * M4 가족·공유 점검 — 만들기, 초대, 받아들이기, 공유, 공개 링크.
 *   pnpm --filter @nyanotion/auth smoke:family
 * 만든 것은 끝에 전부 지운다.
 */
import {
  acceptInvitation,
  createFamily,
  createPublicLink,
  db,
  documentByPublicToken,
  familyMembers,
  invitationByToken,
  inviteToFamily,
  listInvitations,
  listPublicLinks,
  listShares,
  loadEnv,
  newId,
  removeMember,
  removeShare,
  revokeInvitation,
  revokePublicLink,
  setMemberRole,
  upsertShare,
  userByEmail,
} from "@nyanotion/db";
import { document, invitation, organization, space, user } from "@nyanotion/db";
import { positionAfterLast } from "@nyanotion/shared";
import { inArray, like } from "drizzle-orm";
import { effectiveRole, readableDocumentIds, spacesForUser } from "../src/access.ts";

loadEnv();

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TAG = "FAM-SMOKE";
const made = { users: [] as string[], orgs: [] as string[], spaces: [] as string[] };

async function makeUser(label: string): Promise<{ id: string; email: string }> {
  const id = newId();
  const email = `${TAG.toLowerCase()}-${label}-${id.slice(0, 6)}@example.invalid`;
  const now = new Date();
  await db
    .insert(user)
    .values({ id, name: `${TAG} ${label}`, email, emailVerified: false, createdAt: now, updatedAt: now });
  made.users.push(id);
  const spaceId = newId();
  await db
    .insert(space)
    .values({ id: spaceId, kind: "personal", ownerUserId: id, name: `${TAG} ${label}` });
  made.spaces.push(spaceId);
  return { id, email };
}

async function personalSpaceOf(userId: string): Promise<string> {
  const spaces = await spacesForUser(userId);
  const personal = spaces.find((item) => item.kind === "personal");
  if (personal === undefined) throw new Error("개인 space 가 없습니다.");
  return personal.id;
}

async function makeDoc(
  spaceId: string,
  userId: string,
  title: string,
  parentId: string | null = null,
): Promise<string> {
  const id = newId();
  await db.insert(document).values({
    id,
    spaceId,
    parentId,
    position: positionAfterLast(null),
    title: `${TAG} ${title}`,
    contentJson: [
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "공개된 내용", styles: {} }],
        children: [],
      },
    ],
    createdBy: userId,
    updatedBy: userId,
  });
  return id;
}

async function main(): Promise<void> {
  const owner = await makeUser("owner");
  const invitee = await makeUser("invitee");
  const stranger = await makeUser("stranger");

  console.log("가족 만들기");
  const family = await createFamily({ name: `${TAG} 한울`, ownerUserId: owner.id });
  made.orgs.push(family.organizationId);
  made.spaces.push(family.spaceId);

  const ownerSpaces = await spacesForUser(owner.id);
  check(
    "만든 사람의 space 목록에 가족이 생긴다",
    ownerSpaces.some((item) => item.id === family.spaceId),
    ownerSpaces.map((item) => item.name),
  );
  check(
    "다른 사람 목록에는 없다",
    !(await spacesForUser(invitee.id)).some((item) => item.id === family.spaceId),
  );

  const famDoc = await makeDoc(family.spaceId, owner.id, "김장");
  check("가족 밖 사람은 가족 문서를 못 본다", (await effectiveRole(invitee.id, famDoc)) === null);

  console.log("\n초대");
  const token = await inviteToFamily({
    organizationId: family.organizationId,
    email: invitee.email,
    role: "member",
    inviterId: owner.id,
  });
  const again = await inviteToFamily({
    organizationId: family.organizationId,
    email: invitee.email,
    role: "member",
    inviterId: owner.id,
  });
  check("같은 주소로 다시 부르면 같은 초대장을 준다", token === again, { token, again });
  check("초대 목록에 뜬다", (await listInvitations(family.organizationId)).length === 1);

  const detail = await invitationByToken(token);
  check("토큰으로 초대장을 읽는다", detail?.email === invitee.email, detail?.email);

  console.log("\n받아들이기");
  const wrongEmail = await acceptInvitation(token, stranger.id, stranger.email);
  check(
    "**초대장과 다른 주소로는 들어올 수 없다**",
    !wrongEmail.ok && wrongEmail.reason === "email",
    wrongEmail,
  );
  check("그래서 아직 가족이 아니다", (await effectiveRole(stranger.id, famDoc)) === null);

  const accepted = await acceptInvitation(token, invitee.id, invitee.email);
  check("맞는 주소면 들어온다", accepted.ok);
  check("이제 가족 문서가 보인다", (await effectiveRole(invitee.id, famDoc)) === "editor");
  check("구성원이 2명이다", (await familyMembers(family.organizationId)).length === 2);
  check("쓴 초대장은 목록에서 빠진다", (await listInvitations(family.organizationId)).length === 0);
  const reuse = await acceptInvitation(token, invitee.id, invitee.email);
  check("같은 초대장을 다시 쓸 수 없다", !reuse.ok, reuse);

  console.log("\n역할 바꾸기");
  await setMemberRole(family.organizationId, invitee.id, "guest");
  check("손님이 되면 가족 문서가 안 보인다", (await effectiveRole(invitee.id, famDoc)) === null);
  await setMemberRole(family.organizationId, invitee.id, "member");
  check("식구로 되돌리면 다시 보인다", (await effectiveRole(invitee.id, famDoc)) === "editor");

  console.log("\n문서 공유");
  const ownerSpace = await personalSpaceOf(owner.id);
  const priv = await makeDoc(ownerSpace, owner.id, "내 일기");
  const shared = await makeDoc(ownerSpace, owner.id, "나눠 보는 글");
  const sharedChild = await makeDoc(ownerSpace, owner.id, "나눠 보는 글 - 부록", shared);

  await upsertShare({
    documentId: shared,
    subjectType: "user",
    subjectId: stranger.id,
    role: "viewer",
    createdBy: owner.id,
  });
  check("공유받으면 보인다", (await effectiveRole(stranger.id, shared)) === "viewer");
  check("하위 문서도 보인다", (await effectiveRole(stranger.id, sharedChild)) === "viewer");
  check("공유 안 한 문서는 여전히 안 보인다", (await effectiveRole(stranger.id, priv)) === null);

  await upsertShare({
    documentId: shared,
    subjectType: "user",
    subjectId: stranger.id,
    role: "editor",
    createdBy: owner.id,
  });
  const rows = await listShares(shared);
  check("같은 대상에 다시 공유하면 역할만 바뀐다", rows.length === 1, rows.length);
  check("역할이 올라갔다", (await effectiveRole(stranger.id, shared)) === "editor");

  const readable = await readableDocumentIds(stranger.id);
  check("읽을 수 있는 목록에 들어온다", readable.has(shared) && readable.has(sharedChild));
  check("**남의 비공개 문서는 목록에 없다**", !readable.has(priv));

  const shareRow = rows[0];
  if (shareRow !== undefined) await removeShare(shareRow.id, shared);
  check("공유를 닫으면 다시 안 보인다", (await effectiveRole(stranger.id, shared)) === null);

  console.log("\n공개 링크");
  const linkToken = await createPublicLink({ documentId: shared, createdBy: owner.id });
  const view = await documentByPublicToken(linkToken);
  check("링크로 문서가 열린다", view?.documentId === shared, view?.documentId);
  check("내용이 함께 온다", Array.isArray(view?.contentJson));
  check("읽기 권한이다", view?.role === "viewer", view?.role);
  check("링크가 목록에 뜬다", (await listPublicLinks(shared)).length === 1);

  const expired = await createPublicLink({
    documentId: priv,
    createdBy: owner.id,
    expiresAt: new Date(Date.now() - 1000),
  });
  check("기한 지난 링크는 안 열린다", (await documentByPublicToken(expired)) === null);
  check("엉터리 토큰도 안 열린다", (await documentByPublicToken("nope")) === null);

  const links = await listPublicLinks(shared);
  const first = links[0];
  if (first !== undefined) await revokePublicLink(first.id, shared);
  check("끄면 안 열린다", (await documentByPublicToken(linkToken)) === null);

  console.log("\n내보내기와 초대 취소");
  const token2 = await inviteToFamily({
    organizationId: family.organizationId,
    email: stranger.email,
    role: "member",
    inviterId: owner.id,
  });
  await revokeInvitation(token2, family.organizationId);
  check("취소한 초대장은 못 쓴다", (await invitationByToken(token2)) === null);

  await removeMember(family.organizationId, invitee.id);
  check("내보내면 가족 문서가 안 보인다", (await effectiveRole(invitee.id, famDoc)) === null);
  const stillThere = await db.select({ id: document.id }).from(document);
  check(
    "내보내도 그 사람이 쓴 문서는 남는다",
    stillThere.some((row) => row.id === famDoc),
  );
}

async function cleanup(): Promise<void> {
  await db.delete(document).where(like(document.title, `${TAG}%`));
  await db.delete(invitation).where(like(invitation.email, `${TAG.toLowerCase()}%`));
  if (made.spaces.length > 0) await db.delete(space).where(inArray(space.id, made.spaces));
  if (made.orgs.length > 0) await db.delete(organization).where(inArray(organization.id, made.orgs));
  if (made.users.length > 0) await db.delete(user).where(inArray(user.id, made.users));
  console.log("\n치웠습니다");
}

try {
  await main();
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\n전부 통과" : `\n${failures}개 실패`);
process.exit(failures === 0 ? 0 : 1);
