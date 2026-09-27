# Nyanotion

집에 있는 컴퓨터 한 대에서 도는 가족용 문서 서버. 노션처럼 쓰지만 글이 밖으로 나가지 않는다.

같은 컴퓨터가 게임기이기도 해서, 게임을 켜면 로컬 LLM이 스스로 비켜 준다.

```
┌─ apps/web ────────── Next.js. 화면 · API · PWA
├─ apps/collab ─────── Hocuspocus. Yjs 동기화 (본문의 원본)
├─ packages/editor ─── 에디터 한 벌. 서버를 모른다 (포트로만 이야기한다)
├─ packages/editor-schema ─ 블록 종류 정의. 웹과 collab 서버가 같이 쓴다
├─ packages/db ─────── Drizzle 스키마 · 마이그레이션 · 질의
├─ packages/auth ───── access.ts — 권한을 판정하는 **유일한** 곳
├─ packages/ai ─────── Ollama 게이트웨이 (동시성 · GPU 양보)
└─ packages/shared ─── 타입 · 평문 변환 · fractional index · 표(ticket)
```

---

## 한 줄로 시작하기

필요한 것: **Windows · PowerShell 7 · PostgreSQL 17 · Node 20↑**

```powershell
winget install Microsoft.PowerShell    # pwsh 가 없으면
```

그다음:

```powershell
pwsh scripts/setup.ps1 -PostgresPassword '<postgres 수퍼유저 비밀번호>'
```

이게 하는 일 — 없는 것만 만들고, 몇 번 돌려도 같은 결과다:

1. Node · pnpm · PostgreSQL 서비스 확인 (pnpm 이 없으면 corepack 으로 켠다)
2. `pnpm install`
3. 역할 `nyanotion` 과 데이터베이스 셋 (`nyanotion_dev` · `nyanotion_beta` · `nyanotion`)
4. 확장 `pg_trgm` · `vector`
5. `.env` · `.env.beta` · `.env.prod` 를 본보기에서 만들고 **비밀값을 새로 만들어** 채운다
6. 마이그레이션 적용, 첫 문서 씨앗

그다음:

```powershell
pnpm dev          # 로컬 개발   http://localhost:3000
pnpm worker       # 문서 질의 색인 (따로 띄운다 — GPU 를 쓴다)
```

로그인 화면에서 계정을 만들면 된다 — **이 서버의 첫 한 명만** 초대 없이 되고,
그다음부터는 초대를 받아야 들어온다.

---

## 환경

한 대에서 셋이 같이 돈다. DB · 포트 · 도메인 · 빌드 폴더가 전부 다르다.

| | DB | 웹 | 동기화 | 쓰임 |
|---|---|---|---|---|
| `dev` | `nyanotion_dev` | 3000 | 1234 | 로컬 개발. 가족 문서를 건드리지 않는다 |
| `beta` | `nyanotion_beta` | 3100 | 1334 | **마이그레이션을 먼저 돌려 보는 자리** |
| `prod` | `nyanotion` | 3000 | 1234 | 가족이 쓰는 것 (터널 뒤) |

```powershell
pnpm dev                 # dev
pnpm serve:beta          # 빌드 후 beta
pnpm serve:prod          # 빌드 후 prod
pnpm stop:beta           # 멈추기
NYANOTION_ENV=beta pnpm db:migrate
```

설정은 겹겹이 읽는다 — 먼저 잡힌 값이 이긴다:

1. 셸 환경 변수
2. `$NYANOTION_SECRETS_DIR/<환경>.env` ← **비밀값. 저장소 밖에 둔다**
3. `<저장소>/.env.<환경>`
4. `<저장소>/.env`

**이 저장소는 공개돼 있다.** `.env*` 는 전부 git 이 무시하지만, 진짜 비밀값은
`NYANOTION_SECRETS_DIR` 로 저장소 밖에 두는 편이 안전하다. 자세한 건 `docs/07-environments.md`.

---

## 무엇이 되나

- **노션처럼 쓰는 문서** — 한 줄이 한 블록. 제목 · 목록 · 체크 · 인용 · 코드 · 표 · 구분선 ·
  콜아웃 · 수식(LaTeX) · 그림 · 파일 · 접는 목록, `/` 로 고른다
- **`@` 로 다른 문서 가리키기**
- **데이터베이스** — 표 · 보드 · 달력. **줄 하나가 문서다**, 열면 본문에 메모를 쓸 수 있다
- **댓글** — 블록마다 실타래 하나. 정리하면 접힌다
- **오프라인** — 편집은 브라우저의 Y.Doc 이 원본이다. 서버가 꺼져 있어도 쓰고,
  돌아오면 CRDT 가 합친다. 폰은 홈 화면에 설치해서 쓴다 (PWA)
- **가족 공유** — 문서에 권한이 붙고 트리를 따라 상속된다. 링크 공개도 된다
- **냥이(로컬 LLM)** — 요약 · 이어쓰기 · 다듬기 · 번역. 답은 **제안으로만** 나오고
  사람이 수락해야 문서에 들어간다. 게임이 그래픽카드를 쓰면 스스로 비켜 준다
- **문서에 물어보기** — "작년 김장 레시피 뭐였지"에 **근거와 함께** 답한다.
  번호를 누르면 그 문서의 **그 줄**로 간다. 읽을 수 있는 문서에서만 찾고,
  근거가 없으면 지어내지 않는다 (`docs/10-ask.md`)
- **살 것** — 값을 찾아 오고 가족 누구든 한 명이 승인해야 산다. **결제 버튼은 사람이 누른다**

아직 없는 것과 노션과의 차이는 `docs/06-editor.md` 에 표로 적어 두었다.

---

## 만들면서 지키는 것

전부 `CLAUDE.md` 에 규칙으로 적혀 있다. 특히:

- **권한 판정은 `packages/auth/access.ts` 한 곳에서만.** 라우트·질의에 조건을 손으로 짜 넣지 않는다.
- **권한이 없으면 404.** 403 은 "그 문서가 있긴 하다"를 알려 준다.
- **본문의 원본은 Yjs.** `content_json` · `text_plain` 은 저장할 때 같이 만드는 파생값이고,
  검색 · 렌더 · API · LLM 은 파생값만 본다.
- **에디터 패키지는 서버를 모른다.** `EditorPorts` 로만 이야기한다.
- **블록 종류는 `packages/editor-schema` 한 곳.** 서버가 모르는 블록은 변환에서 조용히 사라진다.

## 확인하기

```powershell
pnpm deploy:beta                            # 베타에 올리고 포트가 열릴 때까지 확인
pnpm deploy:prod                            # 운영에 (터널 밖까지 확인)
pnpm typecheck                              # 전 패키지
pnpm test                                   # DB · 권한 · 검색 · 동기화 · 문서 질의 스모크
node apps/web/scripts/e2e-editor.mjs        # 에디터 전체 (임시 문서를 만들고 치운다)
node apps/web/scripts/inspect-editor.mjs    # 계산된 스타일 · 스크린샷
node apps/web/scripts/audit-blocks.mjs      # 슬래시 메뉴에 실제로 있는 블록
```

## 문서

`docs/README.md` 부터. 데이터 모델 · 마일스톤 · 개발 환경 · 결정 기록 · 클라이언트 전략 ·
에디터 · 환경 분리 · 살 것 · 운영 · 문서 질의.

## 라이선스

MIT — `LICENSE` 참고.
