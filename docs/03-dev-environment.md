# 개발 · 운영 환경 (Windows 한 대)

이 PC가 서버이자 LLM 호스트이자 게임기다. 셋이 같은 GPU·같은 디스크를 쓰므로 경계를 명확히 둔다.

| | 어디서 도나 | 왜 |
| --- | --- | --- |
| **PostgreSQL 17** | **Windows 서비스로 직접 설치** (`postgresql-x64-17`) | 이 PC 에서 Docker 가 안 뜬다 — 아래 참고. 게임기 겸용이라 WSL2 를 안 쓰는 편이 가볍기도 하다 |
| web / collab / worker | 호스트에서 `pnpm dev` | |
| **Ollama** | **호스트에 직접 설치** | Windows 에서 컨테이너에 GPU 를 물리는 건 불안정하고, 게임 시 제어가 어렵다 |
| Cloudflare Tunnel | 호스트 `cloudflared` | 포트 개방 없이 외부 공개 — **PWA·푸시에 HTTPS 가 필수라 M2 부터 필요하다** |

확인된 로컬 도구: Node v24.19.0 · pnpm 9.7.0 · PostgreSQL 17 · CPU Ryzen 7 7800X3D.

### Docker 를 왜 안 쓰나

이 PC 에는 **WSL2 배포판이 없어서 Docker Desktop 의 엔진이 뜨지 않는다** (`docker info` 가 500). 켜려면 관리자 권한으로
`wsl --install --no-distribution` 후 재부팅이 필요하다. 지금은 그럴 이유가 없어서 Postgres 를 Windows 서비스로 직접 쓴다.

`infra/docker-compose.yml` 은 남겨 둔다 — 나중에 WSL2 를 켜거나 다른 기계로 옮길 때 그대로 쓸 수 있고, pgvector 가 들어
있는 이미지라 M6 에서 되살릴 값이 있다.

> **M6 전에 해결할 것: 이 PostgreSQL 에는 `pgvector` 가 없다.** (`pg_available_extensions` 에 `vector` 없음, `pg_trgm` 은 있음)
> M5 까지는 상관없고, M6(RAG) 에 가서 pgvector 를 따로 설치하거나 그때 Docker 로 옮긴다.

> **게임 성능 참고:** 이 PC 는 VBS/메모리 무결성이 켜져 있다 (`VirtualizationBasedSecurityStatus=2`). 7800X3D 에서 프레임을
> 깎는 설정이라 게임을 중시하면 끄는 걸 검토할 만하다. WSL2 와는 별개 설정이라 둘을 따로 정할 수 있다.

---

## 처음 한 번

```powershell
# 1) PostgreSQL 17 (Windows 설치본) — DB 와 역할을 한 번만 만든다. 관리자 PowerShell.
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 `
  -c "CREATE ROLE nyanotion LOGIN PASSWORD 'nyanotion_dev' CREATEDB;" `
  -c "CREATE DATABASE nyanotion OWNER nyanotion;"

# 2) 환경 변수 — 저장소 루트에 .env 하나 (infra/ 안이 아니다)
copy .env.example .env         # 값 채우기 (커밋 금지)

# 3) 앱
pnpm install
pnpm db:migrate
pnpm dev                       # apps/web → http://localhost:3000

# 4) Ollama — M5 부터 필요하다. 지금 안 깔아도 된다.
winget install Ollama.Ollama
ollama pull qwen3:8b           # 생성 모델 — VRAM 상황에 맞춰 조정
ollama pull bge-m3             # 임베딩 모델
```

### postgres 비밀번호를 잊었다면

재설치할 필요 없다. 관리자 PowerShell 에서 `pg_hba.conf` 를 잠시 `trust` 로 바꿨다가 되돌린다.

```powershell
$pg = "C:\Program Files\PostgreSQL\17"; $hba = "$pg\data\pg_hba.conf"
Copy-Item $hba "$hba.bak" -Force
(Get-Content $hba) -replace '\b(scram-sha-256|md5)\b','trust' | Set-Content $hba
Restart-Service postgresql-x64-17; Start-Sleep 3
& "$pg\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER USER postgres PASSWORD '새비밀번호';"
Copy-Item "$hba.bak" $hba -Force
Restart-Service postgresql-x64-17
```

### 첫 계정

`ALLOW_PUBLIC_SIGNUP=false` 라도 **계정이 하나도 없을 때의 첫 가입은 통과한다** (초대할 사람이 없으므로).
그 다음부터는 초대받은 주소만 가입된다.

```powershell
curl.exe -s -X POST http://localhost:3000/api/auth/sign-up/email `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"you@example.com\",\"password\":\"열자이상비밀번호\",\"name\":\"집사\"}'
```

## 매일 쓰는 명령

```powershell
pnpm dev                 # web 개발 서버
pnpm db:generate         # 스키마 변경 → 마이그레이션 SQL 생성
pnpm db:migrate          # 적용
pnpm db:studio           # Drizzle Studio
pnpm test                # 권한·변환기 등 단위 테스트
```

Postgres 를 직접 만질 때:

```powershell
$psql = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
& $psql -U nyanotion -h 127.0.0.1 -d nyanotion -c "\dt"
Restart-Service postgresql-x64-17      # 관리자 권한
```

> 같은 PostgreSQL 인스턴스에 **2DActionGames 의 `game` DB 가 같이 산다.** DB 와 역할이 분리돼 있으니 서로 안 건드리지만,
> 서비스를 재시작하거나 밀 때는 양쪽 다 영향을 받는다는 걸 기억할 것. 백업도 두 DB 를 따로 떠야 한다.

## 환경 변수 (저장소 루트 `.env`)

```
DATABASE_URL=postgres://nyanotion:***@localhost:5432/nyanotion
BETTER_AUTH_SECRET=***
BETTER_AUTH_URL=http://localhost:3000
ALLOW_PUBLIC_SIGNUP=false      # 가족만 — 초대 토큰 없이는 가입 불가
COLLAB_URL=ws://localhost:1234 # apps/collab (Hocuspocus)

OLLAMA_BASE_URL=http://127.0.0.1:11434
AI_CHAT_MODEL=qwen3:8b
AI_EMBED_MODEL=bge-m3
AI_EMBED_DIM=1024
AI_MAX_CONCURRENCY=1
AI_FALLBACK_BASE_URL=          # 비워두면 게임 중 AI 잡은 큐에 쌓인다
AI_FALLBACK_API_KEY=

CLOUDFLARE_TUNNEL_TOKEN=
```

> `apps/web` 이 컨테이너 안에서 호스트 Ollama를 부를 때는 `host.docker.internal`, 호스트에서 `pnpm dev` 로 돌릴 때는 `127.0.0.1`. 두 값이 다르니 `.env` 를 개발용/컨테이너용으로 나눠 둔다.

---

## GPU 모드 — 게임과 공존

상태는 `free` 와 `gaming` 둘뿐이고, 앱이 DB(또는 작은 상태 파일)에 들고 있다.

**`gaming` 으로 넘어갈 때**
1. Ollama에 `keep_alive: 0` 으로 빈 요청 → 로드된 모델을 VRAM에서 내림
2. `worker` 는 `ai_job` 을 집어가지 않음 (돌던 잡은 끝내고 멈춤)
3. UI: AI 버튼이 "게임 중 — 나중에 처리" 로 바뀜
4. `AI_FALLBACK_BASE_URL` 이 있으면 대화형 요청만 클라우드로 우회

**`free` 로 돌아올 때** — 큐에 쌓인 잡을 순서대로 처리.

전환은 수동 토글이 기본. 자동화하고 싶으면 게임 프로세스를 감시해 API를 때리는 스크립트를 둔다:

```powershell
# 예시 — 실행 중인 게임 프로세스를 보고 GPU 모드를 맞춘다
$games = @('cs2','Cyberpunk2077','eldenring')
while ($true) {
  $running = @(Get-Process -Name $games -ErrorAction SilentlyContinue).Count -gt 0
  $mode = if ($running) { 'gaming' } else { 'free' }
  Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/admin/gpu-mode `
    -ContentType application/json -Body (@{ mode = $mode } | ConvertTo-Json) | Out-Null
  Start-Sleep -Seconds 20
}
```

**원칙:** 게임 중에도 문서 편집·검색은 정상 속도여야 한다. 그래서 느려질 수 있는 건 AI 경로뿐이고, Postgres/web 컨테이너는 절대 멈추지 않는다.

---

## 백업

```powershell
# 일일 — 작업 스케줄러에 등록
docker exec nyanotion-postgres pg_dump -U nyanotion nyanotion | Out-File -Encoding utf8 D:\backup\nyanotion_$(Get-Date -f yyyyMMdd).sql
robocopy infra\data\attachments D:\backup\attachments /MIR
```
30일치 보관, 월 1회는 외부(클라우드/외장)로. **복구를 실제로 한 번 해 보기 전에는 백업이 있다고 치지 않는다.**

---

## 함정 모음

- **Docker Desktop과 게임의 메모리 충돌** — WSL2 백엔드가 램을 잡아먹는다. `%UserProfile%\.wslconfig` 에 `memory=8GB` 정도로 상한.
- **파일 감시** — 프로젝트를 Windows 경로에 두고 Docker로 마운트하면 HMR이 느리다. 개발 중에는 `pnpm dev` 를 호스트에서 돌리고 DB만 컨테이너로.
- **한국어 전문검색** — Postgres 기본에 한국어 분석기가 없다. `simple` + trigram 으로 시작하고, 부족해지면 그때 바꾼다. 미리 `pg_bigm` 빌드에 시간 쓰지 말 것.
- **임베딩 차원** — 모델을 바꾸면 `vector(N)` 이 달라진다. `AI_EMBED_DIM` 을 바꿀 때는 마이그레이션으로 새 컬럼/테이블을 만들고 재임베딩한다.
- **Ollama 동시 실행** — `AI_MAX_CONCURRENCY=1` 로 시작. 게임용 VRAM을 남겨야 한다.


---

## 폰(iOS)에서 테스트하기

**Service Worker · 푸시 · Persistent Storage 는 전부 HTTPS 에서만 돈다.** `http://192.168.x.x:3000` 으로는 PWA 를 검증할 수 없다.

두 가지 방법:

```powershell
# A) Next.js 로컬 HTTPS — 자체 서명 인증서. 빠르지만 iOS 가 인증서를 싫어할 수 있다
pnpm dev --experimental-https

# B) Cloudflare Tunnel (권장) — 진짜 인증서, 실제 도메인. 외부에서도 붙는다
docker compose -f infra\docker-compose.yml up -d cloudflared
# → https://nyanotion.<도메인> 을 아이폰 Safari 로 연다
```

**아이폰에 설치**: Safari 로 열고 → 공유 버튼 → **홈 화면에 추가**.
이 경로는 메뉴에 숨어 있어서 말로 설명하면 가족이 반드시 실패한다 → **`/install` 안내 페이지를 만들어 스크린샷을 넣는다.**

검증할 것:
- [ ] 홈 화면 아이콘에서 열면 Safari UI 없이 독립 창으로 뜬다
- [ ] **비행기 모드에서 문서를 편집할 수 있다** (IndexedDB)
- [ ] 다시 온라인이 되면 서버와 자동 병합된다
- [ ] 소프트 키보드가 올라와도 커서가 가려지지 않는다 (`100dvh`)
- [ ] 알림 권한 수락 후 Persistent Storage 요청이 성공한다

### iOS 네이티브 앱은 이 PC에서 못 만든다

Capacitor·Tauri·React Native 어느 쪽이든 **iOS 바이너리는 macOS + Xcode 에서만 나온다.**
이 집엔 Windows PC 뿐이므로 네이티브 셸(M7)을 만들려면 Mac 또는 클라우드 맥 빌드(GitHub Actions macOS 러너 / Codemagic)와 Apple Developer Program 연 $99 가 필요하다.
→ `docs/05-clients.md` 의 체크리스트 중 하나가 실제로 아쉬워지기 전까지는 **PWA 로 간다.**

데스크탑 셸(Electron)은 Windows 에서 그대로 빌드된다 — 필요하면 언제든.
