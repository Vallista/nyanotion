/**
 * M4 권한 점검. **"다른 사람 문서가 안 보인다"를 증명하지 않고는 넘어가지 않는다** — CLAUDE.md.
 *   pnpm --filter @nyanotion/auth smoke
 * 만든 것은 끝에 전부 지운다.
 */
import { db, loadEnv, newId } from "@nyanotion/db";
import {
  document,
  documentShare,
  member,
  organization,
  space,
  user,
} from "@nyanotion/db";
import { positionAfterLast } from "@nyanotion/shared";
import { eq, inArray, like } from "drizzle-orm";
import {
  canWrite,
  effectiveRole,
  organizationIdsOf,
  readableDocumentIds,
  spacesForUser,
} from "../src/access.ts";

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

const TAG = "ACCESS-SMOKE";
const made = { users: [] as string[], orgs: [] as string[], spaces: [] as string[] };

async function makeUser(label: string): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `${TAG} ${label}`,
    email: `${TAG.toLowerCase()}-${label}-${id.slice(0, 6)}@example.invalid`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(id);
  const spaceId = newId();
  await db.insert(space).values({
    id: spaceId,
    kind: "personal",
    ownerUserId: id,
    name: `${TAG} ${label} 내 문서`,
  });
  made.spaces.push(spaceId);
  return id;
}

async function personalSpaceId(userId: string): Promise<string> {
  const rows = await db.select({ id: space.id }).from(space).where(eq(space.ownerUserId, userId));
  const found = rows[0];
  if (found === undefined) throw new Error("개인 space 가 없습니다.");
  return found.id;
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
    createdBy: userId,
    updatedBy: userId,
  });
  return id;
}

async function makeFamily(name: string, members: { userId: string; role: string }[]) {
  const orgId = newId();
  await db.insert(organization).values({
    id: orgId,
    name: `${TAG} ${name}`,
    slug: `${TAG.toLowerCase()}-${orgId.slice(0, 8)}`,
    createdAt: new Date(),
  });
  made.orgs.push(orgId);
  for (const entry of members) {
    await db.insert(member).values({
      id: newId(),
      organizationId: orgId,
      userId: entry.userId,
      role: entry.role,
      createdAt: new Date(),
    });
  }
  const spaceId = newId();
  await db.insert(space).values({
    id: spaceId,
    kind: "org",
    organizationId: orgId,
    name: `${TAG} ${name} 문서`,
  });
  made.spaces.push(spaceId);
  return { orgId, spaceId };
}

async function main(): Promise<void> {
  const a = await makeUser("A");
  const b = await makeUser("B");
  const c = await makeUser("C"); // 아무 가족에도 안 속한 사람

  const spaceA = await personalSpaceId(a);
  const spaceB = await personalSpaceId(b);

  const family = await makeFamily("한울", [
    { userId: a, role: "owner" },
    { userId: b, role: "member" },
  ]);

  console.log("개인 문서");
  const docA = await makeDoc(spaceA, a, "A 의 일기");
  const docAChild = await makeDoc(spaceA, a, "A 의 일기 - 9월", docA);
  const docB = await makeDoc(spaceB, b, "B 의 메모");

  check("A 는 자기 문서의 owner 다", (await effectiveRole(a, docA)) === "owner");
  check("B 는 A 의 문서를 못 본다", (await effectiveRole(b, docA)) === null);
  check("B 는 A 의 하위 문서도 못 본다", (await effectiveRole(b, docAChild)) === null);
  check("A 는 B 의 문서를 못 본다", (await effectiveRole(a, docB)) === null);

  console.log("\n가족 문서");
  const docFam = await makeDoc(family.spaceId, a, "김장 2025");
  const docFamChild = await makeDoc(family.spaceId, a, "김장 - 재료", docFam);
  check("가족 owner 는 가족 문서의 owner 다", (await effectiveRole(a, docFam)) === "owner");
  check("가족 member 는 editor 다", (await effectiveRole(b, docFam)) === "editor");
  check("하위 문서도 같다", (await effectiveRole(b, docFamChild)) === "editor");
  check("가족 밖 사람은 못 본다", (await effectiveRole(c, docFam)) === null);

  console.log("\n개별 공유 (사람 대상)");
  const shared = await makeDoc(spaceA, a, "A 가 공유한 글");
  const sharedChild = await makeDoc(spaceA, a, "A 가 공유한 글 - 부록", shared);
  await db.insert(documentShare).values({
    id: newId(),
    documentId: shared,
    subjectType: "user",
    subjectId: b,
    role: "viewer",
    createdBy: a,
  });
  check("공유받은 사람은 볼 수 있다", (await effectiveRole(b, shared)) === "viewer");
  check("**하위 트리까지 상속된다**", (await effectiveRole(b, sharedChild)) === "viewer");
  check("viewer 는 못 고친다", (await canWrite(b, shared)) === false);
  check("공유 안 한 형제 문서는 여전히 안 보인다", (await effectiveRole(b, docA)) === null);
  check("제3자는 여전히 못 본다", (await effectiveRole(c, shared)) === null);

  console.log("\n개별 공유 (가족 대상)");
  const toFamily = await makeDoc(spaceA, a, "A 가 가족에게 연 글");
  await db.insert(documentShare).values({
    id: newId(),
    documentId: toFamily,
    subjectType: "org",
    subjectId: family.orgId,
    role: "commenter",
    createdBy: a,
  });
  check("가족 구성원이 볼 수 있다", (await effectiveRole(b, toFamily)) === "commenter");
  check("가족 밖 사람은 못 본다", (await effectiveRole(c, toFamily)) === null);

  console.log("\n더 강한 권한이 이긴다");
  await db.insert(documentShare).values({
    id: newId(),
    documentId: toFamily,
    subjectType: "user",
    subjectId: b,
    role: "editor",
    createdBy: a,
  });
  check(
    "사람 공유(editor)가 가족 공유(commenter)보다 세다",
    (await effectiveRole(b, toFamily)) === "editor",
  );

  console.log("\nguest 는 space 전체 권한이 없다");
  const guestFamily = await makeFamily("손님있는가족", [
    { userId: a, role: "owner" },
    { userId: c, role: "guest" },
  ]);
  const guestDoc = await makeDoc(guestFamily.spaceId, a, "손님 가족 문서");
  check("guest 는 가족 space 문서를 못 본다", (await effectiveRole(c, guestDoc)) === null);
  const cSpaces = await spacesForUser(c);
  check(
    "guest 의 space 목록에 그 가족이 안 뜬다",
    !cSpaces.some((item) => item.id === guestFamily.spaceId),
    cSpaces.map((item) => item.name),
  );
  check("그래도 member 목록에는 있다", (await organizationIdsOf(c)).includes(guestFamily.orgId));

  console.log("\n읽을 수 있는 문서 목록");
  const readableB = await readableDocumentIds(b);
  check("B 목록에 자기 문서가 있다", readableB.has(docB));
  check("B 목록에 가족 문서가 있다", readableB.has(docFam) && readableB.has(docFamChild));
  check("B 목록에 공유받은 문서와 하위가 있다", readableB.has(shared) && readableB.has(sharedChild));
  check("**B 목록에 A 의 비공개 문서는 없다**", !readableB.has(docA) && !readableB.has(docAChild));

  const readableC = await readableDocumentIds(c);
  check("C 목록에 가족 문서가 없다", !readableC.has(docFam));
  check("C 목록에 남의 문서가 없다", !readableC.has(docA) && !readableC.has(docB));

  console.log("\n없는 문서");
  check("없는 문서는 null 이다", (await effectiveRole(a, "doesnotexist000000000000")) === null);
}

async function cleanup(): Promise<void> {
  await db.delete(document).where(like(document.title, `${TAG}%`));
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
