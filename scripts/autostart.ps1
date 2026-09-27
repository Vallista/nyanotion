#Requires -Version 7.0
<#
.SYNOPSIS
  재부팅해도 손 안 대고 다시 서도록 Windows 작업으로 등록한다.

.DESCRIPTION
  지금은 사람이 터미널에서 띄우고 있어서, **PC 를 껐다 켜면 가족이 들어오지 못한다.**
  아래를 로그온 시 자동 시작으로 걸어 둔다:

    Nyanotion-Collab      Yjs 동기화 (먼저 떠야 한다 — 웹이 붙을 곳)
    Nyanotion-Web         Next 운영 서버
    Nyanotion-Tunnel      Cloudflare Tunnel (밖에서 들어오는 길)
    Nyanotion-Agent       구매 에이전트 (선택 — `-NoAgent` 로 뺄 수 있다)
    Nyanotion-Worker      색인 워커 (문서 질의의 재료를 만든다)

  그리고 매일 한 번 백업:
    Nyanotion-Backup      새벽 4시

  **서비스가 아니라 "로그온 시 작업"이다.** 이유가 둘이다:
    - 구매 에이전트는 사람 브라우저 프로필을 쓴다. 서비스 계정에서는 그 로그인이 없다
    - 문제가 생겼을 때 사람이 창을 열어 볼 수 있어야 한다

  그래서 **자동 로그온이 켜져 있어야** 재부팅 뒤에 저절로 선다. 안 켜 두면 로그인한 뒤에 뜬다.

.PARAMETER Remove
  등록한 작업을 전부 지운다.

.EXAMPLE
  pwsh scripts/autostart.ps1
  pwsh scripts/autostart.ps1 -NoAgent
  pwsh scripts/autostart.ps1 -Remove
#>
[CmdletBinding()]
param(
  [switch] $Remove,
  [switch] $NoAgent,
  [string] $BackupAt = '04:00'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$root = Get-RepoRoot
$prefix = 'Nyanotion-'

function Remove-Ours {
  Get-ScheduledTask -TaskPath '\' -ErrorAction SilentlyContinue |
    Where-Object { $_.TaskName -like "$prefix*" } |
    ForEach-Object {
      Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false
      Write-Ok "지움: $($_.TaskName)"
    }
}

if ($Remove) {
  Write-Step '자동 시작 해제'
  Remove-Ours
  Write-Host "`n끝났습니다. 다음 재부팅부터는 스스로 뜨지 않습니다." -ForegroundColor Green
  return
}

# ── 준비 확인 ────────────────────────────────────────────────────────────────
Write-Step '준비 확인'

$pnpm = (Get-Command pnpm -ErrorAction SilentlyContinue)?.Source
if ($null -eq $pnpm) { throw 'pnpm 을 찾을 수 없습니다. corepack enable 을 먼저 하세요.' }
Write-Ok "pnpm $pnpm"

$distDir = Join-Path $root 'apps\web\.next-prod'
if (-not (Test-Path $distDir)) {
  Write-Warn '운영 빌드가 없습니다 — 먼저 만듭니다.'
  Push-Location $root
  try {
    $env:NYANOTION_ENV = 'prod'
    $env:NEXT_DIST_DIR = '.next-prod'
    & pnpm --filter @nyanotion/web build
    if ($LASTEXITCODE -ne 0) { throw '빌드가 실패했습니다.' }
  } finally {
    Remove-Item Env:NYANOTION_ENV, Env:NEXT_DIST_DIR -ErrorAction SilentlyContinue
    Pop-Location
  }
}
Write-Ok '운영 빌드 있음'

$cloudflared = @(
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  'C:\Program Files\cloudflared\cloudflared.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($null -eq $cloudflared) {
  $found = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($null -ne $found) { $cloudflared = $found.Source }
}
$tunnelConfig = Join-Path $root 'infra\cloudflared\config.yml'
$canTunnel = ($null -ne $cloudflared) -and (Test-Path $tunnelConfig)
if ($canTunnel) { Write-Ok "cloudflared $cloudflared" }
else { Write-Warn 'cloudflared 나 infra/cloudflared/config.yml 이 없어 터널은 건너뜁니다.' }

# ── 등록 ─────────────────────────────────────────────────────────────────────
Write-Step '작업 등록'
Remove-Ours

$user = "$env:USERDOMAIN\$env:USERNAME"

<#
  로그온 시 도는 작업 하나. 창을 숨기지 않는다 — 뭔가 이상할 때 사람이 볼 수 있어야 한다.
  `-Delay` 는 앞선 것이 먼저 서도록 시간을 벌기 위한 것.
#>
function Register-Ours {
  param(
    [Parameter(Mandatory)] [string] $Name,
    [Parameter(Mandatory)] [string] $Exe,
    [Parameter(Mandatory)] [string] $Arguments,
    [string] $WorkingDir = $root,
    [string] $Delay = 'PT0S'
  )

  $action = New-ScheduledTaskAction -Execute $Exe -Argument $Arguments -WorkingDirectory $WorkingDir
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $trigger.Delay = $Delay
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3

  Register-ScheduledTask -TaskName "$prefix$Name" -Action $action -Trigger $trigger `
    -Settings $settings -RunLevel Limited -Force | Out-Null
  Write-Ok "$prefix$Name"
}

# 환경 변수는 **런처가 넣는다.** cmd 의 `set A=B && C` 는 값 뒤 공백까지 넣어 버려서
# NYANOTION_ENV 가 "prod " 가 되고, 그러면 환경을 못 알아보고 dev 로 떨어진다.
$launcher = Join-Path $root 'scripts\serve-one.ps1'

Register-Ours -Name 'Collab' -Exe 'pwsh.exe' `
  -Arguments "-NoProfile -File `"$launcher`" -What collab -Env prod"

Register-Ours -Name 'Web' -Exe 'pwsh.exe' -Delay 'PT10S' `
  -Arguments "-NoProfile -File `"$launcher`" -What web -Env prod"

if ($canTunnel) {
  Register-Ours -Name 'Tunnel' -Exe $cloudflared -Delay 'PT20S' `
    -Arguments "--config `"$tunnelConfig`" tunnel run"
}

# 색인 워커. 웹보다 늦게 띄운다 — 급하지 않고, GPU 도 웹이 먼저 쓰게 한다.
Register-Ours -Name 'Worker' -Exe 'pwsh.exe' -Delay 'PT40S' `
  -Arguments "-NoProfile -File `"$launcher`" -What worker -Env prod"

if (-not $NoAgent) {
  Register-Ours -Name 'Agent' -Exe 'pwsh.exe' -Delay 'PT30S' `
    -Arguments "-NoProfile -File `"$launcher`" -What agent -Env prod"
}

# ── 매일 백업 ────────────────────────────────────────────────────────────────
$backupAction = New-ScheduledTaskAction -Execute 'pwsh.exe' `
  -Argument "-NoProfile -File `"$root\scripts\backup.ps1`" -Env prod" -WorkingDirectory $root
$backupTrigger = New-ScheduledTaskTrigger -Daily -At $BackupAt
$backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName "${prefix}Backup" -Action $backupAction -Trigger $backupTrigger `
  -Settings $backupSettings -RunLevel Limited -Force | Out-Null
Write-Ok "${prefix}Backup ($BackupAt 매일)"

Write-Host @"

끝났습니다.

  지금 바로 돌려 보기   Start-ScheduledTask -TaskName Nyanotion-Collab
  상태 보기             Get-ScheduledTask -TaskName Nyanotion-*
  해제                  pwsh scripts/autostart.ps1 -Remove

**자동 로그온이 꺼져 있으면** 재부팅 뒤 로그인할 때까지 뜨지 않습니다.
가족이 밖에서 늘 들어와야 한다면 자동 로그온을 켜 두세요 (netplwiz).
"@ -ForegroundColor Green
