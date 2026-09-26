<#
.SYNOPSIS
  GitHub 저장소를 만들고 지금까지의 커밋을 올린다.

.DESCRIPTION
  **먼저 로그인해야 한다** (한 번만):

      gh auth login

  그다음 이 스크립트를 돌리면 저장소를 만들고 `main` 을 올린다. 이미 원격이 있으면
  만들지 않고 올리기만 한다.

  올리기 전에 **추적 중인 파일에 비밀값이 있는지 훑고**, 있으면 멈춘다.
  `.env*` 는 본보기(.example)만 커밋된다 — `.gitignore` 참고.

.PARAMETER Name
  저장소 이름. 기본 nyanotion.

.PARAMETER Private
  비공개로 만든다. 기본은 공개.

.EXAMPLE
  gh auth login
  pwsh scripts/publish-github.ps1
#>
[CmdletBinding()]
param(
  [string] $Name = 'nyanotion',
  [switch] $Private
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

function Info($t) { Write-Host $t -ForegroundColor Cyan }
function Ok($t) { Write-Host "   ok   $t" -ForegroundColor DarkGray }

try {
  # gh 는 PATH 에 없을 수도 있다 (zip 으로 넣은 경우).
  $gh = (Get-Command gh -ErrorAction SilentlyContinue)?.Source
  if ($null -eq $gh) {
    $guess = Join-Path $env:LOCALAPPDATA 'Programs\gh\bin\gh.exe'
    if (Test-Path $guess) { $gh = $guess }
  }
  if ($null -eq $gh) { throw 'gh 를 찾을 수 없습니다. https://cli.github.com 에서 설치하세요.' }

  & $gh auth status 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw '먼저 로그인하세요:  gh auth login' }
  Ok '로그인됨'

  # ── 비밀값 훑기 ────────────────────────────────────────────────────────────
  Info "`n비밀값 확인"
  $tracked = & git ls-files
  $envFiles = $tracked | Where-Object { $_ -match '^\.env' -and $_ -notmatch '\.example$' }
  if ($envFiles.Count -gt 0) {
    throw "설정 파일이 추적되고 있습니다 — 올리면 안 됩니다:`n  $($envFiles -join "`n  ")"
  }

  $pattern = '(BETTER_AUTH_SECRET|PASSWORD|SECRET|TOKEN|API_KEY)\s*[:=]\s*["'']?[A-Za-z0-9+/=_-]{16,}'
  $hits = & git grep -nIE $pattern -- . ':!pnpm-lock.yaml' 2>$null |
    Where-Object { $_ -notmatch 'change_me|generate_with|ci-only-not-a-real|process\.env|<.*>' }
  if ($null -ne $hits -and $hits.Count -gt 0) {
    throw "비밀값처럼 보이는 것이 있습니다:`n  $($hits -join "`n  ")"
  }
  Ok '깨끗함'

  # ── 원격 ───────────────────────────────────────────────────────────────────
  $remote = & git remote get-url origin 2>$null
  if ($LASTEXITCODE -eq 0 -and $remote) {
    Ok "원격이 이미 있습니다: $remote"
  } else {
    $visibility = if ($Private) { '--private' } else { '--public' }
    Info "`n저장소 만들기 ($(if ($Private) { '비공개' } else { '공개' }))"
    & $gh repo create $Name $visibility --source=. --remote=origin `
      --description '집 컴퓨터 한 대에서 도는 가족용 문서 서버 — 노션처럼 쓰되 글이 밖으로 나가지 않는다'
    if ($LASTEXITCODE -ne 0) { throw '저장소를 만들지 못했습니다.' }
    Ok '만들었습니다'
  }

  Info "`n올리기"
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw '푸시가 실패했습니다.' }

  $url = (& $gh repo view --json url --jq .url)
  Write-Host "`n끝났습니다 — $url" -ForegroundColor Green
} finally {
  Pop-Location
}
