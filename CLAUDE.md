# Nyanotion 🐱 — 블록 에디터 문서 서버 · 전부 TypeScript

구조·스택·클라이언트 전략·데이터 모델·권한·AI·배포는 **`ARCHITECTURE.md`** 가 기준. 새 작업은 그 구조를 따른다.
마일스톤과 진행 기록은 **`docs/`** (`docs/README.md` 부터). 마일스톤을 끝내면 `docs/04-history.md` 와 `docs/02-roadmap.md` 를 갱신할 것.

```
apps/web/          Next.js (App Router) — UI + API + PWA. 모든 기기가 이걸 본다
apps/collab/       Hocuspocus (Yjs) 동기화 서버                     [M2]
apps/worker/       임베딩·요약 백그라운드 잡 러너                     [M6]
apps/shell-ios/    Capacitor 셸 — UI 코드 없음, 서버 URL만 로드       [M7, 조건부]
apps/shell-desktop/ Electron 셸 — 위와 같음                          [M7, 조건부]
packages/db/       Drizzle 스키마 + 마이그레이션
packages/auth/     Better Auth 설정 + 권한 판정(access.ts)
packages/ai/       Ollama 게이트웨이 · 프롬프트 · GPU 모드
packages/shared/   zod 스키마 · 공용 타입 · 블록↔평문 변환
infra/             docker-compose · cloudflared · .env(무시됨)
```

## 규칙

### 권한
- **권한 판정은 `packages/auth/access.ts` 한 곳에서만.** 라우트·쿼리에 조건을 손으로 짜 넣지 말 것.
- **문서 조회는 전부 `readableDocumentIds()` 를 먼저 통과한다.** 특히 **벡터 검색은 권한으로 좁힌 뒤에** — 순서가 바뀌면 임베딩 유사도로 남의 문서가 샌다.
- 가족 역할(`owner/admin/member/guest`)은 가족 수준 행위에만. 문서 권한(`viewer/commenter/editor/owner`)과 섞지 말 것.
- **공개 가입 없음.** 가입은 초대 토큰이 있어야만. `ALLOW_PUBLIC_SIGNUP` 을 true 로 만드는 코드 경로를 만들지 말 것.

### 콘텐츠
- **M2부터 콘텐츠 원본은 `ydoc_state`(Yjs).** `content_json` 과 `text_plain` 은 저장 시마다 갱신하는 **파생값**이다. 검색·렌더·API·LLM 은 파생값만 본다 — CRDT 를 몰라야 한다.
- **`text_plain` 은 애플리케이션이 만든다** (`packages/shared` 변환기 하나). DB 트리거로 만들지 않는다.
- **문서 삭제는 `archived_at` 로만.** 하드 삭제는 모래상자 비우기에서 하위 트리 통째로.
- **형제 정렬은 fractional index(`position`).** 순번 재배열로 다른 행을 건드리지 말 것.
- 사이드바 트리 조회에 `content_json`/`ydoc_state` 를 넣지 말 것 (무겁다). `title/icon/parent_id/position` 만.

### 에디터
- **BlockNote UI 는 Ariakit 판(`@blocknote/ariakit`)이다.** Mantine 판은 쓰지 않는다 — `@mantine/core` 가 React 에 아직 없는 `useEffectEvent` 를 불러 빌드가 깨진다.
- **Ariakit 판 `BlockNoteView` 는 `theme` 을 `"light" | "dark"` 만 받는다.** 색은 `globals.css` 의 `--bn-*` 변수로 맞춘다. 메뉴·툴팁이 portal 로 나가므로 그 변수는 `:root` 에 둔다.
- 에디터 파일(`components/editor.tsx`)은 항상 클라이언트이고 `next/dynamic` 의 `ssr: false` 로만 불러온다.
- **`text_plain` 을 만드는 경로는 `setContent()` 하나뿐이다.** 다른 곳에서 저장하지 말 것.

### 클라이언트
- **UI 코드는 `apps/web` 에만.** `apps/shell-*` 은 서버 URL 을 로드하는 설정 수준이어야 한다. 셸에 화면을 만들기 시작하면 설계가 무너진다.
- **에디터는 DOM 기반(ProseMirror)이다.** React Native 로 에디터를 올리려는 시도를 하지 말 것 — `docs/05-clients.md` §1.
- 모바일 Safari 기준으로 만든다: `100vh` 대신 `100dvh`, 사이드바는 드로어, 터치 타깃 크기.
- **오프라인에서 동작해야 한다.** 서버 응답을 전제로 한 UI 를 만들지 말 것. 쓰기는 항상 로컬 Y.Doc 에 먼저 들어간다.

### AI
- **모든 LLM 호출은 `packages/ai` 게이트웨이를 통과한다.** 라우트에서 Ollama 를 직접 부르지 말 것. 모델명·타임아웃·동시성·GPU 모드 판정이 전부 거기 있다.
- **동기 요청 경로에서 임베딩하지 않는다.** `ai_job` 에 넣고 `worker` 가 처리한다.
- **GPU 모드가 `gaming` 이면 AI 경로만 멈춘다.** Postgres·web·collab 은 절대 멈추지 않는다.

### 그 외
- **DB 스키마 변경은 `packages/db/migrations/` 에 새 번호로 추가.** 적용된 SQL 은 고치지 않는다.
- **비밀 값은 커밋 금지.** `infra/.env` 는 git 무시. 예시는 `infra/.env.example` 에만.
- 고양이 이름(냥이·캣타워·모래상자·츄르)은 **UI 문구에서만**. DB 컬럼·코드 식별자는 평범한 영어로.

## 명령

```powershell
pnpm install
pnpm dev                 # apps/web → http://localhost:3000
pnpm dev:collab          # apps/collab (Hocuspocus)
pnpm db:generate         # 스키마 변경 → 마이그레이션 SQL 생성
pnpm db:migrate
pnpm db:studio
pnpm test
ollama list              # 호스트에 설치된 모델 (M5 부터)

# PostgreSQL 은 Windows 서비스로 직접 돈다 (Docker 아님 — 이 PC 엔 WSL2 가 없다)
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U nyanotion -h 127.0.0.1 -d nyanotion -c "\dt"
```

- **같은 PostgreSQL 인스턴스에 2DActionGames 의 `game` DB 가 같이 산다.** DB·역할이 분리돼 있어 서로 안 건드리지만, 서비스를 재시작·초기화할 때는 양쪽이 같이 영향을 받는다.
- Ollama base URL 은 `127.0.0.1:11434` (호스트 직접 설치).
- **폰에서 테스트하려면 HTTPS 가 필요하다** (Service Worker·푸시). 로컬은 Cloudflare Tunnel 또는 `next dev --experimental-https`.
- 게임 중이면 GPU 모드가 `gaming` 일 수 있다 → AI 경로는 큐에 쌓인다. `/api/admin/gpu-mode` 로 확인.
- 권한 관련 변경은 테스트부터. "다른 계정 문서가 안 보인다"를 증명하지 않고 넘어가지 않는다.
