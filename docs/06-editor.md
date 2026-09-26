# 06 — 에디터: 노션과 무엇이 같고 무엇이 다른가

2026-09-26 에 실제 화면을 Playwright 로 열어 계산된 스타일과 DOM 을 확인하고 정리한 것이다.
추측이 아니라 `apps/web/scripts/inspect-mobile.mjs` · `audit-blocks.mjs` · `e2e-editor.mjs` 의 출력이 근거다.

---

## 1. 그때 무엇이 망가져 있었나 (그리고 왜)

전부 **CSS 특이도 하나**에서 비롯됐다.

BlockNote 는 자기 변수를 `.bn-root` 에 정의한다:

```css
.bn-root{--bn-colors-editor-background:#fff;--bn-colors-selected-background:#3f3f3f;
         --bn-font-family:"Inter",…}
```

`.bn-root` 는 특이도 (0,1,0) 이고 `:root` 도 (0,1,0) 이다. **같으면 나중에 로드된 쪽이 이긴다.**
BlockNote 의 CSS 는 `editor.tsx` 라는 클라이언트 청크에서 들어오므로 `layout.tsx` 의 `globals.css` 보다 늦다.
그래서 `globals.css` 에 적어 둔 `--bn-*` 값은 **M1 이후 단 한 번도 적용된 적이 없었다.**

| 사용자가 본 것 | 실제 원인 |
|---|---|
| 글이 흰 상자 안에 쓰이고 종이와 따로 논다 | `--bn-colors-editor-background:#fff` 가 이김 |
| 글을 고르면 새까맣게 덮인다 | `--bn-colors-selected-background:#3f3f3f` |
| 글꼴이 시안과 다르다 | `--bn-font-family` 가 `Inter` 그대로 |
| 제목이 지나치게 크다 | `.bn-block-outer:not([data-prev-type])>.bn-block>.bn-block-content[data-content-type=heading]{font-size:var(--level)}` — **특이도 (0,5,0)**. `font-size` 를 덮으려는 시도는 진다. `--level` 을 바꿔야 한다 |
| 슬래시 메뉴에 파란 줄 | `.bn-ak-menu-item[aria-selected=true]{background-color:#007acc}` — **변수가 아니라 박힌 색**. 규칙으로 직접 덮어야 한다 |
| 블록을 고르면 파란 형광펜 | `.ProseMirror-selectednode:after{box-shadow:inset 0 0 0 4px #64a0ff4d}` — 이것도 박힌 색 |
| 글자를 누르면 확대된다(iOS) | 편집 영역 15.5px. Safari 는 16px 미만 입력칸을 탭하면 확대한다 |
| 플레이스홀더가 두 줄로 접힌다 | 한국어 기본 문구가 358px 폭에 안 들어간다 |

**고친 방법:** `apps/web/src/styles/blocknote.css` 를 만들어 `editor.tsx` 에서 BlockNote CSS **다음에** import 한다.
변수는 `:root` 가 아니라 `.bn-root` 에 적고, 박힌 색은 `.bn-container` 를 앞에 붙여 특이도를 올려 덮는다.

> 메뉴·툴팁이 portal 로 나가더라도 `.bn-root` 안에 남는다는 것을 DOM 으로 확인했다 —
> 조상 사슬이 `div.bn-ak-menu → … → div.bn-root bn-container`. 그래서 `.bn-root` 에 두면 메뉴까지 덮인다.

---

## 2. 노션과 대조

### 같은 것

**구조**
- 한 줄이 한 블록. Enter 로 다음 블록, Backspace 로 앞 블록에 합침, Tab/Shift+Tab 으로 들여쓰기
- 왼쪽 여백에 `+`(블록 추가)와 `⠿`(끌어서 순서 바꾸기), 호버에서만 보임
- 마크다운 입력 규칙: `# `, `## `, `- `, `1. `, `> `, ` ``` `
- `/` 로 블록 메뉴, 타이핑하면 걸러짐, ↑↓ 이동, Enter 선택, Esc 닫기
- 글을 고르면 서식 툴바(굵게·기울임·밑줄·취소선·코드·링크·색)

**블록 종류** (`audit-blocks.mjs` 로 확인한 28개)

| 무리 | 있는 것 |
|---|---|
| 제목 | 제목1~3, 제목4~6, 접을 수 있는 제목1~3 |
| 기본 블록 | 본문, 글머리 기호·번호 매기기·체크리스트, 접을 수 있는 목록, 인용, 코드 블록, 구분선, **데이터베이스** |
| 고급 | 표 |
| 미디어 | 이미지, 비디오, 오디오, 파일 |
| 기타 | 이모지 |
| 냥이 | 이어 쓰기·요약·다듬기·번역 (노션에 없는 우리 것) |

**모양** — 종이 위에 상자 없이, 본문 16px/1.5, 제목 비율 1.875 / 1.4 / 1.15em,
떠 있는 카드는 6px 모서리 + 얇은 선 + 부드러운 그림자. 고른 줄은 옅은 회색(채도 높은 색이 아니라).

### 다른 것 — 의도한 차이

- **색은 우리 팔레트다.** 노션의 파랑 대신 이끼색(`--accent`), 흰 바탕 대신 종이색(`--paper`).
- **줄 하나가 문서다.** 노션과 같은 규칙이되, 우리는 문서의 자리가 트리 하나뿐이다 (`docs/01-data-model.md`).

### 아직 없는 것

| 없는 것 | 무게 | 비고 |
|---|---|---|
| 콜아웃 | 작음 | 사용자 정의 블록 하나. 인용과 비슷하게 만들면 됨 |
| 문서 멘션 / 하위 페이지 링크 (`@`) | 중간 | 인라인 콘텐츠 + 제안 메뉴. 노션의 핵심 중 하나 |
| 단 나누기(컬럼) | 작음 | BlockNote 에 노드는 있으나 슬래시 메뉴에 없다 |
| 수식(LaTeX) | 작음 | 쓸 일이 있을 때 |
| 댓글 | 중간 | BlockNote 에 기능은 있으나 켜지 않았다 |
| 보드·달력 뷰 | 중간 | `database` 블록의 `view` 속성 자리를 비워 뒀다 |
| 동기화 블록, 버튼, 브레드크럼 | — | 가족용 메모에 필요하지 않다고 판단 |

---

## 3. 본문에 끼우는 데이터베이스

노션과 같은 구조를 택했다 — **표의 실체는 `collection` 이고, 블록은 그 id 만 들고 있다.**
그래서 같은 표를 여러 문서에 끼워도 한 벌이고, `/c/[id]` 로 열어도 같은 것이 보인다.

```
document (본문 Yjs)
 └ database 블록  props: { collectionId, view }
        │
        └─▶ collection (source: 'manual')
              ├ property …            ← 표의 칼럼
              └ collection_item …     ← 표의 줄 = 문서
```

**웹과 collab 서버가 같은 스키마를 써야 한다.** collab 서버는 Yjs 를 블록 트리로 풀어
`content_json`·`text_plain` 을 만드는데, 브라우저에만 있는 블록 종류가 생기면 서버가 그 노드를
모르고 지나쳐 내용이 조용히 사라진다. 그래서 종류 정의(이름·속성·내용 유무)는
`packages/editor-schema` 한 곳에 두고 양쪽이 가져다 쓴다.

- 종류 정의: `packages/editor-schema/src/index.ts`
- 브라우저 그림: `apps/web/src/components/blocks/database-block.tsx` → `inline-database.tsx`
- 서버: `apps/collab/src/index.ts` 의 `ServerBlockNoteEditor.create({ schema: serverSchema })`

페이지와 끼운 표가 **같은 값을 보도록** 데이터는 `lib/collection-view.ts` 한 곳에서 모은다.
모음 페이지는 서버 컴포넌트라 바로 쓰고, 끼운 표는 `/api/collection/[id]` 로 받아 온다.

---

## 4. 파일 올리기

이미지·비디오·오디오·파일 블록은 M5 까지 메뉴에만 있고 **실제로는 올릴 수 없었다** (`uploadFile` 미설정).

- 바이트는 디스크(`UPLOAD_DIR`, 기본 `apps/web/.data/uploads`)에, 메타는 `attachment` 표에
- **권한은 문서 기준이다.** 올리려면 그 문서를 고칠 수 있어야 하고(`assertCanWrite`),
  받으려면 읽을 수 있어야 한다(`canRead`). 로그인하지 않은 사람은 그 문서가 **지금 공개 링크로
  열려 있을 때만** 받는다 — 본문이 이미 공개인데 그림만 막는 것은 의미가 없으니까
- 종류는 **허용 목록**이고 `image/svg+xml`·`text/html` 은 일부러 뺐다 — 둘 다 스크립트를 품을 수 있고,
  같은 오리진에서 열어 주면 로그인 쿠키를 가진 브라우저에서 실행된다
- 내줄 때는 **올릴 때 확인해 둔 종류만** 쓰고 `nosniff` 를 붙인다
- 없는 파일은 404 가 아니라 410 — 줄은 있는데 바이트가 사라진 경우를 구분하기 위해

---

## 5. 점검 도구

`apps/web/scripts/` 에 있다. **전부 실제 문서를 연다 — 편집을 남기지 말 것.**
Enter 금지, 친 글자는 Backspace 로 되돌린다.

| 스크립트 | 하는 일 |
|---|---|
| `inspect-editor.mjs` | 데스크탑에서 DOM·계산된 스타일·콘솔 오류 |
| `inspect-mobile.mjs` | iPhone 폭에서 같은 것 + 슬래시 메뉴 |
| `probe-dom.mjs` | 블록 하나의 실제 속성과 조상 사슬 |
| `audit-blocks.mjs` | 슬래시 메뉴 전체 항목 |
| `e2e-editor.mjs` | **임시 문서**를 만들어 표 넣기·줄 추가·파일 올리기까지 |

`e2e-editor.mjs` 가 남기는 것(모음, 줄 문서)은
`npx tsx packages/db/scripts/cleanup-test-data.ts --yes <문서id>` 로 치운다.
