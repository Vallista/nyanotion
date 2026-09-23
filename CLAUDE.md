# mungchi — 블록 에디터 문서 서버 · 전부 TypeScript

구조·스택·데이터 모델·권한·AI·배포는 **`ARCHITECTURE.md`** 가 기준. 새 작업은 그 구조를 따른다.
마일스톤과 진행 기록은 **`docs/`** (`docs/README.md` 부터). 마일스톤을 끝내면 `docs/04-history.md` 와 `docs/02-roadmap.md` 를 갱신할 것.

```
apps/web/      Next.js (App Router) — UI + API
apps/collab/   Hocuspocus (Yjs) WebSocket 서버       [M6]
apps/worker/   임베딩·요약 백그라운드 잡 러너          [M5]
packages/db/   Drizzle 스키마 + 마이그레이션
packages/auth/ Better Auth 설정 + 권한 판정(access.ts)
packages/ai/   Ollama 게이트웨이 · 프롬프트 · GPU 모드
packages/shared/ zod 스키마 · 공용 타입 · 블록↔평문 변환
infra/         docker-compose · cloudflared · .env(무시됨)
```

## 규칙

- **권한 판정은 `packages/auth/access.ts` 한 곳에서만.** 라우트·쿼리에 조건을 손으로 짜 넣지 말 것.
- **문서 조회는 전부 `readableDocumentIds()` 를 먼저 통과한다.** 특히 **벡터 검색은 권한으로 좁힌 뒤에** 한다 — 순서가 바뀌면 임베딩 유사도로 남의 문서가 샌다.
- **모든 LLM 호출은 `packages/ai` 게이트웨이를 통과한다.** 모델명·타임아웃·동시성·GPU 모드 판정이 전부 거기 있다. 라우트에서 Ollama를 직접 부르지 말 것.
- **동기 요청 경로에서 임베딩하지 않는다.** `ai_job` 에 넣고 `worker` 가 처리한다.
- **문서 삭제는 `archived_at` 로만.** 하드 삭제는 휴지통 비우기에서 하위 트리 통째로.
- **형제 정렬은 fractional index (`position`).** 순번 재배열로 다른 행을 건드리지 말 것.
- **`text_plain` 은 저장할 때 애플리케이션이 만든다** (`packages/shared` 변환기 하나). DB 트리거로 만들지 않는다. FTS·청킹·LLM 입력이 전부 이 값을 본다.
- **콘텐츠 원본은 M5까지 `content_json`, M6부터 `ydoc_state`.** 전환 후에도 `content_json`·`text_plain` 은 파생값으로 계속 갱신한다 — 검색·렌더·API가 CRDT를 몰라도 되게.
- **DB 스키마 변경은 `packages/db/migrations/` 에 새 번호로 추가.** 적용된 SQL은 고치지 않는다.
- **비밀 값은 커밋 금지.** `infra/.env` 는 git 무시. 예시는 `infra/.env.example` 에만.
- 조직 역할(`owner/admin/member/guest`)은 조직 수준 행위에만 쓴다. 문서 권한(`viewer/commenter/editor/owner`)과 섞지 말 것.
- 사이드바 트리 조회에 `content_json` 을 넣지 말 것 (무겁다). `title/icon/parent_id/position` 만.

## 명령

```powershell
pnpm install
pnpm dev                 # apps/web → http://localhost:3000
pnpm db:generate         # 스키마 변경 → 마이그레이션 SQL 생성
pnpm db:migrate
pnpm db:studio
pnpm test
docker compose -f infra\docker-compose.yml up -d postgres
docker compose -f infra\docker-compose.yml logs -f
ollama list              # 호스트에 설치된 모델 (컨테이너 아님)
```

- 개발 중에는 **DB만 컨테이너, 앱은 호스트에서 `pnpm dev`** — Windows 경로를 마운트하면 HMR이 느리다.
- Ollama base URL: 호스트 실행 시 `127.0.0.1:11434`, 컨테이너에서 부를 때 `host.docker.internal:11434`.
- 게임 중 테스트라면 GPU 모드가 `gaming` 일 수 있다 → AI 경로는 큐에 쌓인다. `/api/admin/gpu-mode` 로 확인.
- 권한과 관련된 변경은 테스트부터. "다른 계정 문서가 안 보인다"를 증명하지 않고 넘어가지 않는다.
