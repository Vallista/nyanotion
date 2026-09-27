#Requires -Version 7.0
<#
.SYNOPSIS
  새 코드를 그 환경에 올린다 — 빌드 · 마이그레이션 · 다시 세우기 · **확인까지**.

.DESCRIPTION
  손으로 하면 두 번에 한 번은 빠뜨린다. 실제로 겪은 것 둘:

    1. 프로세스를 죽이고 곧바로 `Start-ScheduledTask` 를 부르면 **안 뜬다.**
       작업 스케줄러가 아직 그 인스턴스를 정리하는 중이라 요청을 흘린다
       (`LastTaskResult` 가 4294967295 로 남는다). 그러면 가족 서버가 조용히 내려가 있다.
    2. 마이그레이션을 빠뜨린 채 새 코드를 올리면 없는 칼럼을 찾는다.

  그래서 이 스크립트는 **멈춘 것을 확인하고 세우고, 포트가 실제로 열릴 때까지 기다린다.**
  안 열리면 0 이 아닌 값으로 끝난다 — "올렸습니다" 라고 말하고 내려가 있으면 안 된다.

.PARAMETER Env
  beta 가 기본이다. **운영에 올리기 전에 베타에서 먼저 본다.**

.PARAMETER SkipMigrate
  마이그레이션 없이 코드만. 되돌릴 때 쓴다.

.EXAMPLE
  pwsh scripts/deploy.ps1                 # 베타
  pwsh scripts/deploy.ps1 -Env prod       # 운영 (작업 스케줄러로 다시 세운다)
#>
[CmdletBinding()]
param(
  [ValidateSet('beta', 'prod')] [string] $Env = 'beta',
  [switch] $SkipMigrate
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$root = Get-RepoRoot
Push-Location $root

function Wait-Port {
  param([int] $Port, [int] $Seconds = 90)
  $until = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $until) {
    $open = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $open) { return $true }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Stop-Port {
  param([int] $Port)
  $open = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($one in $open) {
    Stop-Process -Id $one.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  # 포트가 실제로 놓일 때까지 기다린다 — 안 그러면 다음 것이 EADDRINUSE 로 죽는다.
  $until = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $until) {
    if ($null -eq (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
      return
    }
    Start-Sleep -Milliseconds 400
  }
  Write-Warn "$Port 이 아직 잡혀 있습니다."
}

try {
  $port = [int] (Get-NyanotionSetting -Name 'PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '3100' } else { '3000' }))
  $collabPort = [int] (Get-NyanotionSetting -Name 'COLLAB_PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '1334' } else { '1234' }))

  Write-Step "$Env 에 올립니다 — 웹 $port · 동기화 $collabPort"
  $commit = (& git rev-parse --short HEAD 2>$null)
  if ($null -ne $commit) { Write-Ok "커밋 $commit" }

  # ── 1. 마이그레이션 먼저 ──────────────────────────────────────────────────
  # 새 코드가 없는 칼럼을 찾는 일이 없도록 **코드보다 먼저** 스키마를 맞춘다.
  if (-not $SkipMigrate) {
    Write-Step '데이터베이스'
    $env:NYANOTION_ENV = $Env
    & pnpm --filter '@nyanotion/db' migrate
    if ($LASTEXITCODE -ne 0) { throw '마이그레이션이 실패했습니다 — 코드는 올리지 않았습니다.' }
    Remove-Item Env:NYANOTION_ENV -ErrorAction SilentlyContinue
  }

  # ── 2. 빌드 ──────────────────────────────────────────────────────────────
  Write-Step '빌드'
  $env:NYANOTION_ENV = $Env
  $env:NEXT_DIST_DIR = ".next-$Env"
  & pnpm --filter '@nyanotion/web' build
  $built = $LASTEXITCODE
  Remove-Item Env:NYANOTION_ENV, Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
  if ($built -ne 0) { throw '빌드가 실패했습니다 — 돌고 있는 서버는 건드리지 않았습니다.' }
  Write-Ok "apps/web/.next-$Env"

  # ── 3. 다시 세우기 ───────────────────────────────────────────────────────
  if ($Env -eq 'prod') {
    Write-Step '작업 다시 세우기'
    # **멈춘 것을 확인하고 세운다.** 죽이자마자 Start 를 부르면 스케줄러가 요청을 흘린다.
    foreach ($name in 'Nyanotion-Web', 'Nyanotion-Collab', 'Nyanotion-Worker') {
      Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    }
    Stop-Port $port
    Stop-Port $collabPort

    $order = @('Nyanotion-Collab', 'Nyanotion-Web', 'Nyanotion-Worker')
    foreach ($name in $order) {
      $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
      if ($null -eq $task) {
        Write-Warn "$name 작업이 없습니다 — pwsh scripts/autostart.ps1 을 먼저 돌리세요."
        continue
      }
      # 스케줄러가 이전 인스턴스를 정리할 틈을 준다.
      $until = (Get-Date).AddSeconds(20)
      while ((Get-ScheduledTask -TaskName $name).State -eq 'Running' -and (Get-Date) -lt $until) {
        Start-Sleep -Milliseconds 500
      }
      Start-ScheduledTask -TaskName $name
      Write-Ok $name
      if ($name -eq 'Nyanotion-Collab') { Start-Sleep -Seconds 3 }
    }
  } else {
    Write-Step '베타 다시 세우기'
    Stop-Port $port
    Stop-Port $collabPort
    $launcher = Join-Path $root 'scripts\serve-one.ps1'
    foreach ($what in 'collab', 'web') {
      Start-Process -FilePath 'pwsh.exe' `
        -ArgumentList @('-NoProfile', '-File', $launcher, '-What', $what, '-Env', $Env) `
        -WorkingDirectory $root | Out-Null
      Write-Ok $what
      if ($what -eq 'collab') { Start-Sleep -Seconds 2 }
    }
  }

  # ── 4. 확인 ──────────────────────────────────────────────────────────────
  Write-Step '확인'
  if (-not (Wait-Port -Port $collabPort)) { throw "동기화 서버($collabPort)가 뜨지 않았습니다." }
  Write-Ok "동기화 $collabPort"
  if (-not (Wait-Port -Port $port)) { throw "웹($port)이 뜨지 않았습니다." }
  Write-Ok "웹 $port"

  $login = try {
    (Invoke-WebRequest -Uri "http://localhost:$port/login" -UseBasicParsing -TimeoutSec 20).StatusCode
  } catch { 0 }
  if ($login -ne 200) { throw "/login 이 $login 을 돌려줬습니다." }
  Write-Ok '/login 200'

  if ($Env -eq 'prod') {
    # 밖에서도 들어와지는지 — 터널이 붙어 있어야 가족이 쓴다.
    $outside = try {
      (Invoke-WebRequest -Uri 'https://nyanotion.party/login' -UseBasicParsing -TimeoutSec 25).StatusCode
    } catch { 0 }
    if ($outside -eq 200) { Write-Ok '터널 밖에서 200' }
    else { Write-Warn "터널 밖에서 $outside — cloudflared 를 확인하세요." }
  }

  Write-Host "`n끝났습니다 ($Env). 상태는 /status 에서 볼 수 있습니다." -ForegroundColor Green
} finally {
  Pop-Location
}
