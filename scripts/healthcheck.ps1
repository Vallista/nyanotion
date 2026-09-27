#Requires -Version 7.0
<#
.SYNOPSIS
  가족 서버가 지금 멀쩡한가 — 한 줄로 답한다.

.DESCRIPTION
  재부팅 뒤에 "돌아왔나"를 눈으로 훑지 않기 위해 만들었다. 그리고 그것 말고도 쓸 곳이 있다 —
  **백업이 멈춰도 아무도 모르는 상태**였기 때문이다 (매일 4시 작업이 조용히 실패해도
  알아차릴 방법이 없었다).

  보는 것:
    작업 스케줄러 · 포트 · 터널 · /login · 데이터베이스 · 색인 큐 · 백업 나이 · 모델 서버

  **하나라도 어긋나면 0 이 아닌 값으로 끝난다.** "괜찮습니다" 라고 말하고 내려가 있으면 안 된다.
  경고(모델 서버가 안 뜸 등)는 끝내는 값을 바꾸지 않는다 — 문서는 그래도 쓸 수 있다.

.PARAMETER Env
  기본 prod.

.PARAMETER Outside
  터널 밖(https://nyanotion.party)까지 확인한다. 기본 켜짐. 인터넷이 없으면 -Outside:$false.

.EXAMPLE
  pwsh scripts/healthcheck.ps1
  pwsh scripts/healthcheck.ps1 -Env beta -Outside:$false
#>
[CmdletBinding()]
param(
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'prod',
  [switch] $Outside = $true,
  [int] $BackupWarnHours = 30
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$bad = 0
$warn = 0

function Good { param([string] $What, [string] $Detail = '')
  Write-Host ("  ok   {0}{1}" -f $What, $(if ($Detail -eq '') { '' } else { "  $Detail" })) -ForegroundColor Green
}
function Bad { param([string] $What, [string] $Detail = '')
  $script:bad += 1
  Write-Host ("  BAD  {0}{1}" -f $What, $(if ($Detail -eq '') { '' } else { "  $Detail" })) -ForegroundColor Red
}
function Meh { param([string] $What, [string] $Detail = '')
  $script:warn += 1
  Write-Host ("  --   {0}{1}" -f $What, $(if ($Detail -eq '') { '' } else { "  $Detail" })) -ForegroundColor DarkYellow
}

function Test-Url {
  param([string] $Url, [int] $Seconds = 20)
  try {
    return (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $Seconds -MaximumRedirection 0 -SkipHttpErrorCheck).StatusCode
  } catch {
    return 0
  }
}

$port = [int] (Get-NyanotionSetting -Name 'PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '3100' } else { '3000' }))
$collabPort = [int] (Get-NyanotionSetting -Name 'COLLAB_PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '1334' } else { '1234' }))

Write-Host ("Nyanotion 건강 확인 — {0}  ({1})" -f $Env, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor Cyan

# ── 작업 스케줄러 (운영만) ───────────────────────────────────────────────────
if ($Env -eq 'prod') {
  Write-Step '작업 스케줄러'
  # 에이전트는 선택이라 없어도 괜찮다. 나머지는 떠 있어야 한다.
  foreach ($name in 'Nyanotion-Collab', 'Nyanotion-Web', 'Nyanotion-Worker') {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($null -eq $task) { Bad "$name 작업이 없습니다" 'pwsh scripts/autostart.ps1'; continue }
    if ($task.State -eq 'Running') { Good $name } else {
      $last = (Get-ScheduledTaskInfo -TaskName $name).LastTaskResult
      Bad $name "state=$($task.State) last=$last"
    }
  }
  $backup = Get-ScheduledTask -TaskName 'Nyanotion-Backup' -ErrorAction SilentlyContinue
  if ($null -eq $backup) { Meh 'Nyanotion-Backup 작업이 없습니다' } else { Good 'Nyanotion-Backup 등록됨' }
}

# ── 포트 ─────────────────────────────────────────────────────────────────────
Write-Step '포트'
foreach ($pair in @(@{ n = '동기화'; p = $collabPort }, @{ n = '웹'; p = $port })) {
  $open = Get-NetTCPConnection -LocalPort $pair.p -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $open) { Bad "$($pair.n) $($pair.p) 이 안 열려 있습니다" }
  else { Good "$($pair.n) $($pair.p)" }
}

# ── 웹 ───────────────────────────────────────────────────────────────────────
Write-Step '웹'
$local = Test-Url "http://localhost:$port/login"
if ($local -eq 200) { Good "/login 200 (로컬)" } else { Bad "/login 이 $local 을 돌려줬습니다 (로컬)" }

if ($Outside -and $Env -eq 'prod') {
  $cloudflared = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
  if ($null -eq $cloudflared) { Bad 'cloudflared 가 안 돌고 있습니다' }
  else { Good 'cloudflared' ("pid {0}" -f $cloudflared[0].Id) }

  $url = Get-NyanotionSetting -Name 'BETTER_AUTH_URL' -Env $Env -Fallback 'https://nyanotion.party'
  # 지역 변수 이름을 $Outside 와 다르게 둔다 — PowerShell 은 대소문자를 구분하지 않아
  # $outside 에 대입하면 스위치 매개변수를 덮어쓴다.
  $fromOutside = Test-Url "$url/login" 30
  if ($fromOutside -eq 200) { Good "$url/login 200 (밖에서)" }
  else { Bad "밖에서 $url/login 이 $fromOutside 을 돌려줬습니다" }
}

# ── 데이터베이스 ─────────────────────────────────────────────────────────────
Write-Step '데이터베이스'
$dbUrl = Get-NyanotionSetting -Name 'DATABASE_URL' -Env $Env
if ($dbUrl -eq '') { Bad 'DATABASE_URL 을 찾을 수 없습니다' } else {
  $db = Split-DatabaseUrl -Url $dbUrl
  $psql = Get-PgTool -Name 'psql'
  $env:PGPASSWORD = $db.Password
  try {
    $counts = & $psql -h $db.Host -p $db.Port -U $db.User -d $db.Database -t -A -w -c @"
select (select count(*) from document where archived_at is null)
    || '|' || (select count(*) from ai_job where state = 'queued')
    || '|' || (select count(*) from ai_job where state = 'failed')
    || '|' || (select count(*) from document_chunk)
    || '|' || (select count(*) from drizzle.__drizzle_migrations)
"@ 2>&1
    if ($LASTEXITCODE -ne 0) { Bad '데이터베이스에 닿지 못했습니다' ($counts | Select-Object -First 1) }
    else {
      $parts = ("$counts".Trim() -split '\|')
      Good "$($db.Database)" ("문서 {0} · 토막 {1} · 마이그레이션 {2}개 적용" -f $parts[0], $parts[3], $parts[4])
      if ([int] $parts[2] -gt 0) { Bad "색인 실패한 일이 $($parts[2])건 있습니다" '/status 에서 확인' }
      elseif ([int] $parts[1] -gt 0) { Meh "색인 대기 $($parts[1])건" '워커가 돌고 있으면 곧 끝납니다' }
      else { Good '색인 큐 비어 있음' }
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

# ── 백업 ─────────────────────────────────────────────────────────────────────
# **이게 이 스크립트의 절반이다.** 백업은 멈춰도 아무 소리를 내지 않는다.
Write-Step '백업'
$backupRoot = 'C:\nyanotion\backups'
$newest = Get-ChildItem $backupRoot -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "$Env-*" } |
  Sort-Object CreationTime -Descending |
  Select-Object -First 1
if ($null -eq $newest) { Bad "백업이 하나도 없습니다" $backupRoot }
else {
  $age = (Get-Date) - $newest.CreationTime
  $detail = "{0}  ({1:N1}시간 전)" -f $newest.Name, $age.TotalHours
  if ($age.TotalHours -gt $BackupWarnHours) { Bad '백업이 오래됐습니다' $detail }
  else { Good '백업' $detail }

  $dump = Join-Path $newest.FullName 'database.dump'
  if (-not (Test-Path $dump)) { Bad '가장 최근 백업에 database.dump 가 없습니다' }
  elseif ((Get-Item $dump).Length -lt 1024) { Bad 'database.dump 가 비어 있습니다' }
  else { Good 'database.dump' ("{0:N0} 바이트" -f (Get-Item $dump).Length) }

  if (-not (Test-Path (Join-Path $newest.FullName 'secrets.env'))) {
    # 이게 없으면 DB 를 되살려도 아무도 로그인하지 못한다.
    Bad '백업에 secrets.env 가 없습니다' 'BETTER_AUTH_SECRET 없이는 복구해도 로그인 불가'
  } else { Good 'secrets.env 있음' }
}

# ── 모델 서버 (없어도 문서는 쓸 수 있다) ─────────────────────────────────────
Write-Step '냥이'
try {
  $tags = Invoke-WebRequest -Uri 'http://127.0.0.1:11434/api/tags' -UseBasicParsing -TimeoutSec 5
  $models = ($tags.Content | ConvertFrom-Json).models.name
  Good 'Ollama' ("{0}개 모델" -f @($models).Count)
  foreach ($need in 'bge-m3', 'exaone3.5') {
    if ($models -match $need) { Good "$need 있음" } else { Meh "$need 가 없습니다" "ollama pull $need" }
  }
} catch {
  Meh 'Ollama 에 닿지 못했습니다' '문서·검색은 그대로 됩니다. 냥이와 문서 질의만 멈춥니다'
}

# ── 끝 ───────────────────────────────────────────────────────────────────────
Write-Host ''
if ($bad -gt 0) {
  Write-Host ("어긋난 것 {0}개{1}" -f $bad, $(if ($warn -gt 0) { " (경고 $warn)" } else { '' })) -ForegroundColor Red
  exit 1
}
if ($warn -gt 0) {
  Write-Host ("멀쩡합니다 (경고 {0})" -f $warn) -ForegroundColor Yellow
  exit 0
}
Write-Host '전부 멀쩡합니다' -ForegroundColor Green
exit 0
