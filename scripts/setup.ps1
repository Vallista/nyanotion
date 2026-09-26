#Requires -Version 7.0
<#
.SYNOPSIS
  Nyanotion 을 이 컴퓨터에서 돌릴 수 있게 한 번에 맞춘다.

.DESCRIPTION
  없는 것만 만들고, 이미 있는 것은 건드리지 않는다 (몇 번 돌려도 같은 결과).

    1. 있어야 할 것 확인  — Node 20+, pnpm, PostgreSQL 서비스
    2. pnpm install
    3. DB 역할과 데이터베이스 만들기 (nyanotion_dev · nyanotion_beta · nyanotion)
    4. 확장 켜기 (pg_trgm, vector)
    5. .env / .env.beta / .env.prod 를 본보기에서 만들고 **비밀값을 새로 만들어** 채운다
    6. 마이그레이션 적용
    7. 첫 문서 씨앗 (문서가 하나도 없을 때만)

  **비밀값은 화면에 찍지 않는다.** 만들어진 .env 는 git 이 무시한다.

.PARAMETER PostgresPassword
  postgres 수퍼유저 비밀번호. 역할·DB·확장을 만들 때만 쓰고 저장하지 않는다.
  주지 않으면 환경 변수 PGPASSWORD 를 본다.

.PARAMETER Env
  마이그레이션·씨앗을 적용할 환경. 기본 dev.

.PARAMETER SecretsDir
  비밀값을 둘 폴더 (저장소 밖 권장). 주면 .env 대신 여기에 <환경>.env 를 쓴다.

.EXAMPLE
  pwsh scripts/setup.ps1 -PostgresPassword '수퍼유저비번'
  pwsh scripts/setup.ps1 -Env beta -SecretsDir C:\nyanotion\secrets
#>
[CmdletBinding()]
param(
  [string] $PostgresPassword = $env:PGPASSWORD,
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'dev',
  [string] $SecretsDir = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Step($text) { Write-Host "`n── $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "   ok   $text" -ForegroundColor DarkGray }
function Warn($text) { Write-Host "   !!   $text" -ForegroundColor Yellow }

# ── 1. 있어야 할 것 ──────────────────────────────────────────────────────────
Step '있어야 할 것 확인'

$node = (Get-Command node -ErrorAction SilentlyContinue)
if ($null -eq $node) { throw 'Node 를 찾을 수 없습니다. https://nodejs.org 에서 20 이상을 설치하세요.' }
$nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { throw "Node 20 이상이 필요합니다 (지금 $nodeMajor)." }
Ok "Node $(& node -v)"

if ($null -eq (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Warn 'pnpm 이 없습니다 — corepack 으로 켭니다.'
  & corepack enable
  & corepack prepare pnpm@9.7.0 --activate
}
Ok "pnpm $(& pnpm -v)"

$psql = (Get-Command psql -ErrorAction SilentlyContinue)
if ($null -eq $psql) {
  # 기본 설치 경로도 찾아본다 — PATH 에 안 들어가 있는 경우가 흔하다.
  $guess = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if ($null -eq $guess) { throw 'psql 을 찾을 수 없습니다. PostgreSQL 17 을 설치하고 PATH 에 bin 을 넣으세요.' }
  $psqlPath = $guess.FullName
} else {
  $psqlPath = $psql.Source
}
Ok "psql $psqlPath"

$service = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $service) {
  Warn 'PostgreSQL 서비스를 찾지 못했습니다 — 이미 다른 방식으로 돌고 있다면 넘어가도 됩니다.'
} elseif ($service.Status -ne 'Running') {
  Warn "$($service.Name) 이 멈춰 있습니다 — 시작합니다."
  Start-Service $service.Name
  $service.WaitForStatus('Running', '00:00:45')
  Ok "$($service.Name) 시작됨"
} else {
  Ok "$($service.Name) 돌고 있음"
}

if ([string]::IsNullOrEmpty($PostgresPassword)) {
  throw @'
postgres 수퍼유저 비밀번호가 필요합니다. 역할과 DB 를 만들 때만 씁니다.
  pwsh scripts/setup.ps1 -PostgresPassword '비밀번호'
또는 $env:PGPASSWORD 에 넣고 다시 실행하세요.
'@
}

# ── 2. 의존성 ────────────────────────────────────────────────────────────────
Step '의존성 설치'
Push-Location $root
try { & pnpm install | Out-Null } finally { Pop-Location }
Ok 'pnpm install'

# ── 3. 역할과 데이터베이스 ───────────────────────────────────────────────────
Step '데이터베이스'

function Psql([string] $database, [string] $sql) {
  $env:PGPASSWORD = $PostgresPassword
  $out = & $psqlPath -U postgres -h 127.0.0.1 -d $database -v ON_ERROR_STOP=1 -t -A -c $sql 2>&1
  $code = $LASTEXITCODE
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  if ($code -ne 0) { throw "psql 실패: $sql`n$out" }
  return ($out | Out-String).Trim()
}

# 앱이 쓸 역할. 이미 있으면 비밀번호를 건드리지 않는다 —
# 돌고 있는 서버의 접속 정보를 말없이 바꿔 버리면 안 된다.
$roleExists = (Psql 'postgres' "SELECT 1 FROM pg_roles WHERE rolname = 'nyanotion'") -eq '1'
if ($roleExists) {
  Ok "역할 nyanotion (이미 있음 — 비밀번호 그대로)"
  $dbPassword = $null
} else {
  $bytes = [byte[]]::new(24)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $dbPassword = [Convert]::ToBase64String($bytes).Replace('+', '').Replace('/', '').Replace('=', '')
  $escaped = $dbPassword.Replace("'", "''")
  Psql 'postgres' "CREATE ROLE nyanotion LOGIN PASSWORD '$escaped' CREATEDB" | Out-Null
  Ok '역할 nyanotion 만듦 (비밀번호는 .env 에만 적습니다)'
}

foreach ($name in @('nyanotion_dev', 'nyanotion_beta', 'nyanotion')) {
  $exists = (Psql 'postgres' "SELECT 1 FROM pg_database WHERE datname = '$name'") -eq '1'
  if ($exists) {
    Ok "$name (이미 있음)"
  } else {
    Psql 'postgres' "CREATE DATABASE `"$name`" OWNER nyanotion" | Out-Null
    Ok "$name 만듦"
  }
  # 확장은 수퍼유저만 켤 수 있다 (vector 는 trusted 가 아니다).
  Psql $name 'CREATE EXTENSION IF NOT EXISTS pg_trgm' | Out-Null
  try {
    Psql $name 'CREATE EXTENSION IF NOT EXISTS vector' | Out-Null
  } catch {
    Warn "$name : pgvector 가 없습니다 — infra/install-pgvector.ps1 을 먼저 돌리세요 (M6 에서 필요)."
  }
}

# ── 4. 설정 파일 ─────────────────────────────────────────────────────────────
Step '설정 파일'

function NewSecret {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  return [Convert]::ToBase64String($bytes)
}

function WriteEnvFile([string] $path, [string] $template, [hashtable] $values) {
  if (Test-Path $path) { Ok "$(Split-Path -Leaf $path) (이미 있음 — 건드리지 않음)"; return }
  if (-not (Test-Path $template)) { throw "본보기가 없습니다: $template" }
  $text = Get-Content $template -Raw
  foreach ($key in $values.Keys) {
    # `KEY=...` 한 줄을 통째로 바꾼다.
    $text = [regex]::Replace($text, "(?m)^$([regex]::Escape($key))=.*$", "$key=$($values[$key])")
  }
  Set-Content -Path $path -Value $text -Encoding UTF8 -NoNewline
  Ok "$(Split-Path -Leaf $path) 만듦"
}

$dbPasswordForUrl = if ($null -ne $dbPassword) { $dbPassword } else { 'change_me' }
if ($null -eq $dbPassword) {
  Warn '역할이 이미 있어 비밀번호를 모릅니다 — .env 의 DATABASE_URL 을 손으로 채우세요.'
}

$targets = @(
  @{ File = '.env';      Template = '.env.example';      Db = 'nyanotion_dev' }
  @{ File = '.env.beta'; Template = '.env.beta.example'; Db = 'nyanotion_beta' }
  @{ File = '.env.prod'; Template = '.env.prod.example'; Db = 'nyanotion' }
)

foreach ($t in $targets) {
  $values = @{
    DATABASE_URL         = "postgres://nyanotion:$dbPasswordForUrl@localhost:5432/$($t.Db)"
    BETTER_AUTH_SECRET   = (NewSecret)
  }
  # 비밀값 폴더를 쓰면 DB·비밀키는 거기로, 저장소에는 나머지만.
  if ($SecretsDir -ne '') {
    New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null
    $envName = switch ($t.File) { '.env' { 'dev' } '.env.beta' { 'beta' } default { 'prod' } }
    $secretFile = Join-Path $SecretsDir "$envName.env"
    if (-not (Test-Path $secretFile)) {
      Set-Content -Path $secretFile -Encoding UTF8 -Value @"
# Nyanotion $envName 비밀값 — 저장소 밖. 백업할 때 같이 챙기세요.
DATABASE_URL=$($values.DATABASE_URL)
BETTER_AUTH_SECRET=$($values.BETTER_AUTH_SECRET)
"@
      Ok "$secretFile 만듦"
    } else {
      Ok "$secretFile (이미 있음)"
    }
    $values.DATABASE_URL = ''
    $values.BETTER_AUTH_SECRET = ''
    $values.NYANOTION_SECRETS_DIR = $SecretsDir
  }
  WriteEnvFile (Join-Path $root $t.File) (Join-Path $root $t.Template) $values
}

# ── 5. 마이그레이션 · 씨앗 ───────────────────────────────────────────────────
Step "마이그레이션 ($Env)"
Push-Location $root
try {
  $env:NYANOTION_ENV = $Env
  & pnpm --filter @nyanotion/db migrate
  if ($LASTEXITCODE -ne 0) { throw '마이그레이션이 실패했습니다.' }
  Ok '적용됨'

  Step "첫 문서 ($Env)"
  & pnpm --filter @nyanotion/db seed
} finally {
  Remove-Item Env:NYANOTION_ENV -ErrorAction SilentlyContinue
  Pop-Location
}

Write-Host @"

끝났습니다.

  로컬 개발   pnpm dev            (NYANOTION_ENV=dev, http://localhost:3000)
  베타        pnpm serve:beta     (http://localhost:3100)
  운영        pnpm serve:prod     (http://localhost:3000)

첫 계정은 로그인 화면에서 그냥 만들면 됩니다 — **맨 처음 한 명만** 초대 없이 됩니다.
자세한 건 docs/07-environments.md.
"@ -ForegroundColor Green
