# pgvector 설치 — PostgreSQL 17 (Windows). **관리자 PowerShell 에서 실행한다.**
#
# M6(문서에 질문하기)의 벡터 검색에 필요하다. 이 PostgreSQL 에는 pg_trgm 은 있지만 vector 가 없다.
# Program Files 에 파일을 넣고 서비스를 재시작하므로 관리자 권한이 필요하다.

$ErrorActionPreference = "Stop"

$pgRoot  = "C:\Program Files\PostgreSQL\17"
$service = "postgresql-x64-17"
$url     = "https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.6_17/vector.v0.8.6-pg17.zip"
$work    = Join-Path $env:TEMP "pgvector-install"

if (-not (Test-Path $pgRoot)) { throw "PostgreSQL 17 을 $pgRoot 에서 못 찾았습니다." }

Write-Host "1/5 내려받는 중..."
New-Item -ItemType Directory -Force -Path $work | Out-Null
$zip = Join-Path $work "vector.zip"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Write-Host "2/5 푸는 중..."
$extract = Join-Path $work "extract"
if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $extract -Force

Write-Host "3/5 PostgreSQL 잠시 멈춤..."
Stop-Service $service
Start-Sleep -Seconds 2

Write-Host "4/5 파일 복사..."
Copy-Item "$extract\lib\*"     "$pgRoot\lib\"     -Recurse -Force
Copy-Item "$extract\share\*"   "$pgRoot\share\"   -Recurse -Force
Copy-Item "$extract\include\*" "$pgRoot\include\" -Recurse -Force

Write-Host "5/5 PostgreSQL 다시 시작..."
Start-Service $service
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "끝났습니다. 이제 일반 터미널에서 확인하세요:"
Write-Host '  psql -U nyanotion -h 127.0.0.1 -d nyanotion -c "CREATE EXTENSION IF NOT EXISTS vector;"'
