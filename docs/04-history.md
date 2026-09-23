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
