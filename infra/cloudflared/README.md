# Cloudflare Tunnel

집 서버를 포트 개방·고정 IP 없이 밖에서 열기 위한 것. **HTTPS 가 여기서 생긴다** —
서비스 워커·홈 화면 추가·영구 저장소·공개 링크가 전부 HTTPS 를 요구한다.

## 도메인이 생긴 뒤 할 일

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel login                      # 브라우저에서 도메인 고르기
cloudflared tunnel create nyanotion           # 터널 id 와 자격증명 json 이 나온다
cloudflared tunnel route dns nyanotion 도메인
cloudflared tunnel route dns nyanotion collab.도메인

copy infra\cloudflared\config.example.yml infra\cloudflared\config.yml
# config.yml 의 < > 를 채운다

cloudflared tunnel run --config infra\cloudflared\config.yml nyanotion
```

## 그다음 앱 쪽에서 바꿀 것 (`.env`)

```
BETTER_AUTH_URL=https://도메인
TRUSTED_ORIGINS=https://도메인,http://localhost:3000,http://<Tailscale-IP>:3000
NEXT_PUBLIC_COLLAB_URL=wss://collab.도메인
```

**세 줄 다 바꿔야 한다.** 집 서버는 주소가 여럿이고, 이 프로젝트에서 같은 함정을 세 번 만났다 —
로그인 origin, 동기화 주소, 공유 링크. `TRUSTED_ORIGINS` 에서 기존 주소를 지우지 말 것:
집 안에서는 계속 랜/Tailscale 주소로 열게 된다.

## 부팅 때 자동 실행

```powershell
cloudflared service install    # 관리자 권한
```

## 임시로 먼저 확인만 하고 싶다면

도메인 없이 `cloudflared tunnel --url http://localhost:3000` 만 돌리면
`https://무작위.trycloudflare.com` 이 나온다. 재시작할 때마다 주소가 바뀌므로
**홈 화면에 추가한 앱이 깨진다** — PWA 동작 확인용으로만 쓴다.
