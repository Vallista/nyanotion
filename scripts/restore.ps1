#Requires -Version 7.0
<#
.SYNOPSIS
  받아 둔 백업을 되살린다. **기본은 베타다.**

.DESCRIPTION
  받아 두기만 하는 것은 백업이 아니다 — 되살아나는지 봐야 백업이다.
  그래서 이 스크립트의 기본 대상은 `beta` 다. 운영을 건드리지 않고 리허설할 수 있어야
  실제로 하게 되기 때문이다.

  되살리는 것:
    1. 데이터베이스 — **통째로 갈아엎는다** (drop → create → restore)
    2. 올린 파일 — 그 환경의 UPLOAD_DIR 로 푼다
    3. 비밀값은 **되살리지 않는다.** secrets.env 를 어디에 둘지는 사람이 정할 일이고,
       실수로 베타 설정을 운영 값으로 덮으면 더 큰 사고가 된다. 경로만 알려 준다.

  운영(`-Env prod`)으로 되살리려면 `-Force` 와 DB 이름을 직접 쳐야 한다.
  가족 문서를 날리는 명령이 오타 하나로 돌면 안 된다.

.EXAMPLE
  pwsh scripts/restore.ps1 -From C:\nyanotion\backups\prod-20260927-0600
  pwsh scripts/restore.ps1 -From ... -Env prod -Force -Confirm nyanotion
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $From,
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'beta',
  [switch] $Force,
  # 운영에 되살릴 때만 필요 — 지워질 DB 이름을 직접 쳐야 한다.
  [string] $Confirm = ''
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

if (-not (Test-Path $From)) { throw "백업 폴더가 없습니다: $From" }
$dumpPath = Join-Path $From 'database.dump'
if (-not (Test-Path $dumpPath)) { throw "database.dump 가 없습니다: $From" }

$manifestPath = Join-Path $From 'manifest.json'
if (Test-Path $manifestPath) {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  Write-Step "백업 내용"
  Write-Ok "받은 때   $($manifest.takenAt)"
  Write-Ok "원래 환경 $($manifest.env) · DB $($manifest.database)"
  Write-Ok "올린 파일 $($manifest.uploadFiles)개 · 커밋 $($manifest.gitCommit)"
}

$url = Get-NyanotionSetting -Name 'DATABASE_URL' -Env $Env
if ($url -eq '') { throw "DATABASE_URL 을 찾을 수 없습니다 (환경 $Env)." }
$db = Split-DatabaseUrl -Url $url

Write-Step "되살릴 곳 — $Env · $($db.Database)"

if ($Env -eq 'prod') {
  if (-not $Force) {
    throw "운영에 되살리려면 -Force 가 필요합니다. 먼저 베타에서 해 보세요."
  }
  if ($Confirm -ne $db.Database) {
    throw "확인을 위해 지워질 DB 이름을 직접 쳐 주세요:  -Confirm $($db.Database)"
  }
  Write-Warn '운영 데이터베이스를 통째로 갈아엎습니다.'
}

# ── 1. 데이터베이스 ──────────────────────────────────────────────────────────
$psql = Get-PgTool -Name 'psql'
$pgRestore = Get-PgTool -Name 'pg_restore'

$env:PGPASSWORD = $db.Password
try {
  Write-Step '데이터베이스'

  # 붙어 있는 연결을 끊는다 — 하나라도 남으면 DROP 이 막힌다.
  & $psql -h $db.Host -p $db.Port -U $db.User -d postgres -v ON_ERROR_STOP=1 -q -c @"
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE datname = '$($db.Database)' AND pid <> pg_backend_pid();
"@ | Out-Null

  & $psql -h $db.Host -p $db.Port -U $db.User -d postgres -v ON_ERROR_STOP=1 -q `
    -c "DROP DATABASE IF EXISTS `"$($db.Database)`""
  if ($LASTEXITCODE -ne 0) { throw '옛 데이터베이스를 지우지 못했습니다 (누군가 붙어 있나요?).' }

  & $psql -h $db.Host -p $db.Port -U $db.User -d postgres -v ON_ERROR_STOP=1 -q `
    -c "CREATE DATABASE `"$($db.Database)`" OWNER $($db.User)"
  if ($LASTEXITCODE -ne 0) { throw '데이터베이스를 만들지 못했습니다.' }

  # 확장은 덤프 안에서 만들어지지만 **수퍼유저만 만들 수 있는 것**이 있다 (vector).
  # 미리 켜 둘 수 있는 것은 켜 두고, 못 켜는 것은 아래에서 사람에게 알린다.
  & $psql -h $db.Host -p $db.Port -U $db.User -d $db.Database -q `
    -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm' 2>&1 | Out-Null

  $problems = & $pgRestore -h $db.Host -p $db.Port -U $db.User -d $db.Database `
    --no-owner --no-privileges $dumpPath 2>&1 | Where-Object { $_ -match 'error|ERROR' }

  # 확장 문제와 진짜 문제를 갈라서 보여 준다 — 섞어 놓으면 사람이 무엇을 해야 할지 모른다.
  $extensionTrouble = @($problems | Where-Object { $_ -match 'vector|확장 모듈' })
  $other = @($problems | Where-Object { $_ -notmatch 'vector|확장 모듈' })

  foreach ($line in $other) { Write-Warn $line }

  if ($extensionTrouble.Count -gt 0) {
    Write-Warn 'pgvector(vector) 확장을 못 만들었습니다 — 문서·권한·구매 기록은 멀쩡합니다.'
    Write-Host "   M6(문서 질의) 를 쓰려면 수퍼유저로 한 번 켜 주세요:" -ForegroundColor DarkGray
    Write-Host "     psql -U postgres -d $($db.Database) -c `"CREATE EXTENSION vector`"" -ForegroundColor DarkGray
    Write-Host "   pgvector 가 아직 없으면 infra/install-pgvector.ps1 먼저." -ForegroundColor DarkGray
  }

  $count = & $psql -h $db.Host -p $db.Port -U $db.User -d $db.Database -t -A `
    -c 'SELECT count(*) FROM document'
  Write-Ok "되살렸습니다 — 문서 $($count.Trim())개"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

# ── 2. 올린 파일 ─────────────────────────────────────────────────────────────
$uploadZip = Join-Path $From 'uploads.zip'
if (Test-Path $uploadZip) {
  Write-Step '올린 파일'
  $uploads = Get-UploadDir -Env $Env
  New-Item -ItemType Directory -Force -Path $uploads | Out-Null
  Expand-Archive -Path $uploadZip -DestinationPath $uploads -Force
  $n = (Get-ChildItem $uploads -File).Count
  Write-Ok "$uploads — $n개"
}

# ── 3. 비밀값은 사람이 ───────────────────────────────────────────────────────
$secrets = Join-Path $From 'secrets.env'
if (Test-Path $secrets) {
  Write-Step '비밀값'
  Write-Warn "되살리지 않았습니다. 필요하면 직접 옮기세요: $secrets"
  Write-Host '   BETTER_AUTH_SECRET 이 다르면 **아무도 로그인하지 못합니다.**' -ForegroundColor DarkGray
  Write-Host '   베타로 리허설할 때는 그대로 두는 게 맞습니다 (계정이 달라도 복구 자체는 확인됩니다).' -ForegroundColor DarkGray
}

Write-Host ([Environment]::NewLine + "끝났습니다. 'pnpm serve:$Env' 로 열어서 확인하세요.") -ForegroundColor Green
