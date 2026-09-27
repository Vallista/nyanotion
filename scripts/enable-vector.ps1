#Requires -Version 7.0
<#
.SYNOPSIS
  pgvector 를 켠다. 문서 질의(M6)가 **빨라진다** — 없어도 돌지만 느리다.

.DESCRIPTION
  `CREATE EXTENSION vector` 는 **슈퍼유저만** 할 수 있다. 그래서 앱 계정(nyanotion)으로는 안 되고,
  이 스크립트가 `postgres` 비밀번호를 물어본다.

  켜지 않아도 문서 질의는 동작한다 — 임베딩 원본은 `real[]` 로 저장되고 코사인 거리를 SQL 에서
  직접 계산한다 (마이그레이션 0013 의 `nyan_cosine_distance`). 다만 토막이 늘수록 느려진다.
  켜면 같은 값을 `vector(1024)` 칼럼으로 옮기고 HNSW 색인을 붙인다 —
  **다시 임베딩하지 않는다.** GPU 를 한 번도 더 쓰지 않는다.

  pgvector 바이너리 자체가 없으면 `infra/install-pgvector.ps1` 을 먼저 돌려야 한다
  (관리자 권한 · PostgreSQL 재시작).

.PARAMETER Env
  어느 환경에 켤지. 기본은 셋 다.

.EXAMPLE
  pwsh scripts/enable-vector.ps1
  pwsh scripts/enable-vector.ps1 -Env prod
#>
[CmdletBinding()]
param(
  [ValidateSet('dev', 'beta', 'prod', 'all')] [string] $Env = 'all'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$root = Get-RepoRoot
$targets = if ($Env -eq 'all') { @('dev', 'beta', 'prod') } else { @($Env) }

$psql = Get-PgTool -Name 'psql'

# 먼저 확장 파일이 깔려 있는지 본다 — 없으면 비밀번호를 물어볼 이유가 없다.
$probeUrl = Get-NyanotionSetting -Name 'DATABASE_URL' -Env $targets[0]
if ($probeUrl -eq '') { throw "DATABASE_URL 을 찾을 수 없습니다 (환경 $($targets[0]))." }
$probe = Split-DatabaseUrl -Url $probeUrl
$env:PGPASSWORD = $probe.Password
try {
  $available = & $psql -h $probe.Host -p $probe.Port -U $probe.User -d $probe.Database -t -A -w `
    -c "select default_version from pg_available_extensions where name = 'vector'"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
if ([string]::IsNullOrWhiteSpace($available)) {
  Write-Warn 'pgvector 가 이 PostgreSQL 에 깔려 있지 않습니다.'
  Write-Host '  먼저:  powershell -ExecutionPolicy Bypass -File infra\install-pgvector.ps1' -ForegroundColor DarkGray
  return
}
Write-Ok "pgvector $($available.Trim()) 를 쓸 수 있습니다"

$super = Read-Host 'postgres 계정 비밀번호' -AsSecureString
$superPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($super))

foreach ($one in $targets) {
  $url = Get-NyanotionSetting -Name 'DATABASE_URL' -Env $one
  if ($url -eq '') {
    Write-Warn "$one — DATABASE_URL 이 없어 건너뜁니다."
    continue
  }
  $db = Split-DatabaseUrl -Url $url
  Write-Step "$one — $($db.Database)"

  $env:PGPASSWORD = $superPlain
  try {
    & $psql -h $db.Host -p $db.Port -U postgres -d $db.Database -v ON_ERROR_STOP=1 -q -w `
      -c 'CREATE EXTENSION IF NOT EXISTS vector'
    if ($LASTEXITCODE -ne 0) {
      Write-Warn "$one — 확장을 켜지 못했습니다 (비밀번호나 권한을 확인해 주세요)."
      continue
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
  Write-Ok '확장 켜짐'

  # 칼럼·색인·옛 임베딩 옮기기는 코드가 한다 — 마이그레이션과 같은 구현을 쓴다.
  Push-Location $root
  try {
    $env:NYANOTION_ENV = $one
    & pnpm --filter '@nyanotion/db' vector
    if ($LASTEXITCODE -ne 0) { Write-Warn "$one — 벡터 칼럼을 맞추지 못했습니다." }
  } finally {
    Remove-Item Env:NYANOTION_ENV -ErrorAction SilentlyContinue
    Pop-Location
  }
}

$superPlain = $null
Write-Host "`n끝났습니다. 워커를 다시 띄우면 벡터 색인을 씁니다." -ForegroundColor Green
