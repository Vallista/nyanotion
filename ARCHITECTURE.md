# mungchi — 아키텍처

블록 에디터(노션 류) + 계정·조직 단위 문서 공유 + 로컬 LLM 기능을 가진 자체 호스팅 문서 서버.
집 Windows PC 한 대가 **서버 · 로컬 LLM · 게임기**를 겸하는 것이 전제 조건이며, 이 제약이 설계 곳곳에 들어가 있다.

- 데이터 모델 상세: `docs/01-data-model.md`
- 마일스톤: `docs/02-roadmap.md`
- 로컬 개발·운영 환경: `docs/03-dev-environment.md`

## 1. 결정 사항

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 언어 | 전부 TypeScript | 서버·클라이언트·워커 타입 공유 |
| 프레임워크 | Next.js (App Router) | UI + API를 한 프로세스에서. 스트리밍(LLM) 1급 지원 |
| DB | PostgreSQL 17 + `pgvector` | 관계형 + 전문검색(FTS) + 벡터를 한 DB에서. 백업 하나로 끝 |
| ORM | Drizzle | TS 우선, 마이그레이션이 SQL 파일로 남음, 런타임 엔진 없음 |
| 인증 | Better Auth (+ organization 플러그인) | 조직·멤버·역할·초대가 내장. Auth.js는 2025-09부터 보안 패치만 |
| 에디터 | BlockNote (ProseMirror ← Tiptap 위) | 노션식 블록·슬래시 메뉴·드래그 핸들·중첩이 기본 제공, Yjs 협업 내장 |
| 실시간 협업 | Yjs + Hocuspocus | CRDT. M6에서 켠다 (저장 포맷은 M1부터 대비) |
| LLM | 호스트의 Ollama + Vercel AI SDK | GPU 직접 접근. OpenAI 호환 엔드포인트라 클라우드로 교체 가능 |
| 외부 공개 | Cloudflare Tunnel | 공유기 포트 개방·고정 IP·인증서 갱신 전부 불필요 |

## 2. 구조

```
apps/
  web/        Next.js — UI + API Route Handlers + Server Actions   [M0~]
  collab/     Hocuspocus — Yjs 문서 WebSocket 서버                  [M6]
  worker/     임베딩·요약 등 백그라운드 잡 러너                      [M5]
packages/
  db/         Drizzle 스키마 + 마이그레이션 (SQL 파일이 원본)
  auth/       Better Auth 설정 + 권한 판정(access.ts)
  ai/         Ollama 게이트웨이 · 프롬프트 · GPU 모드
  shared/     zod 스키마 · 공용 타입 · 블록 JSON ↔ 평문 변환
infra/
  docker-compose.yml   postgres(pgvector) · web · collab · worker
  cloudflared/         터널 설정
docs/
```

pnpm workspace. 앱이 셋으로 나뉘는 이유는 **GPU/CPU 부하를 프로세스 단위로 끊어내기 위해서**다 — 게임 중에는 `worker`만 멈추면 되고 문서 편집은 계속 돌아간다.

## 3. 도메인 모델 (요약)

핵심은 네 겹이다. 상세 컬럼은 `docs/01-data-model.md`.

```
user ──┬── member ── organization
       │
       └── space (kind: personal | org)
              └── document (parent_id 트리 = 그룹)
                     ├── document_tag ── tag        (카테고리)
                     ├── document_share             (권한)
                     ├── comment / attachment
                     └── chunk ── embedding          (RAG)
```

- **공간(space)** 하나로 "내 문서"와 "조직 문서"를 통일한다. 가입하면 개인 space가 1개 자동 생성되고, 조직을 만들면 조직 space가 1개 생긴다. 이후 모든 코드는 space만 보면 된다.
- **그룹 = 문서 트리.** `document.parent_id` + `position`(fractional index) 으로 중첩 페이지를 만든다. 별도의 "폴더" 개념을 두지 않는다 — 노션과 같은 이유로, 폴더와 문서가 따로 있으면 이동/권한 규칙이 두 벌이 된다.
- **카테고리 = 태그.** space 범위의 다대다 태그. 그 위에 `collection`(저장된 필터+정렬+뷰)을 올려 "표/보드/리스트" 뷰를 만든다.
- **권한은 문서에 붙고 트리를 따라 상속된다.** 판정은 `packages/auth/access.ts` **한 곳에서만** 한다.

## 4. 권한 모델

문서에 대한 실효 역할 = 다음 중 **가장 강한 것**:

1. `document_share` 중 나(user) 또는 내가 속한 조직(org)을 대상으로 한 것
2. 조상 문서들의 `document_share` (상속)
3. space 기본 권한 — personal space는 소유자만, org space는 멤버 역할에 따라
4. 공개 링크(`public_link`)로 들어온 경우 그 링크의 역할

역할: `viewer < commenter < editor < owner`. 조직 역할(`owner/admin/member/guest`)은 조직 수준 행위(멤버 초대, space 생성)에만 쓰고 문서 권한과 섞지 않는다.

> **규칙:** 모든 문서 조회는 `readableDocumentIds(userId, scope)` 를 먼저 통과한다. 특히 **벡터 검색은 권한으로 좁힌 뒤에 한다** — 반대로 하면 임베딩을 통해 남의 문서 내용이 새어 나간다.

## 5. 콘텐츠 저장 포맷

한 문서는 세 가지 표현을 갖는다.

| 컬럼 | 내용 | 쓰는 곳 |
| --- | --- | --- |
| `content_json` | BlockNote 블록 트리 (jsonb) | 렌더링·편집의 원본 (M1~M5) |
| `ydoc_state` | Yjs 문서 상태 (bytea, nullable) | 실시간 협업의 원본 (M6~) |
| `text_plain` | 블록을 평문으로 펼친 것 | FTS · LLM 입력 · 청킹 |

M1~M5는 `content_json`이 원본이고 `ydoc_state`는 비어 있다. M6에서 Hocuspocus를 붙일 때 `content_json → Y.Doc` 로 1회 변환해 넣고 원본을 `ydoc_state`로 옮긴다. 그 이후에도 `content_json`은 저장 시마다 **파생 값으로 계속 갱신**한다 — 검색·렌더·API가 CRDT를 몰라도 되게 하기 위해서다.

`text_plain`은 저장 시 트리거가 아니라 애플리케이션에서 만든다(`packages/shared`의 변환기 하나). `tsvector` GIN 인덱스는 이 컬럼에 건다.

## 6. AI 계층

```
브라우저 ──SSE──> apps/web /api/ai/*  ──> packages/ai 게이트웨이 ──> Ollama (호스트, 127.0.0.1:11434)
                                                  │                    └ 생성: 요약·이어쓰기·번역·제목
                                                  │                    └ 임베딩: bge-m3 등
                                                  └─(게임 모드)──> 큐에 적재 또는 클라우드 폴백
```

기능:
- **인라인 AI** — 슬래시 명령(`/ai`)으로 이어쓰기·요약·다듬기. 선택 블록만 컨텍스트로.
- **문서 질의(RAG)** — 내가 읽을 수 있는 문서들에 대해 하이브리드 검색(FTS + 벡터) → 근거 블록과 함께 답변.
- **자동 분류** — 새 문서에 태그·제목 추천 (사용자가 수락해야 반영).

RAG 파이프라인은 `worker`가 돈다: 문서 저장 → `ai_job(kind='embed')` 적재 → 워커가 청킹 → 임베딩 → `embedding` upsert. 동기 요청 경로에서는 절대 임베딩하지 않는다.

**모든 LLM 호출은 `packages/ai` 게이트웨이를 통과한다.** 모델명·타임아웃·동시 실행 수·GPU 모드 판정이 전부 거기 있다.

## 7. 게임과의 공존 — GPU 조정

이 프로젝트의 고유 제약이자 가장 먼저 틀리기 쉬운 부분.

- **Ollama는 호스트에 설치**한다(Docker 안이 아니라). Windows에서 컨테이너에 GPU를 물리는 것보다 안정적이고, 게임 시 제어가 쉽다.
- **GPU 모드** 상태 하나를 앱이 들고 있다: `free | gaming`.
  - `gaming`으로 바뀌면 → Ollama에 `keep_alive: 0` 요청으로 모델을 VRAM에서 내리고, `worker`의 임베딩 배치를 정지, UI는 AI 버튼에 "게임 중" 표시.
  - 사용자가 굳이 쓰겠다면 `AI_FALLBACK_BASE_URL`(클라우드, OpenAI 호환)로 우회. 미설정이면 잡을 큐에 쌓아 두고 `free`가 되면 처리.
  - 전환은 수동 토글이 기본, 선택적으로 게임 프로세스 감시 스크립트가 자동 전환.
- **Postgres·web은 Docker에서 메모리·CPU 상한을 걸고** 돌린다. 게임 중에도 문서 편집은 되어야 하므로 죽이지는 않는다.
- 임베딩 모델은 생성 모델과 분리하고 작게(예: `bge-m3`) 잡아 `free` 구간에서 빨리 비운다.

## 8. 배포·운영

- 전부 `infra/docker-compose.yml` 한 장. Windows 부팅 시 Docker Desktop 자동 실행 + `restart: unless-stopped`.
- 외부 공개는 **Cloudflare Tunnel** — 포트 개방 없이 `https://<도메인>` 으로 붙는다. 집 IP가 노출되지 않고 인증서 갱신도 없다.
- 백업: 매일 `pg_dump` + 첨부파일 디렉터리를 외장/클라우드로. **복구 리허설을 한 번은 해 본다.**
- 비밀 값(세션 시크릿, DB 비밀번호, 터널 토큰)은 `infra/.env` — git 무시. 커밋 금지.

## 9. 나중으로 미룬 것

명시적으로 **안 하는** 것들. 필요해지면 그때 판단한다.

- 오프라인 우선/로컬 퍼스트 동기화 (Yjs를 쓰지만 서버가 원본)
- 모바일 네이티브 앱 — 반응형 웹으로 간다
- 블록 단위 권한 — 문서 단위까지만
- 노션 데이터베이스의 관계형 속성(relation/rollup) — `collection`은 필터 뷰까지만
- 멀티 테넌트 격리(스키마 분리) — 한 DB, `space_id` 스코프로 충분
