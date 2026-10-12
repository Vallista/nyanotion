/**
 * 비밀번호를 터미널에서 다시 정한다 — **어드민 화면에 들어갈 수 없을 때** (어드민 자신이 잊었을 때).
 *
 *   pnpm reset-password --env prod you@example.com
 *
 * 새 비밀번호를 묻는다 (화면에 안 보인다). 비워 두면 임시 비밀번호를 만들어 **이 터미널에만** 보여 준다.
 * 그 계정의 모든 기기는 로그아웃된다. 로그인한 뒤 `/account` 에서 바꾸면 된다.
 *
 * 이 집 컴퓨터에서 DB 에 직접 붙는 길이라 웹 권한을 거치지 않는다 — 그래서 터미널 전용이다.
 * 한 일은 감사 로그에 `admin.password` 로 남는다 (한 사람: "터미널").
 */
import { randomInt } from "node:crypto";
import { createInterface } from "node:readline";
import { hashPassword } from "better-auth/crypto";

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
const env = envIndex >= 0 ? args[envIndex + 1] : undefined;
const email = args.filter((_, i) => i !== envIndex && i !== envIndex + 1)[0]?.trim().toLowerCase();

if (env !== "dev" && env !== "beta" && env !== "prod") {
  console.error("환경을 정해 주세요: --env dev | beta | prod");
  process.exit(2);
}
if (email === undefined || !email.includes("@")) {
  console.error("이메일을 적어 주세요: pnpm reset-password --env prod you@example.com");
  process.exit(2);
}
// 설정을 읽기 **전에** 환경을 정한다 — 늦으면 다른 DB 에 붙는다.
process.env.NYANOTION_ENV = env;

const { loadEnv, recordAudit, setPasswordHash, userByEmail, isAccountDisabled } = await import("@nyanotion/db");
loadEnv();

/** 입력을 화면에 안 보이게 묻는다. 터미널이 아니면(파이프) 빈 값을 돌려준다. */
function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      // 물음만 그대로, 친 글자는 감춘다.
      if (s.startsWith(question)) write.call(rl, question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 14; i += 1) out += letters[randomInt(letters.length)];
  return out;
}

const found = await userByEmail(email);
if (found === null) {
  console.error(`${env} 에 ${email} 계정이 없습니다.`);
  process.exit(1);
}

console.log(`${env} · ${found.name} (${found.email})`);
let password = await askHidden("새 비밀번호 (10자 이상, 비우면 임시 비밀번호를 만듭니다): ");
let generated = false;
if (password === "") {
  password = temporaryPassword();
  generated = true;
} else {
  if (password.length < 10) {
    console.error("10자 이상이어야 합니다. 바꾸지 않았습니다.");
    process.exit(1);
  }
  const again = await askHidden("한 번 더: ");
  if (again !== password) {
    console.error("두 번 친 것이 다릅니다. 바꾸지 않았습니다.");
    process.exit(1);
  }
}

// 해시는 Better Auth 기본값(scrypt) 그대로 — apps/web/src/lib/auth.ts 가 해시를 따로 정하지 않는다.
const ok = await setPasswordHash(found.id, await hashPassword(password));
if (!ok) {
  console.error("이메일·비밀번호로 만든 계정이 아닙니다. 바꾸지 않았습니다.");
  process.exit(1);
}

await recordAudit({
  actorId: "cli",
  actorName: "터미널",
  action: "admin.password",
  subjectType: "user",
  subjectId: found.id,
  summary: `${found.email} 의 비밀번호를 터미널에서 다시 정했다 (모든 기기에서 로그아웃)`,
});

console.log("바꿨습니다. 모든 기기에서 로그아웃됐습니다.");
if (generated) {
  console.log(`임시 비밀번호: ${password}`);
  console.log("로그인한 뒤 사이드바 아래 이메일 → 내 계정에서 바꾸세요.");
}
if (await isAccountDisabled(found.id)) {
  console.log("주의: 이 계정은 막혀 있습니다. 어드민 화면에서 다시 열어야 로그인됩니다.");
}
process.exit(0);
