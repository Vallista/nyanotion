# pgvector 설치 — PostgreSQL 17 (Windows).
#
# M6(문서에 질문하기)의 벡터 검색에 필요하다. 이 PostgreSQL 에는 pg_trgm 은 있지만 vector 가 없다.
# Program Files 에 파일을 넣고 서비스를 재시작하므로 **관리자 권한이 필요하다** —
# 권한이 없으면 아래에서 스스로 관리자 창을 띄운다.
#
#   powershell -ExecutionPolicy Bypass -File infra\install-pgvector.ps1

$ErrorActionPreference = "Stop"

# 콘솔이 한글을 깨뜨리지 않게. (PowerShell 기본 인코딩이 cp949 라 UTF-8 출력이 깨진다)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# --- 관리자 확인. 아니면 관리자 창으로 자기 자신을 다시 띄운다 ---------------
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "관리자 권한이 필요합니다. 관리자 창을 띄웁니다 (UAC 확인이 뜹니다)..."
  $self = $MyInvocation.MyCommand.Path
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", $self) `
    -Verb RunAs
  return
}

$pgRoot  = "C:\Program Files\PostgreSQL\17"
$service = "postgresql-x64-17"
$url     = "https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.6_17/vector.v0.8.6-pg17.zip"
$work    = Join-Path $env:TEMP "pgvector-install"

if (-not (Test-Path $pgRoot)) { throw "PostgreSQL 17 을 $pgRoot 에서 못 찾았습니다." }
if (-not (Get-Service $service -ErrorAction SilentlyContinue)) {
  throw "$service 서비스를 못 찾았습니다."
}

Write-Host "1/6  내려받는 중..."
New-Item -ItemType Directory -Force -Path $work | Out-Null
$zip = Join-Path $work "vector.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Write-Host "2/6  푸는 중..."
$extract = Join-Path $work "extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force

Write-Host "3/6  PostgreSQL 잠시 멈춤 (game DB 도 함께 끊깁니다)..."
Stop-Service $service -Force
(Get-Service $service).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))

Write-Host "4/6  파일 복사..."
Copy-Item "$extract\lib\*"     "$pgRoot\lib\"     -Recurse -Force
Copy-Item "$extract\share\*"   "$pgRoot\share\"   -Recurse -Force
Copy-Item "$extract\include\*" "$pgRoot\include\" -Recurse -Force

Write-Host "5/6  PostgreSQL 다시 시작..."
Start-Service $service
(Get-Service $service).WaitForStatus("Running", [TimeSpan]::FromSeconds(60))

Write-Host "6/6  확장 켜는 중..."
# pgvector 는 trusted 확장이 아니라 **슈퍼유저만** CREATE EXTENSION 할 수 있다.
# 그래서 앱 계정(nyanotion)이 아니라 postgres 로 켠다. 한 번만 하면 되고, 이후엔 앱 계정이 그냥 쓴다.
$psql = Join-Path $pgRoot "bin\psql.exe"
$superPw = Read-Host "postgres 계정 비밀번호" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($superPw))
& $psql -U postgres -h 127.0.0.1 -d nyanotion -c "CREATE EXTENSION IF NOT EXISTS vector;"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

$env:PGPASSWORD = $env:PGPASSWORD   # 미리 넣어 두세요 — 저장소에 비밀번호를 적지 않습니다
& $psql -U nyanotion -h 127.0.0.1 -d nyanotion `
  -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "끝났습니다. 위에 vector 와 판 번호가 보이면 성공입니다."
