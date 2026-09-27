#Requires -Version 7.0
<#
  여러 스크립트가 같이 쓰는 조각. 점으로 불러 쓴다:  . "$PSScriptRoot\_env.ps1"

  설정을 읽는 차례는 packages/db/src/env.ts 와 **같아야 한다** —
  셸 → $NYANOTION_SECRETS_DIR/<환경>.env → .env.<환경> → .env
  여기서 순서가 어긋나면 스크립트와 앱이 서로 다른 DB 를 보게 된다.
#>

function Get-RepoRoot {
  return (Split-Path -Parent $PSScriptRoot)
}

<#
  .SYNOPSIS  그 환경의 설정 값 하나를 읽는다. 먼저 잡힌 값이 이긴다.
#>
function Get-NyanotionSetting {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [ValidateSet('dev', 'beta', 'prod')] [string] $Env,
    [string] $Fallback = ''
  )

  $root = Get-RepoRoot
  $files = @()

  $secrets = [Environment]::GetEnvironmentVariable('NYANOTION_SECRETS_DIR')
  if (-not [string]::IsNullOrWhiteSpace($secrets)) {
    $files += (Join-Path $secrets "$Env.env")
  }
  $files += (Join-Path $root ".env.$Env")
  $files += (Join-Path $root '.env')

  foreach ($file in $files) {
    if (-not (Test-Path $file)) { continue }
    foreach ($line in Get-Content $file) {
      if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*?)\s*$") {
        $value = $Matches[1].Trim('"').Trim("'")
        if ($value -ne '') { return $value }
      }
    }
  }
  return $Fallback
}

<#
  .SYNOPSIS  postgres://user:pass@host:port/db 를 쪼갠다.
  .NOTES     비밀번호에 @ 나 : 가 들어 있어도 되도록 URI 파서를 쓴다.
#>
function Split-DatabaseUrl {
  param([Parameter(Mandatory)] [string] $Url)

  $uri = [Uri] $Url
  $parts = $uri.UserInfo -split ':', 2
  return [pscustomobject]@{
    User     = [Uri]::UnescapeDataString($parts[0])
    Password = if ($parts.Count -gt 1) { [Uri]::UnescapeDataString($parts[1]) } else { '' }
    Host     = $uri.Host
    Port     = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    Database = $uri.AbsolutePath.TrimStart('/')
  }
}

<#
  .SYNOPSIS  PostgreSQL 도구 하나의 전체 경로. PATH 에 없으면 기본 설치 경로도 본다.
#>
function Get-PgTool {
  param([Parameter(Mandatory)] [string] $Name)

  $found = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -ne $found) { return $found.Source }

  $guess = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$Name.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if ($null -eq $guess) { throw "$Name 을 찾을 수 없습니다. PostgreSQL 을 설치하고 bin 을 PATH 에 넣으세요." }
  return $guess.FullName
}

<# 올린 파일이 있는 곳. 비어 있으면 앱의 기본값과 같은 자리. #>
function Get-UploadDir {
  param([Parameter(Mandatory)] [ValidateSet('dev', 'beta', 'prod')] [string] $Env)

  $configured = Get-NyanotionSetting -Name 'UPLOAD_DIR' -Env $Env
  if ($configured -ne '') { return $configured }
  return (Join-Path (Get-RepoRoot) 'apps\web\.data\uploads')
}

function Write-Step($text) { Write-Host "`n── $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "   ok   $text" -ForegroundColor DarkGray }
function Write-Warn($text) { Write-Host "   !!   $text" -ForegroundColor Yellow }
