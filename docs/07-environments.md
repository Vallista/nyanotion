# 07 — 환경: dev · beta · prod

컴퓨터는 한 대인데 역할이 셋이다. 그래서 **같은 코드가 `NYANOTION_ENV` 하나로 갈린다.**

| | DB | 웹 | 동기화 | 올린 파일 | 빌드 폴더 | 도메인 |
|---|---|---|---|---|---|---|
| `dev` | `nyanotion_dev` | 3000 | 1234 | `.data/uploads/dev` | `.next-dev` | localhost |
| `beta` | `nyanotion_beta` | 3100 | 1334 | `.data/uploads/beta` | `.next-beta` | beta.nyanotion.party |
| `prod` | `nyanotion` | 3000 | 1234 | `.data/uploads/prod` | `.next-prod` | nyanotion.party |

dev 와 prod 는 포트가 같다. 같이 띄우지 않기 때문이다 — 운영이 돌고 있으면 개발은 beta 로 한다.

---

## 왜 나눴나

**마이그레이션을 가족 문서에 처음 돌려 보는 일이 없게 하려고.** 이게 거의 전부다.

`packages/db/migrations/` 의 SQL 은 한 번 적용되면 고치지 않는다. 잘못 쓴 것을 알아차리는
가장 싼 자리가 beta 다. 순서는 늘 같다:

```powershell
NYANOTION_ENV=beta pnpm db:migrate     # 먼저
pnpm serve:beta                        # 열어 보고
NYANOTION_ENV=prod pnpm db:migrate     # 그다음
```

빌드 폴더를 나눈 것도 같은 이유다. 예전에는 하나를 같이 써서, **베타를 빌드하면 돌고 있던
운영이 죽었다**(모든 요청이 500). `next.config.ts` 의 `distDir` 이 `NEXT_DIST_DIR` 을 본다.

---

## 설정을 읽는 차례

먼저 잡힌 값이 이긴다 (dotenv 는 이미 있는 키를 덮지 않는다) — `packages/db/src/env.ts`:

1. **셸 환경 변수** — 서비스·CI 가 넣어 준 값
2. **`$NYANOTION_SECRETS_DIR/<환경>.env`** — 비밀값. 저장소 밖
3. **`<저장소>/.env.<환경>`** — 그 환경 설정 (포트·도메인)
4. **`<저장소>/.env`** — 공통 기본값

### 비밀값을 저장소 밖에 두는 이유

저장소가 공개돼 있다. `.env*` 는 `.gitignore` 가 막지만, `git add -f` 한 번이면 끝이다.
애초에 다른 폴더에 있으면 그런 실수가 불가능하다.

```powershell
$env:NYANOTION_SECRETS_DIR = 'C:\nyanotion\secrets'
# → C:\nyanotion\secrets\prod.env 에 DATABASE_URL · BETTER_AUTH_SECRET
```

`scripts/setup.ps1 -SecretsDir C:\nyanotion\secrets` 로 하면 처음부터 그렇게 만들어 준다.
백업할 때 이 폴더를 같이 챙겨야 한다 — **여기가 없으면 DB 를 복구해도 로그인이 안 된다.**

### 바꾸면 안 되는 것

- **`BETTER_AUTH_SECRET` 을 바꾸면 모두 로그아웃된다.** 세션 쿠키를 그 값으로 서명한다.
- DB 역할 비밀번호를 바꾸면 돌고 있는 서버가 다음 접속부터 실패한다. 바꿀 때는 서버를 멈추고,
  `.env*` 와 비밀값 폴더를 **같이** 고칠 것.

---

## 터널

Cloudflare Tunnel 이 도메인 넷을 집으로 보낸다. `infra/cloudflared/config.example.yml` 참고.

```yaml
ingress:
  - hostname: collab.nyanotion.party        # 운영 동기화 (WebSocket — 먼저 와야 한다)
    service: ws://127.0.0.1:1234
  - hostname: collab-beta.nyanotion.party   # 베타 동기화
    service: ws://127.0.0.1:1334
  - hostname: beta.nyanotion.party          # 베타 웹
    service: http://127.0.0.1:3100
  - hostname: nyanotion.party               # 운영 웹
    service: http://127.0.0.1:3000
  - service: http_status:404
```

호스트 이름을 새로 쓰려면 DNS 를 한 번 걸어 줘야 한다:

```powershell
cloudflared tunnel route dns nyanotion beta.nyanotion.party
cloudflared tunnel route dns nyanotion collab-beta.nyanotion.party
```

**베타는 열어 둘 이유가 없다.** 밖에서 볼 일이 없으면 위 두 줄을 넣지 말고
`http://localhost:3100` 으로만 쓰는 편이 낫다 — 공격 면이 그만큼 줄어든다.

---

## 새 컴퓨터에서 처음부터

```powershell
git clone <저장소>
cd nyanotion
pwsh scripts/setup.ps1 -PostgresPassword '<수퍼유저 비밀번호>' -SecretsDir C:\nyanotion\secrets
pnpm dev
```

`vector` 확장은 수퍼유저만 켤 수 있고 pgvector 가 설치돼 있어야 한다
(`infra/install-pgvector.ps1`). 없으면 setup 이 알려 주고 넘어간다 — M6(RAG) 전까지는 필요 없다.

---

## 운영을 재부팅해도 살아 있게 (아직 안 함)

`docs/02-roadmap.md` M8. 지금은 손으로 띄운다:

```powershell
pnpm serve:prod
```

Windows 작업 스케줄러나 서비스로 올리는 것이 M8 의 일이다.
