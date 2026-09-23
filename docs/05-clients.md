# 클라이언트 전략 — 데스크탑과 iOS

## 1. 먼저 알아야 할 제약 두 가지

### (1) 에디터는 DOM에서만 돈다

BlockNote는 Tiptap 위, Tiptap은 ProseMirror 위에 있고 ProseMirror는 **브라우저 DOM에 직접 의존**한다.
React Native에는 DOM이 없다. 즉:

> 네이티브 앱을 만들더라도 **에디터 화면은 결국 WebView 안에서 돈다.**

React Native로 노션급 블록 에디터를 새로 만드는 건 이 프로젝트 전체보다 큰 일이다. 그러므로 선택지는 사실상 하나다 —
**웹 앱 하나를 잘 만들고, 각 플랫폼에는 그걸 감싸는 얇은 셸만 둔다.**

### (2) iOS 네이티브 빌드에는 Mac이 필요하다

Capacitor든 Tauri든 React Native든, **iOS 바이너리는 macOS + Xcode에서만 나온다.** 이 집에는 Windows PC뿐이다.
네이티브 셸을 만들기로 하는 순간 따라오는 것:

- Mac 한 대, 또는 클라우드 맥 빌드 (Ionic Appflow / Codemagic / GitHub Actions macOS 러너)
- Apple Developer Program **연 $99** — 무료 프로비저닝은 7일마다 앱이 만료된다
- 기기 등록·프로비저닝·서명 관리

가족 5명 쓰자고 지불하기엔 큰 비용이다.

## 2. 그래서 — PWA 우선

**범위가 가족이라는 점이 결정적이다: App Store 심사가 애초에 필요 없다.**
네이티브 앱을 만드는 가장 큰 이유(스토어 배포)가 사라지면, iOS에서 PWA로 못 하는 일이 거의 안 남는다.

iOS 26 기준, 홈 화면에 추가한 PWA에서 되는 것:

- ✅ 독립 창 (Safari UI 없이 앱처럼)
- ✅ 오프라인 캐시 (Service Worker)
- ✅ **푸시 알림** (iOS 16.4+, 단 홈 화면에 추가한 경우에만)
- ✅ IndexedDB — Yjs 로컬 원본 저장
- ✅ 홈 화면 아이콘·스플래시·테마 색

안 되는 것:

- ❌ **Background Sync API** — 앱이 닫힌 동안 자동 동기화가 안 된다. 열면 그때 동기화된다.
- ❌ 공유 시트(다른 앱 → Nyanotion으로 스크랩)
- ❌ 위젯 / Siri 단축어
- ❌ 생체 인증 잠금
- ⚠️ 저장소 축출 — Safari는 오래 안 쓴 사이트의 캐시를 지운다. Persistent Storage API(Safari 17+)로 보호를 요청할 수 있지만 **알림 권한이 있어야 한다.**
- ⚠️ 푸시 도달률 iOS 70~85% (Android 90~95%)

→ **오프라인 편집분을 잃지 않으려면 알림 권한을 받아 Persistent Storage 를 요청해야 한다.** 설치 안내에 포함할 것.

## 3. 배포 방법

| 플랫폼 | 방법 | Mac | 비용 |
| --- | --- | --- | --- |
| **iOS (기본)** | Safari → 공유 → **홈 화면에 추가** | ❌ | 0 |
| **데스크탑 (기본)** | Edge/Chrome 주소창 → **앱으로 설치** | ❌ | 0 |
| iOS (나중에) | Capacitor 셸 + TestFlight(100명/90일) 또는 Ad-hoc | ✅ | $99/년 |
| 데스크탑 (나중에) | Electron 셸 배포 | ❌ | 0 |

**설치 안내 페이지(`/install`)를 만들어 둔다.** iOS "홈 화면에 추가"는 공유 메뉴에 숨어 있어서 가족한테 말로 설명하면 반드시 실패한다. 스크린샷 넣은 페이지 하나가 지원 요청을 다 없앤다.

## 4. 나중에 셸을 붙인다면

`apps/shell-ios`, `apps/shell-desktop` 은 **UI 코드를 갖지 않는다.** 서버 URL을 로드하는 설정 파일 수준이다.

```ts
// apps/shell-ios/capacitor.config.ts
export default {
  appId: 'app.nyanotion',
  appName: 'Nyanotion',
  webDir: 'public',
  server: {
    url: 'https://nyanotion.example.com',   // 웹 앱을 그대로 로드
    cleartext: false,
  },
}
```

- **Capacitor (iOS)** — 웹 앱 래핑에 가장 성숙한 선택. 공유 시트·푸시·생체인증·파일 접근을 플러그인으로 얻는다. 전부 TypeScript.
- **Electron (데스크탑)** — 새 언어 없음. 전역 단축키(빠른 메모), 트레이 아이콘, 자동 시작이 목적.
- **Tauri 2 대안** — 데스크탑 바이너리가 훨씬 작고(수 MB 대 150MB+) iOS도 지원하지만, Rust가 들어오고 모바일 지원은 Capacitor보다 덜 성숙하다. 데스크탑 용량이 정말 문제가 될 때만 재검토.

**원격 URL 로딩의 함정:** 셸이 서버 URL만 로드하면 **서버가 꺼졌을 때 빈 화면**이 된다. 그래서 Yjs + IndexedDB 오프라인 경로(M2)가 셸보다 먼저 와야 한다. 순서를 뒤집지 말 것.

## 5. 셸을 만들 시점

아래 중 하나가 **실제로 아쉬워질 때만** 만든다. 미리 만들지 않는다.

- [ ] 다른 앱에서 공유 시트로 Nyanotion에 바로 스크랩하고 싶다
- [ ] 잠금 화면 위젯 / Siri로 빠른 메모
- [ ] Face ID로 앱 잠금
- [ ] 앱을 닫아둔 동안에도 동기화되어야 한다
- [ ] Safari가 오프라인 데이터를 지워서 실제로 잃은 적이 있다

## 6. 웹 앱이 지켜야 할 것 (셸 여부와 무관)

- **터치 우선 레이아웃** — 사이드바는 모바일에서 드로어. 블록 드래그 핸들이 손가락으로 잡힐 크기.
- **iOS Safari 키보드** — 소프트 키보드가 올라올 때 뷰포트가 줄어든다. `100vh` 대신 `100dvh`, 커서 가림 방지 처리.
- **Service Worker** — 앱 셸 캐시 + 오프라인 폴백 페이지.
- **Web App Manifest** — `display: standalone`, 아이콘 전 사이즈, 테마 색. 없으면 iOS가 "홈 화면에 추가"를 제대로 안 띄운다.
- **HTTPS 필수** — Service Worker·푸시·Persistent Storage 전부 HTTPS에서만. Cloudflare Tunnel 이 M2에 이미 필요한 이유.
