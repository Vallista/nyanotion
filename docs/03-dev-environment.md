# 개발 · 운영 환경 (Windows 한 대)

이 PC가 서버이자 LLM 호스트이자 게임기다. 셋이 같은 GPU·같은 디스크를 쓰므로 경계를 명확히 둔다.

| | 어디서 도나 | 왜 |
| --- | --- | --- |
| PostgreSQL | Docker | 격리·백업·버전 고정이 쉽다 |
| web / collab / worker | Docker (개발 중에는 호스트에서 `pnpm dev`) | 메모리·CPU 상한을 걸 수 있다 |
| **Ollama** | **호스트에 직접 설치** | Windows에서 컨테이너에 GPU를 물리는 건 불안정하고, 게임 시 제어가 어렵다 |
| Cloudflare Tunnel | Docker | 포트 개방 없이 외부 공개 — **PWA·푸시에 HTTPS 가 필수라 M2부터 필요하다** |
| collab (Hocuspocus) | Docker (개발 중 호스트) | Yjs 동기화. 절대 멈추지 않는다 |

확인된 로컬 도구: Node v24.19.0 · pnpm 9.7.0 · Docker 29.7.2.

---

## 처음 한 번

```powershell
# 1) Ollama (호스트)
winget install Ollama.Ollama
ollama pull qwen3:8b          # 생성 모델 — VRAM 상황에 맞춰 조정
ollama pull bge-m3            # 임베딩 모델

# 2) 인프라
copy infra\.env.example infra\.env    # 값 채우기 (커밋 금지)
docker compose -f infra\docker-compose.yml up -d postgres

# 3) 앱
pnpm install
pnpm db:migrate
pnpm dev                       # apps/web → http://localhost:3000
```

## 매일 쓰는 명령

```powershell
pnpm dev                 # web 개발 서버
pnpm db:generate         # 스키마 변경 → 마이그레이션 SQL 생성
pnpm db:migrate          # 적용
pnpm db:studio           # Drizzle Studio
pnpm test                # 권한·변환기 등 단위 테스트
docker compose -f infra\docker-compose.yml logs -f
```

## 환경 변수 (`infra/.env`)

```
DATABASE_URL=postgres://nyanotion:***@localhost:5432/nyanotion
BETTER_AUTH_SECRET=***
BETTER_AUTH_URL=http://localhost:3000
ALLOW_PUBLIC_SIGNUP=false      # 가족만 — 초대 토큰 없이는 가입 불가
COLLAB_URL=ws://localhost:1234 # apps/collab (Hocuspocus)

OLLAMA_BASE_URL=http://host.docker.internal:11434
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
