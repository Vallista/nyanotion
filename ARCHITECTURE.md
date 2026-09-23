# Nyanotion 🐱 — 아키텍처

블록 에디터(노션 류) + 가족 계정 단위 문서 공유 + 로컬 LLM 기능을 가진 **자체 호스팅 문서 서버**.
집 Windows PC 한 대가 **서버 · 로컬 LLM · 게임기**를 겸하고, **데스크탑과 iOS에서 같은 문서를 본다**는 것이 전제다.
이 두 제약이 설계 곳곳에 들어가 있다.

- 데이터 모델: `docs/01-data-model.md`
- 마일스톤: `docs/02-roadmap.md`
- 개발·운영 환경: `docs/03-dev-environment.md`
- 기록: `docs/04-history.md`
- **클라이언트 전략(PWA / iOS / 데스크탑): `docs/05-clients.md`**

## 1. 결정 사항

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 언어 | 전부 TypeScript | 서버·클라이언트·워커 타입 공유 |
| 프레임워크 | Next.js (App Router) | UI + API를 한 프로세스에서. LLM 스트리밍 1급 지원 |
| DB | PostgreSQL 17 + `pgvector` | 관계형 + 전문검색 + 벡터를 한 DB에서. 백업 하나로 끝 |
| ORM | Drizzle | TS 우선, 마이그레이션이 SQL로 남음, 런타임 엔진 없음 |
| 인증 | Better Auth (organization 플러그인) | 가족·멤버·역할·초대가 내장. **공개 가입 없음 — 초대 전용** |
| 에디터 | BlockNote (Tiptap ← ProseMirror) | 노션식 블록 UX + Yjs 협업 내장 |
| 동기화 | **Yjs + Hocuspocus + y-indexeddb** | 오프라인 편집과 기기 간 동기화. 집 서버가 꺼져도 쓸 수 있어야 한다 |
| **클라이언트** | **PWA 우선 → 필요 시 네이티브 셸** | iOS 네이티브 빌드는 Mac이 필요하다. 상세는 §3 |
| LLM | 호스트의 Ollama + Vercel AI SDK | GPU 직접 접근. OpenAI 호환이라 클라우드로 교체 가능 |
| 외부 공개 | Cloudflare Tunnel (+ 초대 전용) | 포트 개방·고정 IP·인증서 갱신 불필요 |
| 범위 | **가족만** | 공개 가입·과금·감사로그·정교한 레이트리밋 전부 불필요 |

## 2. 구조

```
apps/
  web/        Next.js — UI + API + PWA (모든 기기가 이걸 본다)       [M0~]
  collab/     Hocuspocus — Yjs WebSocket 동기화 서버                 [M2]
  worker/     임베딩·요약 백그라운드 잡 러너                          [M6]
  shell-ios/  Capacitor 셸 (web 을 로드)                   [M7, 필요해지면]
  shell-desktop/ Electron 셸 (web 을 로드)                 [M7, 필요해지면]
packages/
  db/         Drizzle 스키마 + 마이그레이션 (SQL 파일이 원본)
  auth/       Better Auth 설정 + 권한 판정(access.ts)
  ai/         Ollama 게이트웨이 · 프롬프트 · GPU 모드
  shared/     zod 스키마 · 공용 타입 · 블록 JSON ↔ 평문 변환
infra/
  docker-compose.yml   postgres(pgvector) · web · collab · worker · cloudflared
docs/
```

pnpm workspace, 패키지 스코프는 `@nyanotion/*`.
앱이 나뉘는 이유는 **부하를 프로세스 단위로 끊어내기 위해서**다 — 게임 중에는 `worker`만 멈추면 되고 문서 편집·동기화는 계속 돈다.

## 3. 클라이언트 — 데스크탑과 iOS

> 상세와 판단 근거는 `docs/05-clients.md`. 여기는 결론만.

**핵심 제약 두 개**

1. **에디터가 DOM 기반이다.** BlockNote는 ProseMirror 위에 있어서 React Native로는 못 올린다. 네이티브 앱을 만들더라도 **에디터는 결국 WebView 안에서 돈다.** 그러므로 "웹 앱 하나 + 얇은 셸"이 유일하게 합리적인 구조다.
2. **iOS 네이티브 빌드에는 macOS + Xcode가 필요하다.** 이 집에는 Windows PC뿐이다. 즉 Capacitor로 감싸는 순간 Mac(또는 클라우드 맥 빌드)과 Apple Developer Program 연 $99가 따라온다.

**결론: PWA 우선.**

| | 방법 | Mac 필요 | 비용 |
| --- | --- | --- | --- |
| iOS | Safari → **홈 화면에 추가** (PWA) | ❌ | 0 |
| 데스크탑 (Win/Mac) | Edge/Chrome → **앱으로 설치** (PWA) | ❌ | 0 |
| iOS (나중에) | Capacitor 셸 + TestFlight/Ad-hoc | ✅ | $99/년 |
| 데스크탑 (나중에) | Electron 셸 | ❌ | 0 |

iOS 26 기준 홈 화면에 추가한 PWA는 **푸시 알림·오프라인 캐시·독립 창**이 전부 된다. 가족만 쓰므로 **App Store 심사가 애초에 필요 없다** — 네이티브 앱을 만들 이유의 절반이 사라진다.

네이티브 셸은 **나중에 붙이는 얇은 층**으로 설계한다. `apps/shell-*` 은 UI 코드를 갖지 않고 서버 URL을 로드하기만 한다. 그래서 PWA로 시작했다가 필요해지면 셸만 추가하면 되고, 그 반대도 된다.

**셸이 필요해지는 조건** (이 중 하나라도 실제로 아쉬워질 때만 만든다)
- iOS 공유 시트로 다른 앱에서 바로 스크랩
- 위젯 / Siri 단축어
- 생체 인증 잠금
- 백그라운드 동기화 (iOS PWA는 Background Sync API가 없다)

## 4. 오프라인과 동기화 — 이 설계의 중심

집 서버는 게임·재부팅·정전으로 **자주 꺼진다.** 폰에서 메모하려는데 서버가 없다고 안 써지면 이 앱은 실패한다.
그래서 **문서 콘텐츠의 원본은 처음부터 Yjs(CRDT)** 로 간다.

```
[브라우저/PWA]  BlockNote ── Y.Doc ──┬── y-indexeddb   (로컬 원본, 오프라인에서도 편집)
                                    │
                                    └── y-websocket ──> [apps/collab Hocuspocus] ──> Postgres(ydoc_state)
                                                                   │
                                                                   └─(저장 시)─> content_json · text_plain 파생 갱신
```

- **오프라인에서 쓴 내용은 IndexedDB에 남고, 서버가 돌아오면 자동 병합된다.** 충돌 해결은 CRDT가 한다.
- 폰과 데스크탑에서 동시에 열어도 깨지지 않는다 — 가족 협업보다 **내 기기 여러 대**를 위한 기능이다.
- 서버는 `ydoc_state`(bytea)를 원본으로 저장하고, 저장 시점마다 `content_json`(jsonb)과 `text_plain`(text)을 **파생값으로 갱신**한다. 검색·렌더·API·LLM은 CRDT를 몰라도 되게 하기 위해서다.

| 컬럼 | 내용 | 쓰는 곳 |
| --- | --- | --- |
| `ydoc_state` | Yjs 상태 (bytea) | **원본.** 편집·동기화 |
| `content_json` | BlockNote 블록 트리 (jsonb) | 읽기 전용 렌더, API 응답 |
| `text_plain` | 블록을 펼친 평문 | FTS · 청킹 · LLM 입력 |

> M1에서는 `collab` 없이 `content_json` 만으로 시작하고, **M2에서 Yjs로 원본을 전환**한다. M1의 스키마에 `ydoc_state` 자리를 미리 비워 둔다.

## 5. 도메인 모델 (요약)

상세는 `docs/01-data-model.md`.

```
user ──┬── member ── organization  (= 가족)
       │
       └── space (kind: personal | org)
              └── document (parent_id 트리 = 그룹)
                     ├── document_tag ── tag        (카테고리)
                     ├── document_share             (권한)
                     ├── comment / attachment
                     └── chunk ── embedding          (RAG)
```

- **공간(space)** 하나로 "내 문서"와 "가족 문서"를 통일한다. 가입하면 개인 space가, 가족을 만들면 가족 space가 자동 생성된다. 이후 모든 코드는 space만 본다.
- **그룹 = 문서 트리.** `parent_id` + `position`(fractional index). 폴더 개념을 따로 두지 않는다 — 폴더와 문서가 따로 있으면 이동·권한 규칙이 두 벌이 된다.
- **카테고리 = 태그**(space 범위 다대다) + 그 위의 `collection`(저장된 필터·정렬·뷰).
- **권한은 문서에 붙고 트리를 따라 상속된다.** 판정은 `packages/auth/access.ts` 한 곳에서만.

## 6. 권한 모델

문서에 대한 실효 역할 = 다음 중 가장 강한 것:

1. `document_share` 중 나(user) 또는 내가 속한 가족(org)을 대상으로 한 것
2. 조상 문서들의 `document_share` (상속)
3. space 기본 권한 — personal은 소유자만, 가족 space는 멤버 역할에 따라
4. 공개 링크로 들어온 경우 그 링크의 역할

역할: `viewer < commenter < editor < owner`.
가족 역할(`owner/admin/member/guest`)은 가족 수준 행위(초대, space 생성)에만 쓰고 문서 권한과 섞지 않는다.

> **규칙:** 모든 문서 조회는 `readableDocumentIds()` 를 먼저 통과한다. 특히 **벡터 검색은 권한으로 좁힌 뒤에** 한다 — 반대로 하면 임베딩 유사도로 남의 문서가 샌다.

## 7. 가입은 초대 전용

가족만 쓰므로 **공개 가입 경로를 아예 두지 않는다.**

- `ALLOW_PUBLIC_SIGNUP=false` — `/signup` 라우트는 초대 토큰이 있어야만 동작
- 가족 owner 가 이메일 초대 링크를 발급 (`invitation` 테이블)
- 선택적 2차 잠금: Cloudflare Access 로 터널 앞단에서 이메일 허용 목록
- 그래서 **레이트 리밋·봇 방어·감사 로그는 우선순위가 낮다.** 안 만든다는 뜻이 아니라 M8로 미룬다.

## 8. AI 계층

```
클라이언트 ──SSE──> apps/web /api/ai/*  ──> packages/ai 게이트웨이 ──> Ollama (호스트, 11434)
                                                 │                      └ 생성 · 임베딩
                                                 └─(게임 모드)──> 큐에 적재 또는 클라우드 폴백
```

기능: **인라인 AI**(슬래시 `/냥이` — 이어쓰기·요약·다듬기·번역), **문서 질의(RAG)**, **자동 태그·제목 추천**.

RAG 파이프라인은 `worker` 가 돈다: 저장 → `ai_job(kind='embed')` → 청킹(변경분만) → 임베딩 → upsert.
**동기 요청 경로에서는 절대 임베딩하지 않는다.**
**모든 LLM 호출은 `packages/ai` 게이트웨이를 통과한다** — 모델명·타임아웃·동시성·GPU 모드 판정이 전부 거기 있다.

## 9. 게임과의 공존 — GPU 조정

이 프로젝트의 고유 제약이자 가장 먼저 틀리기 쉬운 부분.

- **Ollama는 호스트에 설치**한다 (컨테이너 아님). Windows에서 컨테이너에 GPU를 물리는 건 불안정하고, 게임 시 제어가 어렵다.
- GPU 모드는 `free | gaming` 둘뿐.
  - `gaming` → Ollama에 `keep_alive: 0` 으로 모델을 VRAM에서 내림 / `worker` 정지 / UI에 "게임 중" 표시 / (설정 시) 클라우드 폴백
  - `free` → 큐에 쌓인 잡을 순서대로 처리
  - 수동 토글이 기본, 게임 프로세스 감시 스크립트로 자동 전환 가능
- **Postgres·web·collab 은 절대 멈추지 않는다.** 게임 중에도 문서 편집·동기화·검색은 정상 속도여야 한다. 느려져도 되는 건 AI 경로뿐.

## 10. 배포·운영

- 전부 `infra/docker-compose.yml` 한 장. Windows 부팅 시 Docker Desktop 자동 실행 + `restart: unless-stopped`.
- 외부 공개는 **Cloudflare Tunnel** — 포트 개방 없이 `https://nyanotion.<도메인>`. 집 IP 비노출, 인증서 갱신 없음.
  - **PWA와 iOS 푸시에는 HTTPS가 필수**라 터널이 M2에서 이미 필요하다. 운영 단계로 미룰 수 없다.
- 백업: 매일 `pg_dump` + 첨부파일 디렉터리. **복구 리허설을 한 번은 해 본다.**
- 비밀 값은 `infra/.env` — git 무시. 커밋 금지.

## 11. 고양이 이름들 (사용자에게 보이는 곳만)

DB 컬럼·코드 식별자는 평범한 영어로 둔다. 재미는 UI에서만.

| 개념 | 이름 |
| --- | --- |
| 앱 | **Nyanotion** 🐱 |
| AI 어시스턴트 | **냥이** (슬래시 명령 `/냥이`) |
| 홈 / 대시보드 | **캣타워** |
| 휴지통 | **모래상자** |
| 즐겨찾기 | **츄르** |
| 가족(조직) | **묘연** 또는 그냥 "가족" |

## 12. 나중으로 미룬 것

명시적으로 **안 하는** 것들.

- App Store 정식 배포 — 가족만 쓰므로 불필요
- Android 앱 — PWA로 충분 (필요하면 Capacitor에 플랫폼 하나 추가)
- 블록 단위 권한 — 문서 단위까지만
- 노션 데이터베이스의 relation/rollup — `collection` 은 필터 뷰까지만
- 멀티 테넌트 격리 — 한 DB, `space_id` 스코프로 충분
- 결제·요금제·공개 가입
