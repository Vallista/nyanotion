<#
.SYNOPSIS
  한 환경의 서버 두 개(웹 · 동기화)를 같이 띄운다.

.DESCRIPTION
  Nyanotion 은 프로세스가 둘이다 — Next(웹)와 Hocuspocus(Yjs 동기화). 하나만 떠 있으면
  화면은 열리는데 저장이 안 되는, 알아채기 어려운 상태가 된다. 그래서 늘 같이 다룬다.

  환경마다 포트·DB·빌드 폴더가 다르므로 베타와 운영을 **동시에** 돌릴 수 있다.

.PARAMETER Env
  dev(기본) · beta · prod

.PARAMETER Build
  띄우기 전에 빌드한다. beta·prod 는 빌드된 결과가 있어야 하므로 처음엔 반드시 필요하다.
  dev 는 빌드하지 않는다 (next dev 가 알아서 한다).

.PARAMETER Stop
  그 환경의 프로세스를 멈추기만 한다.

.EXAMPLE
  pwsh scripts/run.ps1                      # 로컬 개발
  pwsh scripts/run.ps1 -Env beta -Build     # 베타 빌드 후 실행
  pwsh scripts/run.ps1 -Env prod -Stop
#>
[CmdletBinding()]
param(
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'dev',
  [switch] $Build,
  [switch] $Stop
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$marker = "NYANOTION_RUN=$Env"

function Info($text) { Write-Host $text -ForegroundColor Cyan }
function Ok($text) { Write-Host "   ok   $text" -ForegroundColor DarkGray }

# 이 환경으로 띄운 node 프로세스를 찾는다 (환경 변수를 표식으로 쓴다).
function Find-Ours {
  Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*nyanotion*" -and $_.CommandLine -like "*$Env*" }
}

if ($Stop) {
  $found = Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$root*" }
  foreach ($p in $found) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Ok "멈춤 $($p.ProcessId)" } catch { }
  }
  Info "$Env 관련 프로세스를 멈췄습니다."
  return
}

$env:NYANOTION_ENV = $Env
$env:NEXT_DIST_DIR = ".next-$Env"

# 포트는 설정 파일이 정한다. Next 는 설정을 읽기 **전에** 포트를 잡으므로
# 여기서 파일을 직접 훑어 $env:PORT 로 넣어 준다 (값이 두 군데로 갈라지지 않게).
function Read-EnvValue([string] $key, [string] $fallback) {
  foreach ($file in @(".env.$Env", '.env')) {
    $path = Join-Path $root $file
    if (-not (Test-Path $path)) { continue }
    foreach ($line in Get-Content $path) {
      if ($line -match "^\s*$([regex]::Escape($key))\s*=\s*(.*?)\s*$") {
        $value = $Matches[1].Trim('"').Trim("'")
        if ($value -ne '') { return $value }
      }
    }
  }
  return $fallback
}

$webPort = Read-EnvValue 'PORT' $(if ($Env -eq 'beta') { '3100' } else { '3000' })
$collabPort = Read-EnvValue 'COLLAB_PORT' $(if ($Env -eq 'beta') { '1334' } else { '1234' })
$env:PORT = $webPort
$env:COLLAB_PORT = $collabPort

Push-Location $root
try {
  if ($Build) {
    Info "빌드 ($Env)"
    & pnpm --filter @nyanotion/web build
    if ($LASTEXITCODE -ne 0) { throw '빌드가 실패했습니다.' }
    Ok '빌드 끝'
  }

  Info "`n띄웁니다 — $Env"
  Ok "웹      http://localhost:$webPort"
  Ok "동기화  ws://localhost:$collabPort"

  # 동기화 서버를 먼저 — 웹이 붙을 곳이 있어야 한다.
  $collabCmd = if ($Env -eq 'dev') { 'dev' } else { 'start' }
  $collab = Start-Process -PassThru -NoNewWindow -FilePath 'pnpm' `
    -ArgumentList @('--filter', '@nyanotion/collab', $collabCmd) `
    -WorkingDirectory $root

  Start-Sleep -Seconds 2

  $webCmd = if ($Env -eq 'dev') { 'dev' } else { 'start' }
  $web = Start-Process -PassThru -NoNewWindow -FilePath 'pnpm' `
    -ArgumentList @('--filter', '@nyanotion/web', $webCmd) `
    -WorkingDirectory $root

  Write-Host "`nCtrl+C 로 둘 다 멈춥니다." -ForegroundColor DarkGray

  try {
    Wait-Process -Id $web.Id
  } finally {
    foreach ($p in @($web, $collab)) {
      if ($null -ne $p -and -not $p.HasExited) {
        try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch { }
      }
    }
  }
} finally {
  Pop-Location
  foreach ($name in @('NYANOTION_ENV', 'NEXT_DIST_DIR', 'PORT', 'COLLAB_PORT')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}
