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
- 프로젝트 정식 이름 (`mungchi` 는 코드네임)
- 외부 공개 범위 — 완전 공개 도메인 vs 나/지인만 (Cloudflare Access 적용 여부)
- 모델 선택 — VRAM 실측 후 결정
