# 데이터 모델

원본은 `packages/db/schema/*.ts` (Drizzle) 이고, 마이그레이션 SQL은 `packages/db/migrations/` 에 번호순으로 쌓인다.
**적용된 마이그레이션 SQL은 고치지 않는다** — 새 번호를 추가한다.

모든 id는 `text` (cuid2). 시간은 `timestamptz`.

---

## 1. 인증 · 가족(조직) — Better Auth 관리

Better Auth 와 organization 플러그인이 만드는 테이블. 스키마를 직접 바꾸지 말고 플러그인 설정으로 확장한다.

| 테이블 | 핵심 컬럼 |
| --- | --- |
| `user` | `id, name, email, email_verified, image, created_at, updated_at` |
| `session` | `id, user_id, token, expires_at, ip_address, user_agent` |
| `account` | `id, user_id, provider_id, account_id, password` (자격증명/OAuth) |
| `verification` | 이메일 인증·비밀번호 재설정 토큰 |
| `organization` | `id, name, slug, logo, metadata, created_at` |
| `member` | `id, organization_id, user_id, role, created_at` |
| `invitation` | `id, organization_id, email, role, status, expires_at, inviter_id` |

`organization` 은 이 앱에서 **가족**이다 (UI 문구는 "가족" 또는 "묘연", 스키마는 Better Auth 의 이름을 그대로 둔다).

가족 역할: `owner | admin | member | guest`.
→ **가족 수준 행위에만 쓴다** (멤버 초대, 가족 설정, space 생성). 문서 권한과 섞지 않는다.

**가입은 초대 전용이다.** `invitation` 에 유효한 토큰이 없으면 `user` 행이 생기지 않는다.
`ALLOW_PUBLIC_SIGNUP=false` 가 기본이고, 이 값을 true 로 만드는 코드 경로를 두지 않는다.

---

## 2. 공간 · 문서

### `space`
문서가 사는 최상위 컨테이너. 개인과 가족을 하나의 개념으로 묶는다.

```
id              text pk
kind            text        'personal' | 'org'
owner_user_id   text null   kind='personal' 일 때만
organization_id text null   kind='org' 일 때만
name            text
icon            text null
created_at      timestamptz

check: (kind='personal') = (owner_user_id is not null)
check: (kind='org')      = (organization_id is not null)
unique(owner_user_id) where kind='personal'
```

- 회원가입 훅에서 personal space 1개 자동 생성
- 가족 생성 훅에서 org space 1개 자동 생성 (나중에 가족당 여러 space 허용 가능 — 스키마는 이미 열려 있음)

### `document`
페이지 하나. **`parent_id` 트리가 곧 그룹핑**이다.

```
id            text pk
space_id      text fk -> space
parent_id     text null fk -> document      루트면 null
position      text                          fractional index (형제 간 정렬)
type          text        'page' | 'collection'
title         text
icon          text null
cover         text null
content_json  jsonb       BlockNote 블록 트리 (M1 원본 → M2부터 파생값)
ydoc_state    bytea null  Yjs 상태 (**M2부터 원본**)
text_plain    text        블록을 펼친 평문 — FTS·LLM·청킹용 파생값
search_tsv    tsvector    generated from text_plain + title
created_by    text fk -> user
updated_by    text fk -> user
created_at    timestamptz
updated_at    timestamptz
archived_at   timestamptz null              휴지통
is_template   boolean default false

index (space_id, parent_id, position)
index gin (search_tsv)
index (space_id) where archived_at is null
```

- **삭제는 `archived_at` 로만** 한다. 하드 삭제는 휴지통 비우기에서만, 하위 트리 통째로.
- `position` 은 fractional index (예: `"a0"`, `"a0V"`). 형제 사이로 끼워 넣을 때 다른 행을 안 건드리려고.
- 트리 조회는 재귀 CTE. 한 space의 사이드바 전체는 `title/icon/parent_id/position` 만 뽑는다 (`content_json` 제외 — 무겁다).

> **콘텐츠 원본이 언제 바뀌는지**
> - **M1**: `content_json` 이 원본, `ydoc_state` 는 null.
> - **M2**: `content_json → Y.Doc` 로 1회 변환해 `ydoc_state` 에 넣고 **원본을 옮긴다.** 이후 `content_json` 과 `text_plain` 은 저장 시마다 갱신하는 **파생값**이다.
> - 파생값을 유지하는 이유: 검색·렌더·API·LLM 이 CRDT 를 몰라도 되게 하려고. 읽기 경로에서 Y.Doc 을 역직렬화하지 않는다.

### `document_version`
수동/주기 스냅샷. 전체 이력이 아니라 복원 지점.

```
id, document_id, content_json, text_plain, label, created_by, created_at
```

### `document_link`
문서 내 `@문서` 멘션에서 파생. 백링크 패널용.

```
from_document_id, to_document_id, primary key(from, to)
```

---

## 3. 분류

### `tag`
```
id, space_id fk, name, color
unique(space_id, name)
```

### `document_tag`
```
document_id, tag_id, primary key(document_id, tag_id)
index (tag_id)
```

### `collection`
저장된 필터+정렬+뷰. "노션 데이터베이스"의 가벼운 버전.

```
id, space_id fk, name, icon
filter_json jsonb    { tags:[...], parentId, createdBy, updatedAfter, ... }
sort_json   jsonb
view        text     'table' | 'board' | 'list' | 'gallery'
group_by    text null  보드 뷰의 그룹 기준 (tag 등)
```

`collection` 은 문서를 **소유하지 않는다** — 조건에 맞는 문서를 보여줄 뿐이다. 문서의 위치는 언제나 트리 하나뿐.

### `favorite`
```
user_id, document_id, position, primary key(user_id, document_id)
```

---

## 4. 권한

### `document_share`
```
id
document_id  fk
subject_type text   'user' | 'org'
subject_id   text   user.id 또는 organization.id
role         text   'viewer' | 'commenter' | 'editor' | 'owner'
created_by, created_at
unique(document_id, subject_type, subject_id)
```

### `public_link`
```
id, document_id fk, token text unique, role text ('viewer'|'commenter'),
password_hash text null, expires_at timestamptz null, created_by, created_at
```

### 실효 권한 계산 — `packages/auth/access.ts`

```
effectiveRole(user, document) = max(
  document_share 중 subject=user 인 것,
  document_share 중 subject ∈ user가 속한 가족(org) 인 것,
  조상 문서들에 대해 위 둘을 반복한 것,
  spaceBaseRole(user, document.space)
)

spaceBaseRole:
  personal space → owner_user_id == user.id ? 'owner' : none
  org space(가족) → member.role 에 따라  owner/admin → 'owner', member → 'editor', guest → none
```

공개 링크로 들어온 세션은 위 계산을 건너뛰고 링크의 role 을 쓰되, **해당 문서와 그 하위 트리로만** 제한한다.

> **불변 규칙**
> 1. 문서 목록/검색/RAG 는 전부 `readableDocumentIds(userId, spaceId?)` 를 먼저 통과한다.
> 2. 벡터 검색은 권한으로 좁힌 **뒤에** 한다. 순서가 바뀌면 임베딩 유사도로 남의 문서 존재·내용이 샌다.
> 3. 권한 판정 코드는 `access.ts` 밖에 두지 않는다. 라우트마다 손으로 조건을 짜면 반드시 어긋난다.

---

## 5. 협업 · 부가

### `comment`
```
id, document_id fk, block_id text null, parent_comment_id null,
author_id fk, body_json jsonb, resolved_at null, created_at, updated_at
```

### `attachment`
```
id, space_id, document_id null, storage_path text, mime, size_bytes, created_by, created_at
```
파일은 DB가 아니라 디스크(`infra/data/attachments/<space_id>/...`)에 둔다. 백업 대상에 포함.

### `audit_log`
```
id, actor_id, organization_id null, action text, target_type, target_id, meta jsonb, created_at
```
가족 안에서 "누가 뭘 공유했나" 추적용. 우선순위 낮음 — M8.

---

## 6. AI · 검색

### `chunk`
```
id, document_id fk, ord int, block_path text, text text, token_count int, content_hash text, updated_at
unique(document_id, ord)
index (document_id)
```
`content_hash` 가 같으면 재임베딩하지 않는다 — 저장할 때마다 전체 문서를 다시 임베딩하면 GPU가 놀 틈이 없다.

### `embedding`
```
chunk_id  fk pk
model     text          예: 'bge-m3'
vector    vector(1024)
created_at
index using hnsw (vector vector_cosine_ops)
```
모델을 바꾸면 `model` 이 다른 행을 새로 쌓고, 전환이 끝나면 옛 모델 행을 지운다.

### `ai_job`
```
id, kind text ('embed'|'summarize'|'autotag'), document_id null,
status text ('queued'|'running'|'done'|'failed'), attempts int,
payload jsonb, result jsonb null, error text null,
created_at, started_at, finished_at
index (status, created_at)
```
`worker` 가 `queued` 를 집어간다. **GPU 모드가 `gaming` 이면 아무것도 집지 않는다.**

### `ai_thread` / `ai_message`
문서 질의 대화 기록.
```
ai_thread  : id, user_id, space_id, document_id null, title, created_at
ai_message : id, thread_id, role ('user'|'assistant'|'system'), content text,
             citations jsonb (chunk_id[]), model text, created_at
```

### 하이브리드 검색

```sql
-- 1) 권한으로 후보 문서 좁히기 (readableDocumentIds)
-- 2) FTS 점수와 벡터 거리 각각 상위 N → RRF(reciprocal rank fusion)로 합치기
-- 3) 상위 k개 청크를 근거로 반환
```
FTS는 한국어 형태소 분석기가 기본으로 없으므로 `simple` 설정 + trigram 보조로 시작하고, 부족하면 그때 `pg_bigm`/외부 인덱서를 검토한다.

---

## 7. 초기 마이그레이션 순서

```
0001_auth.sql          Better Auth + organization 테이블
0002_space_document.sql space, document, document_version, document_link
0003_tagging.sql       tag, document_tag, collection, favorite
0004_sharing.sql       document_share, public_link, audit_log
0005_collab.sql        comment, attachment
0006_ai.sql            vector 확장, chunk, embedding, ai_job, ai_thread, ai_message
```
