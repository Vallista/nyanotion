# 13 — 동기화: Bento ↔ 체크리스트

Bento(맥 앱, `Vallista/vallista-land` 의 `apps/admin`)의 할 일을 냥노션 체크리스트와 양방향으로 맞춘다.
**서버가 원본**이고 Bento 는 오프라인 사본을 갖는다. 1단계는 할 일 · 폴더 · 메모 · 하위 항목.

```
 Bento 할 일 목록 전체   ↔  체크리스트 하나 (기본: 내 문서의 기본 체크리스트, 설정에서 고른다)
 Bento 폴더 (중첩)       ↔  그 체크리스트 안의 폴더 (checklist_folder)
 Bento 할 일 id          =  체크리스트 항목 id  (그대로 쓴다 — Bento 의 블록·메모가 id 로 가리키므로)
```

## 무엇이 오가나

| Bento | 체크리스트 항목 | |
|---|---|---|
| `title` · `done` | `title` · `done` | 체크는 웹과 같은 길(반복이면 다음 줄이 생긴다) |
| `due` | `dueOn` + `dueTime` | `YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:00` 를 둘로 나눠 싣는다 |
| `startAt` · `estMin` · `tags` · `color` · `kind` · `group` | 같은 이름 (`group` → `groupName`) | 서버는 해석하지 않고 지킨다 |
| `folderId` | `folderId` | |
| 메모(EventNote `task:<id>`) | `notes` | |
| 하위 항목(EventSubtask `task:<id>`) | `subtasks` (jsonb) | |

반복 · 담당 · 구매 연결은 **냥노션에만** 있다. Bento 는 보내지 않고, 서버는 Bento 가 보낸 것으로 그 칸을
덮지 않는다(그 칸이 묶음에 없으므로).

## 규칙

- **변경 번호(`rev`).** 항목·폴더가 바뀔 때마다 `checklist_rev_seq` 에서 새 번호를 받는다. 받는 쪽은
  "이 번호 다음에 바뀐 것"을 묻는다 — 시각은 기기마다 어긋나서 커서로 쓰지 않는다.
  **고치는 질의는 전부 `bump()` 를 넣어야 한다.** 빠뜨리면 그 수정은 Bento 로 영영 안 간다.
- **지운 표시(`deleted_at`).** 동기화하는 쪽이 "지워졌다"를 받아 가야 하므로 줄을 바로 지우지 않는다.
  모든 목록 질의는 `deleted_at is null` 로 거른다.
- **나중에 고친 쪽이 이긴다.** 올린 것의 `updatedAt` 이 서버 것보다 이르면 버리고 `stale` 로 알린다.
  **버려진 것의 지금 서버 값을 `current` 로 같이 돌려준다** — 받는 쪽은 곧바로 덮어쓴다. 안 주면 그 항목이
  서버에서 다시 바뀔 때까지 그 기기에 옛 값이 남는다(커서는 이미 지나갔으므로). 시나리오 시험이 잡았다. **미래 시각은 지금으로 깎는다** — 시계가 앞선 기기가 영원히 이기지 않게.
- **지우기도 수정 하나로 친다.** 지운 뒤에 더 나중 `updatedAt` 으로 고친 것이 오면 되살아난다
  (`deleted_at` 을 비운다). 웹에서 지운 할 일을 오프라인 맥에서 그 뒤에 고쳤다면 고친 쪽이 이긴다 —
  사람이 나중에 손댄 것을 조용히 버리지 않기 위해서다. 거꾸로 지운 것이 더 나중이면 지운 것이 이긴다.
- **다른 체크리스트의 id 로는 못 덮는다** (`other-checklist`). 모양이 이상한 것은 받지 않는다 (`rejected`).
- 폴더를 지우면 안의 할 일·하위 폴더는 **위로 올라간다** — Bento 와 같은 규칙.
- 같은 자리에 같은 이름의 폴더는 안 된다 — Bento 와 같은 규칙.

## API

`Authorization: Bearer nyt_…` — 개인 토큰 (내 계정 → 개인 토큰). 해시만 저장하고 평문은 만들 때 한 번만
보여 준다. 끊으면 바로 401. 막힌 계정의 토큰도 401.

```
GET  /api/sync/me                              나 · 고칠 수 있는 체크리스트들 · 기본 체크리스트
POST /api/sync/checklists          {title}     체크리스트 만들기 (맞출 것이 없을 때)
GET  /api/sync/checklists/:id/changes?since=N  N 다음에 바뀐 폴더·항목 (지운 것 포함), cursor, more
POST /api/sync/checklists/:id/changes          {folders, items}  → {applied, stale, rejected, current}
```

- 순서는 늘 **올리고 → 받기.** `more` 가 true 면 `cursor` 로 이어서 또 받는다.
- 권한은 `access.ts` 그대로 — 토큰은 "누구인가"만 정한다. 고칠 수 없으면 404.
- CORS 는 `tauri://localhost` · `http://localhost:1420` 등만 (`SYNC_ALLOWED_ORIGINS`). 쿠키를 쓰지 않으므로
  열어 둬도 남의 세션을 빌려 쓰는 일은 없다.
- 레이트 리밋: 토큰당 분당 600, 틀린 토큰은 주소당 분당 30.

## 확인하기

```powershell
pnpm --filter @nyanotion/db smoke:sync                                   # 32개 — 번호 · 지운 표시 · 이김 · 토큰
INSPECT_URL=http://localhost:3100 node apps/web/scripts/e2e-sync.mjs        # 20개 — 토큰 → API → 웹 → API

# Bento 엔진까지 — vallista-land 에서. 가짜 Rust 계층 + 진짜 nyanotionSync.ts + 진짜 서버, 맥 두 대 (27개)
SYNC_BASE=http://localhost:3100 SYNC_TOKEN=nyt_… node apps/admin/scripts/sync-harness/run.mjs
```

## 다음 (2단계)

계획 블록 · 기분/회고 · 요약 · Radar · Thoughts · Glean · 라벨 · 피드 구독 · 설정을 서버로.
클립보드 기록과 메일 계정(맥의 키로 암호화돼 있다)은 옮기지 않는다. 헬스(`body_log`)와 로컬 LLM 은 Bento 에서
없어졌으므로(2026-10-13) 옮길 것이 없다.
