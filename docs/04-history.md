# 기록

## 2026-09-23 — 설계 시작
- 스택 확정: 전부 TypeScript (Next.js + Drizzle + PostgreSQL/pgvector), 에디터는 BlockNote, 인증은 Better Auth.
  - Auth.js(NextAuth)는 2025-09부터 보안 패치만 들어가고, 조직·역할이 코어에 없어 직접 만들어야 한다. Better Auth는 organization 플러그인에 멤버·역할·초대가 들어 있다.
  - BlockNote는 Tiptap(ProseMirror) 위에 노션식 UX(슬래시 메뉴·드래그 핸들·중첩 블록)와 Yjs 협업이 얹힌 것. 밑단이 Tiptap이라 필요하면 확장으로 내려갈 수 있다.
- "개인 문서"와 "조직 문서"를 `space` 하나로 통일하기로 함. 코드가 두 벌이 되는 걸 막으려고.
- 폴더 개념을 두지 않고 **문서 트리 자체를 그룹**으로 쓰기로 함(노션과 같은 이유 — 폴더/문서가 따로면 이동·권한 규칙이 두 벌).
- 실시간 협업은 M6로 미루되, M1부터 `ydoc_state` 컬럼과 파생값(`content_json`/`text_plain`) 구조를 잡아 두기로 함.
- GPU를 게임과 나눠 쓰는 문제를 아키텍처에 명시(`free | gaming` 모드). Ollama는 컨테이너가 아니라 호스트에 설치.

### 아직 안 정한 것
- (해결됨: 이름은 Nyanotion 으로 확정)
- (해결됨: 가족만. 초대 전용 가입)
- 모델 선택 — VRAM 실측 후 결정

## 2026-09-23 — 이름 확정, 클라이언트 전략 결정
- 프로젝트 이름 **Nyanotion** (고양이 + Notion). 패키지 스코프 `@nyanotion/*`. 코드네임 `mungchi` 폐기.
  - 고양이 이름은 UI 문구에만: 냥이(AI) · 캣타워(홈) · 모래상자(휴지통) · 츄르(즐겨찾기). DB·코드 식별자는 평범한 영어.
- 범위를 **가족만**으로 확정 → 공개 가입 없음(초대 전용), 레이트리밋·감사로그는 M8로. **App Store 심사가 필요 없다**는 점이 클라이언트 결정을 바꿨다.
- **클라이언트는 PWA 우선.** 근거:
  - BlockNote 는 ProseMirror(DOM) 위라 React Native 로 못 올린다 → 네이티브를 만들어도 에디터는 WebView. 그러면 "웹 앱 하나 + 얇은 셸"이 유일하게 합리적.
  - iOS 바이너리는 macOS + Xcode 에서만 나온다. 이 집엔 Windows 뿐 → Mac + Apple Developer $99/년이 따라붙는다.
  - iOS 26 기준 홈 화면 PWA 는 독립 창·오프라인 캐시·푸시(16.4+)·IndexedDB 가 전부 된다. 못 하는 건 Background Sync, 공유 시트, 위젯, 생체인증 잠금.
  - → 네이티브 셸(Capacitor iOS / Electron 데스크탑)은 **M7 조건부**. `apps/shell-*` 은 UI 코드 없이 서버 URL 만 로드하도록 설계해 언제든 붙였다 뗄 수 있게 둔다.
- **Yjs 를 M6 → M2 로 앞당김.** 집 서버가 게임·재부팅으로 자주 꺼지는데 폰에서 "서버 없음"이 뜨면 앱이 안 쓰인다. `y-indexeddb` 로컬 원본 + Hocuspocus 동기화가 오프라인 편집과 기기 간 동기화를 동시에 해결한다. 원래 목적이던 "가족 협업"보다 **내 기기 여러 대**를 위한 기능에 가깝다.
- **Cloudflare Tunnel 도 M2 로 앞당김.** Service Worker·푸시·Persistent Storage 가 전부 HTTPS 필수라 운영 단계로 미룰 수 없다.
- 저장소 축출 주의: Safari 는 오래 안 쓴 사이트 캐시를 지운다. Persistent Storage API 로 보호를 요청하되 **알림 권한이 있어야 동작**한다 → 설치 안내(`/install`)에서 알림 권한을 같이 받는다.

### 아직 안 정한 것
- 도메인 (`nyanotion.<무엇>`)
- Cloudflare Access 2차 잠금을 걸 것인지 (초대 전용만으로 충분한지)
- 모델 선택 — VRAM 실측 후 결정

## 2026-09-25 — M0 완료, 그리고 Docker 를 접은 이유
- **M0 끝.** 로그인·초대 전용 가입·개인 space 자동 생성까지 동작한다. 확인한 항목은 `docs/02-roadmap.md` M0 에 적어 두었다.
- **Docker 를 안 쓰기로 했다.** 이 PC 에는 WSL2 배포판이 없어 Docker Desktop 엔진이 뜨지 않는다(`docker info` 가 500).
  켜려면 관리자 권한 `wsl --install --no-distribution` + 재부팅이 필요한데, 마침 **PostgreSQL 17 이 Windows 서비스로 이미 돌고 있었다.**
  → `nyanotion` 역할·DB 를 따로 만들어 그걸 쓴다. `infra/docker-compose.yml` 은 지우지 않고 남겨 둔다.
- **같은 인스턴스에 2DActionGames 의 `game` DB 가 같이 산다.** DB·역할이 분리돼 있어 서로 안 건드리지만, 서비스 재시작·초기화는
  양쪽에 같이 영향을 준다. 손대기 전에 `pg_dump` 로 백업했다 (`Desktop/projects/game_backup_20260925_0529.sql`).
- **M6 전에 해결할 것: 이 PostgreSQL 에는 pgvector 가 없다.** `pg_trgm` 은 있다. M5 까지는 문제없고, M6 에서 pgvector 를
  따로 설치하거나 그때 Docker 로 옮긴다.
- 인증 스키마는 손으로 쓰지 않고 `@better-auth/cli generate` 로 만든다. 순환을 피하려고 생성 전용 설정을
  `apps/web/auth-schema.config.ts` 에 따로 뒀다 — **플러그인·옵션을 `src/lib/auth.ts` 와 항상 같게 유지할 것.**
- 초대 전용 가입은 `databaseHooks.user.create.before` 한 곳에서 막는다. 통과 조건은 둘뿐:
  살아 있는 초대가 있거나, **계정이 하나도 없는 첫 가입**이거나.
- 콘텐츠 원본 전환(M2)을 대비해 `document` 는 아직 만들지 않았다 — M1 에서 `content_json` 과 함께 한 번에 만든다.

### 게임 쪽 참고 (이 PC 의 다른 용도)
- VBS/메모리 무결성이 켜져 있다(`VirtualizationBasedSecurityStatus=2`). 7800X3D 에서 프레임을 깎는 설정이다.
  WSL2 와는 별개라 "WSL2 는 켜고 메모리 무결성은 끄는" 조합이 가능하다. 결정은 미뤄 둔다.

### 아직 안 정한 것
- 도메인 (`nyanotion.<무엇>`)
- Cloudflare Access 2차 잠금을 걸 것인지
- 모델 선택 — VRAM 실측 후 결정

## 2026-09-25 — M1 완료 (문서 트리와 에디터)
- **M1 끝.** 문서 CRUD·중첩 트리·드래그 정렬·BlockNote 에디터·디바운스 자동 저장·모래상자까지 동작한다.
  확인 항목은 `docs/02-roadmap.md` M1 에 적어 두었다.
- **BlockNote UI 를 Mantine 판에서 Ariakit 판으로 바꿨다.** `@blocknote/mantine` → `@mantine/core@9.6.2` 가
  `react` 에서 `useEffectEvent` 를 불러오는데 React 19.3.0 에는 없어서 `next build` 가 깨진다.
  `@blocknote/ariakit` 로 바꾸니 빌드가 통과하고, Mantine 의존성 트리가 통째로 빠져 번들도 줄었다(첫 로드 111 kB).
  - 대가: Ariakit 판 `BlockNoteView` 는 `theme` 객체를 받지 않고 `"light" | "dark"` 만 받는다.
    그래서 색을 `globals.css` 의 `--bn-*` 변수로 맞췄다. 메뉴·툴팁이 portal 로 나가므로 `:root` 에 뒀다.
- **정렬은 fractional index.** 한 번 옮길 때 그 행 하나만 UPDATE 한다. 순번(0,1,2…) 재배열이면 형제 전체를 써야 한다.
- **정렬 키는 서버가 계산한다.** 클라이언트는 "누구 뒤로"(`afterId`)만 보낸다 — 키를 믿고 쓰면 조작할 수 있다.
- **자기 하위로 옮기기는 서버에서 막는다** (재귀 CTE 로 조상을 확인). 트리가 끊기면 문서가 영구히 사라진 것처럼 보인다.
- **모래상자는 하위 트리를 함께 내리고 함께 올린다.** 목록에는 직접 버린 것만 띄운다 — 하위까지 나열하면 무엇을
  되돌려야 할지 알 수 없다. 하드 삭제는 "비우기" 한 곳뿐이고 FK cascade 가 하위를 지운다.
- 스크립트 실행기로 `tsx` 를 넣었다. 소스가 확장자 없는 import 를 쓰는데 Node 의 ESM 해석기는 확장자를 요구한다.
- 사이드바 접힘 상태는 `localStorage` 에 둔다 — 없어도 되는 편의라 읽기·쓰기를 try/catch 로 감싼다.

### 다음
M2 — 오프라인 동기화(Yjs + y-indexeddb + Hocuspocus) · PWA 설치 · Cloudflare Tunnel.
**M2 에서 콘텐츠 원본이 `content_json` → `ydoc_state` 로 넘어간다.** 지금 `content_json` 이 원본이라는 가정에 의존하는
코드는 `setContent()` 와 `components/editor.tsx` 두 곳뿐이다.

## 2026-09-25 — 폰에서 로그인이 "invalid origin" 으로 막힌 건
Better Auth 가 `Origin` 이 신뢰 목록에 없으면 403 `INVALID_ORIGIN` 을 준다. `BETTER_AUTH_URL` 이
`http://localhost:3000` 인데 폰은 Tailscale IP 로 들어오니 다른 출처로 본 것.

**집 서버는 한 대인데 주소가 여럿**이라는 게 이 프로젝트에서 계속 걸릴 지점이다 — localhost, 집 랜 IP,
Tailscale IP, M2 의 터널 도메인. 그래서 검사를 끄지 않고 `.env` 의 `TRUSTED_ORIGINS` 에 쓰는 주소를 나열한다
(`auth.ts` 가 `BETTER_AUTH_URL` 과 합쳐 넘긴다). 확인법은 `docs/03-dev-environment.md`.

목록에 없는 Origin 은 그대로 403 이어야 한다 — 확인했다. CSRF 방어를 유지한 채 주소만 늘린 것이다.

## 2026-09-25 — M2 동기화와 PWA (터널만 남음)
- **콘텐츠 원본이 `content_json` → `ydoc_state` 로 넘어갔다.** 브라우저의 로컬 Y.Doc 이 진짜 원본이고,
  IndexedDB 에 곧바로 남는다. 서버는 그걸 받아 저장하면서 `content_json`·`text_plain` 을 파생시킨다 —
  검색·렌더·API·LLM 이 CRDT 를 모르게 하려고.
- **본문을 쓰는 경로를 하나로 줄였다.** 웹의 `saveContentAction` 을 지웠다. 이제 `apps/collab` 의
  `saveYdoc()` 뿐이고, `setContent()` 는 씨앗·가져오기 전용이다. 경로가 둘이면 `text_plain` 이 어긋난다.
- **표(ticket)로 WebSocket 을 인증한다.** 세션 토큰을 클라이언트 JS 에 내보내는 대신,
  문서 하나·60초짜리 HMAC 표를 `/api/collab/ticket` 이 쿠키로 인증해 발급한다. 새 나가도 그 문서에 그 잠깐뿐이다.
  Web Crypto 만 써서 브라우저 번들에도 안전하게 들어간다. 표가 있어도 서버가 소유권을 다시 확인한다.
  - M4 에서 문서 공유가 생기면 이 확인이 `access.ts` 를 부르게 된다.
- **동기화 서버 주소를 못 박지 않고 지금 페이지 주소에서 만든다.** "집 서버는 한 대인데 주소가 여럿"이
  또 나왔다 — 로그인 origin 때 겪은 것과 같은 문제다. 터널처럼 경로가 달라질 때만 `NEXT_PUBLIC_COLLAB_URL` 로 고정한다.
- `ydoc_state` 를 `text` 에서 `bytea` 로 바꿨다(0002). base64 로 돌리면 33% 크고 인코딩 실수가 조용히 문서를 깨뜨린다.
  칼럼이 전부 NULL 이라 캐스팅 대신 지우고 다시 만들었다.
- **서비스 워커는 `/api/*` 를 캐시하지 않는다.** 오래된 표를 돌려주면 동기화가 조용히 실패한다.
  문서 내용도 캐시하지 않는다 — Yjs 가 IndexedDB 에 들고 있다. 워커가 맡는 건 앱 껍데기와 정적 파일뿐.
- 아이콘은 `pnpm --filter @nyanotion/web icons` 가 고양이 마크 하나에서 전부 만든다(sharp).
  maskable 은 바깥 20% 가 잘리므로 마크를 더 작게 둔다.
- Safari 의 저장소 정리로 **오프라인에서 쓴 글이 날아가는 것**이 이 앱의 가장 큰 사고다.
  앱을 열 때 조용히 `navigator.storage.persist()` 를 청하고, `/install` 에서 알림 권한과 함께 다시 청한다.

### 남은 것
- **Cloudflare Tunnel + 도메인.** 도메인이 정해져야 한다.
- HTTPS 가 없어 서비스 워커·홈 화면 추가·영구 저장소를 **실제로 확인하지 못했다.** 코드는 올라가 있다.
- 오프라인 편집은 브라우저에서 사람 손으로 확인해야 한다 (자동 검증은 기기 간 동기화까지).

## 2026-09-25 — M3 분류와 검색
- **태그는 트리와 다른 축**이라는 게 이 단계의 전제다. 트리는 "어디에 있나", 태그는 "무엇에 관한 것인가".
  문서의 자리는 언제나 트리 하나뿐이고, 태그는 여러 개 달린다. 모음(collection)도 **조건만 저장할 뿐 문서를 소유하지 않는다** —
  그래서 모음을 지워도 문서는 아무 영향이 없다.
- **한국어 검색이 이 단계의 진짜 문제였다.** Postgres 에 기본 형태소 분석기가 없어 `to_tsvector('simple')` 은
  띄어쓰기로만 쪼갠다. "장보"로 "장보기"를 못 찾는다는 뜻이다. 그래서 두 가지를 같이 쓴다:
  tsvector(단어가 맞을 때 빠르고 순위도 나온다) + `pg_trgm`(부분 문자열과 오타). 가족 규모에서는 이 조합으로 충분하다.
  `pg_trgm` 은 이 PostgreSQL 에 이미 있었다 (pgvector 와 달리).
- `document.search_tsv` 는 생성 칼럼으로 뒀다 — 애플리케이션이 갱신을 잊을 여지를 없앤다.
- **원시 SQL 의 결과 타입을 믿지 말 것.** `db.execute` 가 돌려준 `updated_at` 이 Date 가 아니어서 모음 페이지가 500 이 났다.
  타입 선언은 거짓말을 할 수 있다 — 검색 결과의 날짜·숫자를 명시적으로 변환하도록 고쳤다.
- 태그는 이름으로 붙인다. 없는 이름이면 그 자리에서 만들고, 있으면 그걸 쓴다(`ensureTag`) — 태그를 먼저 만들러
  가게 하지 않고, 같은 이름이 둘로 갈리지도 않게.
- 명령 팔레트(⌘K)는 찾기와 만들기를 한 입력창에서 한다. 느린 응답이 최신 결과를 덮지 않도록 요청에 번호를 매긴다.
- 태그·모음을 지워도 문서는 남는다. 메뉴에 그 문장을 적어 뒀다 — 지우기 전에 읽을 수 있어야 한다.
