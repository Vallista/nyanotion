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

## 실제로 쓴 값 (nyanotion.party)

```
터널 이름 : nyanotion
터널 id   : cdb7d097-0249-4567-a033-c379f8e95a50
호스트    : nyanotion.party        → http://127.0.0.1:3000
            collab.nyanotion.party → ws://127.0.0.1:1234
```

`config.yml` 은 터널 id 를 담고 있어 git 에 올리지 않는다 (`.gitignore`).
자격증명 json 과 `cert.pem` 은 `~/.cloudflared/` 에 있다 — **이 둘이 곧 도메인 제어권이다.**

## 새 도메인은 인증서가 늦게 나온다

Cloudflare 의 Universal SSL 은 도메인을 막 산 직후에는 아직 발급 전이라, DNS 와 터널이 멀쩡해도
HTTPS 핸드셰이크가 깨진다 (`SEC_E_ILLEGAL_MESSAGE` / `HandshakeFailure`).
보통 15분 안팎, 늦으면 더 걸린다. **HTTP(80) 로 200 이 나오면 터널·앱은 정상이고 인증서만 기다리는 것이다.**

확인:

```bash
curl -s -o /dev/null -w "%{http_code}
" http://nyanotion.party/login    # 200 이면 터널 OK
curl -s -o /dev/null -w "%{http_code}
" https://nyanotion.party/login   # 000 이면 인증서 대기
```

> 인증서가 나오기 전에는 로그인해도 `/` 가 307 로 돈다. 세션 쿠키가 `Secure` 라 평문 HTTP 로는
> 실리지 않기 때문이다 — 고장이 아니라 의도된 동작이다.
