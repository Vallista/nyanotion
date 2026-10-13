/**
 * 동기화 시험 — 토큰 → API 로 Bento 처럼 올리기 → 웹에서 보이고 고치기 → API 로 다시 받기 → 토큰 끊기.
 *
 *   INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-sync.mjs
 *
 * 시험 체크리스트를 만들어 쓰고 끝에 모래상자로 보낸다. 만든 토큰은 끝에 끊는다.
 */
import { chromium, devices } from "playwright";
import { BASE, signIn } from "./lib.mjs";

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ ...devices["Desktop Chrome"], viewport: { width: 1280, height: 950 } });
page.on("dialog", (d) => d.accept(pendingPrompt ?? undefined));
let pendingPrompt = null;
console.log(await signIn(page));
const stamp = Date.now().toString().slice(-6);

console.log("\n토큰 만들기");
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.locator('input[aria-label="토큰 이름"]').fill(`시험 ${stamp}`);
await page.getByRole("button", { name: "토큰 만들기" }).click();
await page.locator("[data-token]").waitFor({ timeout: 10000 });
const token = (await page.locator("[data-token]").innerText()).trim();
check("한 번 보여 준다", token.startsWith("nyt_"), token.slice(0, 6));
await page.reload({ waitUntil: "networkidle" });
check("**다시 열면 평문은 없다**", (await page.locator("[data-token]").count()) === 0 && !(await page.content()).includes(token));

const api = async (path, init = {}, auth = token) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body, headers: res.headers };
};

console.log("\n인증");
check("토큰 없으면 401", (await api("/api/sync/me", {}, null)).status === 401);
check("틀린 토큰이면 401", (await api("/api/sync/me", {}, `${token}x`)).status === 401);
const me = await api("/api/sync/me");
check("토큰이면 내가 누군지", me.status === 200 && typeof me.body?.user?.email === "string", me.status);

console.log("\nCORS (맥 앱의 웹뷰)");
{
  const ok = await fetch(`${BASE}/api/sync/me`, { method: "OPTIONS", headers: { Origin: "tauri://localhost", "Access-Control-Request-Method": "GET" } });
  check("Bento(tauri://localhost) 는 열어 준다", ok.status === 204 && ok.headers.get("access-control-allow-origin") === "tauri://localhost");
  const no = await fetch(`${BASE}/api/sync/me`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
  check("**모르는 주소에는 안 열어 준다**", no.headers.get("access-control-allow-origin") === null);
}

console.log("\nBento 처럼 올리기");
const made = await api("/api/sync/checklists", { method: "POST", body: JSON.stringify({ title: `시험 동기화 ${stamp}` }) });
const listId = made.body?.id;
check("체크리스트를 만든다", made.status === 200 && typeof listId === "string", made.body);
const now = () => new Date().toISOString();
const TASK = `t_${Date.now()}_e2e01`;
const LOOSE = `t_${Date.now()}_e2e02`;
const pushed = await api(`/api/sync/checklists/${listId}/changes`, {
  method: "POST",
  body: JSON.stringify({
    folders: [{ id: `fold-${stamp}`, name: "회사", updatedAt: now() }],
    items: [
      { id: TASK, title: "주간 보고서", folderId: `fold-${stamp}`, tags: ["업무"], groupName: "팀A", estMin: 30, notes: "금요일까지", subtasks: [{ id: "s1", title: "표 정리", done: false }], updatedAt: now() },
      { id: LOOSE, title: "우유 사기", dueOn: "2026-10-20", updatedAt: now() },
    ],
  }),
});
check("올라간다", pushed.status === 200 && pushed.body?.applied === 3, pushed.body);
const first = await api(`/api/sync/checklists/${listId}/changes?since=0`);
const cursor0 = first.body?.cursor ?? 0;
check("받으면 그대로 온다", first.body?.items?.some((i) => i.id === TASK && i.groupName === "팀A" && i.subtasks?.length === 1), first.body?.items);

console.log("\n웹에서 보인다 — 폴더째");
const listUrl = `${BASE}/lists/${listId}`;
await page.goto(listUrl, { waitUntil: "networkidle" });
const folder = page.locator('section[aria-label="폴더 회사"]');
check("폴더가 보인다", (await folder.count()) === 1);
check("**할 일이 그 폴더 안에 있다**", (await folder.locator("li", { hasText: "주간 보고서" }).count()) === 1);
check("폴더 밖 할 일은 맨 위에", (await page.locator("ul").first().locator("li", { hasText: "우유 사기" }).count()) === 1);

console.log("\n웹에서 고치면 API 로 받는다");
await folder.locator("li", { hasText: "주간 보고서" }).locator('button[aria-label="했음"]').click();
await page.waitForTimeout(1500);
const afterCheck = await api(`/api/sync/checklists/${listId}/changes?since=${cursor0}`);
check("체크가 온다", afterCheck.body?.items?.some((i) => i.id === TASK && i.done === true), afterCheck.body?.items);
const cursor1 = afterCheck.body?.cursor;

pendingPrompt = "집";
await page.getByRole("button", { name: "+ 폴더" }).click();
await page.waitForTimeout(1500);
pendingPrompt = null;
const afterFolder = await api(`/api/sync/checklists/${listId}/changes?since=${cursor1}`);
const homeFolder = afterFolder.body?.folders?.find((f) => f.name === "집");
check("웹에서 만든 폴더가 온다", homeFolder !== undefined, afterFolder.body?.folders);
const cursor2 = afterFolder.body?.cursor;

await page.locator("li", { hasText: "우유 사기" }).first().locator('button[aria-label="더 보기"]').click();
await page.locator('select[aria-label="폴더로 옮기기"]').selectOption({ label: "📁 집" });
await page.waitForTimeout(1500);
const afterMove = await api(`/api/sync/checklists/${listId}/changes?since=${cursor2}`);
check("폴더 옮기기가 온다", afterMove.body?.items?.some((i) => i.id === LOOSE && i.folderId === homeFolder?.id), afterMove.body?.items);
const cursor3 = afterMove.body?.cursor;

await page.goto(listUrl, { waitUntil: "networkidle" });
await page.locator('section[aria-label="폴더 집"]').getByRole("button", { name: "지우기" }).click();
await page.waitForTimeout(1500);
const afterDel = await api(`/api/sync/checklists/${listId}/changes?since=${cursor3}`);
check(
  "**폴더를 지우면 '지웠다'와 위로 올라간 할 일이 같이 온다**",
  afterDel.body?.folders?.some((f) => f.id === homeFolder?.id && f.deleted) && afterDel.body?.items?.some((i) => i.id === LOOSE && i.folderId === null),
  afterDel.body,
);

console.log("\n나중에 고친 쪽이 이긴다");
const stale = await api(`/api/sync/checklists/${listId}/changes`, {
  method: "POST",
  body: JSON.stringify({ items: [{ id: TASK, title: "옛 제목", updatedAt: "2020-01-01T00:00:00Z" }] }),
});
check("옛 수정은 버려진다고 알려 준다", stale.body?.stale?.includes(TASK), stale.body);

console.log("\n권한");
const notMine = await api(`/api/sync/checklists/doesnotexist000000/changes?since=0`);
check("없는 체크리스트는 404", notMine.status === 404);

console.log("\n토큰 끊기");
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.locator("li", { hasText: `시험 ${stamp}` }).getByRole("button", { name: "끊기" }).click();
await page.waitForTimeout(1500);
check("**끊은 토큰은 바로 401**", (await api("/api/sync/me")).status === 401);

console.log("\n정리");
await page.goto(listUrl, { waitUntil: "networkidle" });
await page.locator('button[aria-label="체크리스트 메뉴"]').click();
await page.getByRole("menuitem", { name: "모래상자로 보내기" }).click();
await page.waitForURL(/\/lists$/, { timeout: 15000 }).catch(() => {});

console.log(`\n${pass}개 통과, ${fail}개 실패`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
