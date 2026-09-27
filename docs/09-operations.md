# 09 — 운영: 백업 · 자동 시작

가족이 실제로 쓰는 서버다. 여기서부터는 "되게 만드는" 일이 아니라 **"잃지 않는" 일**이다.

---

## 잃으면 되돌릴 수 없는 것 셋

1. **데이터베이스** — 문서 본문(Yjs) · 권한 · 구매 기록
2. **올린 파일** — DB 에는 이름만 있고 바이트는 디스크에 있다
3. **`BETTER_AUTH_SECRET`** — 세션 쿠키를 이 값으로 서명한다.
   **이게 없으면 DB 를 되살려도 아무도 로그인하지 못한다**

셋째가 가장 잊기 쉽다. 그래서 `backup.ps1` 이 설정 파일까지 함께 받는다.

---

## 백업

```powershell
pwsh scripts/backup.ps1                 # 운영, C:\nyanotion\backups, 14일 보관
pwsh scripts/backup.ps1 -Env beta -Keep 7
```

한 폴더에 넷이 들어간다:

| | |
|---|---|
| `database.dump` | `pg_dump -Fc` (압축된 custom 형식) |
| `uploads.zip` | 올린 파일 전부 |
| `secrets.env` | `BETTER_AUTH_SECRET` · `DATABASE_URL` · VAPID 키 |
| `manifest.json` | 언제·어느 환경·몇 개·어느 커밋 |

> **이 폴더에는 비밀값이 들어 있다.** 클라우드에 올릴 거라면 폴더째 암호를 걸 것.

매일 새벽 4시에 저절로 돈다 (`Nyanotion-Backup` 작업).

---

## 복구 — 받아 두기만 하는 건 백업이 아니다

되살아나는지 봐야 백업이다. 그래서 `restore.ps1` 의 **기본 대상은 `beta`** 다 —
운영을 건드리지 않고 리허설할 수 있어야 실제로 하게 된다.

```powershell
pnpm stop:beta                                          # 붙어 있으면 DROP 이 막힌다
pwsh scripts/restore.ps1 -From C:\nyanotion\backups\prod-20260927-151307
pnpm serve:beta                                         # 열어서 확인
```

**운영으로 되살리려면 두 겹을 통과해야 한다** — 가족 문서를 날리는 명령이 오타 하나로 돌면 안 된다:

```powershell
pwsh scripts/restore.ps1 -From ... -Env prod -Force -Confirm nyanotion
```

비밀값은 **되살리지 않는다.** 어디에 둘지는 사람이 정할 일이고, 실수로 베타 설정을 운영 값으로
덮으면 더 큰 사고가 된다. 경로만 알려 준다.

### pgvector 는 수퍼유저가 켠다

덤프 안에 `CREATE EXTENSION vector` 가 들어 있지만 앱 역할로는 만들 수 없다.
복구 뒤 이 경고가 나오면 **문서·권한·구매 기록은 멀쩡하다.** 문서 질의도 돈다 —
확장이 없으면 `real[]` 로 계산한다 (느릴 뿐이다, `docs/10-ask.md`). 되살리려면:

```powershell
pwsh scripts/enable-vector.ps1 -Env beta
```

**다시 임베딩하지 않는다.** 이미 있는 임베딩을 벡터 칼럼으로 옮길 뿐이다.

> 2026-09-27 운영 백업을 베타에 되살려 확인했다 — 계정 2 · 문서 8, 운영과 완전히 같았다.

---

## 자동 시작

```powershell
pwsh scripts/autostart.ps1              # 등록
pwsh scripts/autostart.ps1 -NoAgent     # 구매 에이전트는 빼고
pwsh scripts/autostart.ps1 -Remove      # 해제
```

로그온 시 순서대로 뜬다:

| 작업 | 지연 | 하는 일 |
|---|---|---|
| `Nyanotion-Collab` | — | Yjs 동기화. **웹보다 먼저** 떠야 한다 |
| `Nyanotion-Web` | 10초 | Next 운영 서버 (3000) |
| `Nyanotion-Tunnel` | 20초 | Cloudflare Tunnel |
| `Nyanotion-Agent` | 30초 | 구매 에이전트 |
| `Nyanotion-Worker` | 40초 | 색인 워커 (문서 질의의 재료) |
| `Nyanotion-Backup` | 매일 4시 | 백업 |

### 왜 서비스가 아니라 "로그온 시 작업"인가

- 구매 에이전트가 **사람 브라우저 프로필**을 쓴다. 서비스 계정에는 그 로그인이 없다
- 문제가 생겼을 때 사람이 창을 열어 볼 수 있어야 한다

그래서 **자동 로그온이 꺼져 있으면 재부팅 뒤 로그인할 때까지 뜨지 않는다.**
가족이 늘 밖에서 들어와야 한다면 `netplwiz` 로 자동 로그온을 켜 둘 것.

### 함정 하나 — `cmd /c set A=B && C`

처음에는 작업에 이걸 박아 뒀는데, cmd 는 **`B` 뒤의 공백까지 값에 넣는다**
(`NYANOTION_ENV` 가 `"prod "` 가 된다). 그러면 환경을 못 알아보고 dev 로 떨어진다.
지금은 `scripts/serve-one.ps1` 이 한 겹 감싸서 값을 제대로 넣는다.

---

## 확인하기

```powershell
Get-ScheduledTask -TaskName Nyanotion-*                  # 상태
Start-ScheduledTask -TaskName Nyanotion-Web              # 하나만 다시
Get-ScheduledTaskInfo -TaskName Nyanotion-Web            # 마지막 결과
```

포트가 올라왔는지:

```powershell
foreach ($p in 3000, 1234) { Get-NetTCPConnection -LocalPort $p -State Listen -EA SilentlyContinue }
```

밖에서:

```powershell
curl.exe -sI https://nyanotion.party/login
curl.exe -sI https://collab.nyanotion.party
```

---

## 아직 안 한 것

- **재부팅 실제 시험.** 작업으로 세우는 것까지는 확인했지만 껐다 켜 보지는 않았다
- 기본 지표(응답시간·잡 큐·GPU 모드 이력)
- 레이트 리밋 · 감사 로그
- 백업을 집 밖으로 (지금은 같은 디스크다 — 디스크가 죽으면 같이 죽는다)

마지막 것이 제일 아쉽다. 외장 디스크나 클라우드로 `C:\nyanotion\backups` 를 주기적으로
옮기는 것만으로도 크게 낫다.
