#Requires -Version 7.0
<#
.SYNOPSIS
  데이터베이스와 올린 파일을 한 벌로 받아 둔다.

.DESCRIPTION
  가족이 실제로 쓰는 서버라 **잃으면 되돌릴 수 없는 것**이 셋이다:
    1. 데이터베이스 (문서 본문 · 권한 · 구매 기록)
    2. 올린 파일 (그림 · 첨부) — DB 에는 이름만 있고 바이트는 디스크에 있다
    3. BETTER_AUTH_SECRET — **이게 없으면 DB 를 되살려도 아무도 로그인하지 못한다**

  셋을 한 폴더에 담고, 무엇이 들어 있는지 manifest.json 에 적는다.
  오래된 것은 `-Keep` 일 지나면 지운다.

  **받아 두기만 하는 것은 백업이 아니다.** `scripts/restore.ps1` 로 베타에 한 번 되살려
  보는 것까지가 한 벌이다 (그래서 restore 는 기본이 beta 다).

.PARAMETER Env
  어느 환경을 받을지. 기본 prod.

.PARAMETER To
  받아 둘 폴더. 기본 C:\nyanotion\backups

.PARAMETER Keep
  며칠 치를 남길지. 기본 14.

.EXAMPLE
  pwsh scripts/backup.ps1
  pwsh scripts/backup.ps1 -Env beta -To D:\backups -Keep 7
#>
[CmdletBinding()]
param(
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'prod',
  [string] $To = 'C:\nyanotion\backups',
  [int] $Keep = 14
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $To "$Env-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Step "백업 — $Env → $dir"

# ── 1. 데이터베이스 ──────────────────────────────────────────────────────────
$url = Get-NyanotionSetting -Name 'DATABASE_URL' -Env $Env
if ($url -eq '') { throw "DATABASE_URL 을 찾을 수 없습니다 (환경 $Env)." }
$db = Split-DatabaseUrl -Url $url
$pgDump = Get-PgTool -Name 'pg_dump'

$dumpPath = Join-Path $dir 'database.dump'
$env:PGPASSWORD = $db.Password
try {
  # -Fc = 압축된 custom 형식. pg_restore 가 표 단위로 골라 되살릴 수 있다.
  & $pgDump -h $db.Host -p $db.Port -U $db.User -d $db.Database -Fc -f $dumpPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump 가 실패했습니다.' }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
$dumpSize = (Get-Item $dumpPath).Length
Write-Ok ("database.dump  {0:N0} 바이트  ({1})" -f $dumpSize, $db.Database)

# ── 2. 올린 파일 ─────────────────────────────────────────────────────────────
$uploads = Get-UploadDir -Env $Env
$uploadCount = 0
$uploadZip = Join-Path $dir 'uploads.zip'
if (Test-Path $uploads) {
  $files = Get-ChildItem $uploads -File -ErrorAction SilentlyContinue
  $uploadCount = $files.Count
  if ($uploadCount -gt 0) {
    Compress-Archive -Path (Join-Path $uploads '*') -DestinationPath $uploadZip -Force
    Write-Ok ("uploads.zip    {0:N0} 바이트  ({1}개)" -f (Get-Item $uploadZip).Length, $uploadCount)
  } else {
    Write-Ok '올린 파일 없음'
  }
} else {
  Write-Warn "올린 파일 폴더가 없습니다: $uploads"
}

# ── 3. 비밀값 ────────────────────────────────────────────────────────────────
# **이게 백업에서 가장 잊기 쉬운 것이다.** DB 만 되살리면 아무도 로그인하지 못한다.
$secretsDir = [Environment]::GetEnvironmentVariable('NYANOTION_SECRETS_DIR')
$secretsSaved = $false
if (-not [string]::IsNullOrWhiteSpace($secretsDir) -and (Test-Path (Join-Path $secretsDir "$Env.env"))) {
  Copy-Item (Join-Path $secretsDir "$Env.env") (Join-Path $dir 'secrets.env')
  $secretsSaved = $true
} else {
  $envFile = if ($Env -eq 'dev') { '.env' } else { ".env.$Env" }
  $path = Join-Path (Get-RepoRoot) $envFile
  if (Test-Path $path) {
    Copy-Item $path (Join-Path $dir 'secrets.env')
    $secretsSaved = $true
  }
}
if ($secretsSaved) {
  Write-Ok 'secrets.env    (BETTER_AUTH_SECRET · DATABASE_URL · VAPID 키)'
  Write-Warn '이 폴더에는 비밀값이 들어 있습니다. 아무 데나 올리지 마세요.'
} else {
  Write-Warn '설정 파일을 못 찾아 비밀값을 못 받았습니다 — 로그인 복구가 안 될 수 있습니다.'
}

# ── 4. 무엇이 들어 있나 ──────────────────────────────────────────────────────
$manifest = [ordered]@{
  env         = $Env
  takenAt     = (Get-Date).ToString('o')
  database    = $db.Database
  dumpBytes   = $dumpSize
  uploadFiles = $uploadCount
  hasSecrets  = $secretsSaved
  gitCommit   = (& git -C (Get-RepoRoot) rev-parse --short HEAD 2>$null)
}
$manifest | ConvertTo-Json | Set-Content (Join-Path $dir 'manifest.json') -Encoding UTF8

# ── 5. 오래된 것 치우기 ──────────────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$Keep)
$old = Get-ChildItem $To -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "$Env-*" -and $_.CreationTime -lt $cutoff }
foreach ($folder in $old) {
  Remove-Item $folder.FullName -Recurse -Force
  Write-Ok "오래된 것 지움: $($folder.Name)"
}

$total = (Get-ChildItem $dir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ("`n끝났습니다 — {0}  ({1:N0} 바이트)" -f $dir, $total) -ForegroundColor Green
Write-Host "되살려 보기:  pwsh scripts/restore.ps1 -From `"$dir`"" -ForegroundColor DarkGray
