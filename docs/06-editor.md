# 06 — 에디터: 노션과 무엇이 같고 무엇이 다른가

2026-09-26 에 실제 화면을 Playwright 로 열어 계산된 스타일과 DOM 을 확인하고 정리한 것이다.
추측이 아니라 `apps/web/scripts/` 의 점검 도구가 찍어 준 값이 근거다 (§5).
이후 에디터를 `packages/editor` 패키지로 떼면서 파일 자리가 바뀌었고, 아래 경로는 지금 것이다.

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

**고친 방법:** `packages/editor/src/styles.css` 를 만들어 `editor.tsx` 에서 BlockNote CSS **다음에** import 한다.
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

**블록 종류** (`audit-blocks.mjs` 로 확인한 31개)

| 무리 | 있는 것 |
|---|---|
| 제목 | 제목1~3, 제목4~6, 접을 수 있는 제목1~3 |
| 기본 블록 | 본문, 글머리 기호·번호 매기기·체크리스트, 접을 수 있는 목록, 인용, 코드 블록, 구분선, **데이터베이스**, **콜아웃**, **수식** |
| 고급 | 표 |
| 미디어 | 이미지, 비디오, 오디오, 파일 |
| 기타 | 이모지 |
| 냥이 | 이어 쓰기·요약·다듬기·번역 (노션에 없는 우리 것) |

인라인으로는 `@` 멘션이 있다 (다른 문서 가리키기).

**모양** — 종이 위에 상자 없이, 본문 16px/1.5, 제목 비율 1.875 / 1.4 / 1.15em,
떠 있는 카드는 6px 모서리 + 얇은 선 + 부드러운 그림자. 고른 줄은 옅은 회색(채도 높은 색이 아니라).

### 다른 것 — 의도한 차이

- **색은 우리 팔레트다.** 노션의 파랑 대신 이끼색(`--accent`), 흰 바탕 대신 종이색(`--paper`).
- **줄 하나가 문서다.** 노션과 같은 규칙이되, 우리는 문서의 자리가 트리 하나뿐이다 (`docs/01-data-model.md`).

### 아직 없는 것

| 없는 것 | 무게 | 비고 |
|---|---|---|
| 단 나누기(컬럼) | 중간 | `@blocknote/xl-multi-column` 이 **GPL-3.0/상용** 이라 저장소 전체 라이선스를 끌고 간다. 직접 만들려면 중첩 블록과 크기 조절을 다 짜야 한다 |
| 글자 범위에 다는 댓글 | 중간 | 우리는 **블록**에 단다 — 범위를 쓰려면 본문 안에 표식을 남겨야 하고, 그러면 댓글이 CRDT 로 돌아간다 |
| 인라인 수식 | 작음 | 블록 수식만 있다 |
| 동기화 블록, 버튼, 브레드크럼 | — | 가족용 메모에 필요하지 않다고 판단 |
| 공개 화면의 수식 렌더 | 작음 | KaTeX 는 글꼴까지 200kB 가 넘어서 공개 링크에는 싣지 않는다. LaTeX 원본을 그대로 보여 준다 |

---

## 2.5 댓글

블록 하나에 실타래 하나. **Yjs 가 아니라 Postgres 에 둔다** (`comment_thread`·`comment`, 마이그레이션 0009).

본문은 오프라인에서도 고칠 수 있어야 하지만 댓글은 "다른 사람에게 말 걸기"라 연결이 없으면
어차피 뜻이 없다. CRDT 에 넣으면 지운 댓글이 다른 기기에서 되살아나는 종류의 문제를 떠안게 되고,
"누가 언제"를 서버가 보증할 수도 없다.

권한: **`commenter` 이상**이어야 말을 걸 수 있다. 읽기만 되는 사람은 목록만 본다.
고치기·지우기는 **쓴 사람만** — 문서를 고칠 수 있다고 남의 말을 고치지는 못한다.
블록이 지워져도 실타래는 남는다 (대화를 편집으로 지우는 것은 사고이기 쉽다).

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
- 브라우저 그림: `packages/editor/src/blocks/database.tsx` → `database/inline-database.tsx`
- 서버: `apps/collab/src/index.ts` 의 `ServerBlockNoteEditor.create({ schema: serverSchema })`

페이지와 끼운 표가 **같은 값을 보도록** 데이터는 `apps/web/src/lib/collection-view.ts` 한 곳에서 모으고,
화면도 같은 `InlineDatabase` 를 쓴다. 둘 다 `/api/collection/[id]` 로 받아 온다.

보는 방식(표·보드·달력)은 **블록이 아니라 모음에 저장한다.** 블록 속성으로 두면 뷰를 바꿀 때마다
문서에 트랜잭션이 생기고, 표가 어떻게 보이는지는 표의 성질이기도 하다.

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
친 글자는 Backspace 로 되돌린다. 새로 만들어도 되는 것은 `e2e-editor.mjs` 처럼
임시 문서를 만들어 쓰고 모래상자로 보낸다.

| 스크립트 | 하는 일 |
|---|---|
| `inspect-editor.mjs` | 데스크탑·폰 폭에서 계산된 스타일 · `--bn-*` 값 · 슬래시 메뉴 · 스크린샷 |
| `audit-blocks.mjs` | 슬래시 메뉴에 실제로 있는 항목 전부 (이 문서의 표를 갱신할 때) |
| `e2e-editor.mjs` | **임시 문서**를 만들어 표·콜아웃·수식·멘션·댓글·업로드까지 |
| `lib.mjs` | 셋이 같이 쓰는 로그인·커서·문서 열기 |

문서 id 를 주지 않으면 **사이드바의 첫 문서**를 연다 — id 를 박아 두면 환경이 바뀔 때 깨진다.
계정이 없으면(빈 dev·beta) `signIn` 이 그 자리에서 첫 계정을 만든다.

`e2e-editor.mjs` 가 남기는 것(모음, 줄 문서)은 끝에 알려 주는 명령으로 치운다:

```powershell
npx tsx packages/db/scripts/cleanup-test-data.ts --yes <문서id>
# 여러 번 돌린 뒤 한 번에:
npx tsx packages/db/scripts/cleanup-test-data.ts --keep <남길 문서id> --yes
```
