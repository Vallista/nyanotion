/**
 * 어드민 점검 — 계정 초대 · 막기 · 비밀번호 · 가족 넣기/빼기.
 *   pnpm --filter @nyanotion/db smoke:admin
 *
 * 잠깐 계정 둘과 가족 하나를 만들고 끝나면 치운다. 실제 계정은 건드리지 않는다.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "../src/client.ts";
import { newId } from "../src/id.ts";
import {
  accountInviteByToken,
  createAccountInvite,
  hasOpenAccountInvite,
  isAccountDisabled,
  listAccounts,
  listPendingInvites,
  markAccountInviteUsed,
  ownerCount,
  putInFamily,
  revokeAccountInvite,
  setAccountDisabled,
  setPasswordHash,
} from "../src/queries/admin.ts";
import { createFamily, inviteToFamily, roleInFamily } from "../src/queries/families.ts";
import { accountInvite, account, organization, session, space, user } from "../src/schema/index.ts";

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const TAG = "ADMSMOKE";
const made = { users: [] as string[], orgs: [] as string[] };
const mail = (label: string) => `${TAG.toLowerCase()}-${label}@example.invalid`;

async function makeUser(label: string): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `${TAG} ${label}`,
    email: mail(label),
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  made.users.push(id);
  await db.insert(space).values({ id: newId(), kind: "personal", ownerUserId: id, name: `${TAG} 내 문서` });
  await db.insert(account).values({
    id: newId(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: "old-hash",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(session).values({
    id: newId(),
    token: newId(),
    userId: id,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function sessions(userId: string): Promise<number> {
  return (await db.select({ id: session.id }).from(session).where(eq(session.userId, userId))).length;
}

async function main(): Promise<void> {
  console.log("계정 초대");
  const email = mail("new");
  const token = await createAccountInvite({ email: ` ${email.toUpperCase()} `, createdBy: (await makeUser("admin")) });
  check("주소를 소문자로 둔다", (await accountInviteByToken(token))?.email === email);
  check("가입 훅이 통과시킨다", await hasOpenAccountInvite(email));
  check("**모르는 주소는 통과 못 한다**", !(await hasOpenAccountInvite(mail("stranger"))));
  check("같은 주소면 같은 링크", (await createAccountInvite({ email, createdBy: made.users[0]! })) === token);
  check("기다리는 초대에 보인다", (await listPendingInvites()).some((i) => i.id === token && i.kind === "account"));

  const joined = await makeUser("new-joined");
  await markAccountInviteUsed(email, joined);
  check("**한 번 쓰면 다시 못 쓴다**", !(await hasOpenAccountInvite(email)));
  check("링크도 안 열린다", (await accountInviteByToken(token)) === null);

  const second = await createAccountInvite({ email: mail("second"), createdBy: made.users[0]! });
  await revokeAccountInvite(second);
  check("취소하면 가입 훅이 막는다", !(await hasOpenAccountInvite(mail("second"))));
  check("기다리는 초대에서 빠진다", !(await listPendingInvites()).some((i) => i.id === second));

  console.log("\n막기");
  const target = await makeUser("target");
  check("처음엔 세션이 있다", (await sessions(target)) === 1);
  await setAccountDisabled(target, true);
  check("막혔다", await isAccountDisabled(target));
  check("**막으면 세션이 전부 지워진다**", (await sessions(target)) === 0);
  const listed = (await listAccounts()).find((a) => a.id === target);
  check("목록에 막힌 때가 나온다", listed?.disabledAt !== null, listed);
  await setAccountDisabled(target, false);
  check("풀면 다시 열린다", !(await isAccountDisabled(target)));

  console.log("\n비밀번호");
  await db.insert(session).values({
    id: newId(),
    token: newId(),
    userId: target,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  check("바꾼다", await setPasswordHash(target, "new-hash"));
  const stored = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, target), eq(account.providerId, "credential")));
  check("해시가 바뀐다", stored[0]?.password === "new-hash");
  check("**바꾸면 세션이 전부 지워진다**", (await sessions(target)) === 0);
  check("비밀번호 계정이 없으면 false", !(await setPasswordHash("nobody-00000000", "x")));

  console.log("\n가족");
  const owner = made.users[0]!;
  const family = await createFamily({ name: `${TAG} 가족`, ownerUserId: owner });
  made.orgs.push(family.organizationId);
  check("만든 사람이 owner", (await roleInFamily(family.organizationId, owner)) === "owner");
  await putInFamily(family.organizationId, target, "member");
  check("넣으면 member", (await roleInFamily(family.organizationId, target)) === "member");
  await putInFamily(family.organizationId, target, "admin");
  check("다시 넣으면 역할만 바뀐다", (await roleInFamily(family.organizationId, target)) === "admin");
  check("owner 는 한 명", (await ownerCount(family.organizationId)) === 1);
  const familyToken = await inviteToFamily({
    organizationId: family.organizationId,
    email: mail("fam"),
    role: "member",
    inviterId: owner,
  });
  const pending = (await listPendingInvites()).find((i) => i.id === familyToken);
  check("가족 초대도 같이 보인다", pending?.kind === "family" && pending.familyName === `${TAG} 가족`, pending);

  const accounts = await listAccounts();
  const row = accounts.find((a) => a.id === target);
  check("계정 목록에 가족과 역할", row?.families.some((f) => f.role === "admin") === true, row?.families);
  check("문서 수는 숫자다", typeof row?.documentCount === "number");
}

async function cleanup(): Promise<void> {
  if (made.orgs.length > 0) await db.delete(organization).where(inArray(organization.id, made.orgs));
  await db.delete(space).where(like(space.name, `${TAG}%`));
  await db.delete(accountInvite).where(like(accountInvite.email, `${TAG.toLowerCase()}%`));
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
