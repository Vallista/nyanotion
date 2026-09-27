#Requires -Version 7.0
<#
.SYNOPSIS
  서버 하나를 그 환경으로 띄운다. 작업 스케줄러가 부르는 자리.

.DESCRIPTION
  전에는 작업에 `cmd /c set NYANOTION_ENV=prod && pnpm ...` 를 박아 뒀는데,
  cmd 의 `set A=B && C` 는 **B 뒤의 공백까지 값에 넣는다** ("prod " 가 된다).
  그러면 환경을 못 알아보고 dev 로 떨어진다. 그래서 여기 한 겹을 둔다 —
  값을 제대로 넣고, 무엇을 띄웠는지 로그로 남긴다.

.PARAMETER What
  web · collab · agent

.EXAMPLE
  pwsh scripts/serve-one.ps1 -What web -Env prod
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [ValidateSet('web', 'collab', 'agent')] [string] $What,
  [ValidateSet('dev', 'beta', 'prod')] [string] $Env = 'prod'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$root = Get-RepoRoot
Set-Location $root

$env:NYANOTION_ENV = $Env
$env:NEXT_DIST_DIR = ".next-$Env"

# Next 는 설정을 읽기 **전에** 포트를 잡는다 — 파일에서 읽어 넣어 준다.
$port = Get-NyanotionSetting -Name 'PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '3100' } else { '3000' })
$collabPort = Get-NyanotionSetting -Name 'COLLAB_PORT' -Env $Env -Fallback $(if ($Env -eq 'beta') { '1334' } else { '1234' })
$env:PORT = $port
$env:COLLAB_PORT = $collabPort

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Write-Host "[$stamp] $What ($Env) — 웹 $port · 동기화 $collabPort"

$package = switch ($What) {
  'web' { '@nyanotion/web' }
  'collab' { '@nyanotion/collab' }
  'agent' { '@nyanotion/agent' }
}
$script = if ($What -eq 'web' -and $Env -eq 'dev') { 'dev' } elseif ($What -eq 'web') { 'start' } else { 'start' }

& pnpm --filter $package $script
exit $LASTEXITCODE
