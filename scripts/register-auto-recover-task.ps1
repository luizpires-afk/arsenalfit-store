param(
  [string]$TaskName = "ArsenalFit-AutoRecover-Mercado",
  [int]$EveryMinutes = 15,
  [switch]$RunAtLogon
)

$ErrorActionPreference = 'Stop'

if ($EveryMinutes -lt 1) {
  throw "EveryMinutes must be >= 1"
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $projectRoot "scripts\run-auto-recover-scheduled-hidden.vbs"

if (!(Test-Path $vbsPath)) {
  throw "Launcher not found: $vbsPath"
}

$escapedVbs = '"' + $vbsPath + '"'
$taskCommand = "wscript.exe //nologo $escapedVbs"

if ($RunAtLogon) {
  schtasks /Create /TN $TaskName /TR $taskCommand /SC ONLOGON /F | Out-Null
  Write-Host "Task '$TaskName' created: ONLOGON"
} else {
  schtasks /Create /TN $TaskName /TR $taskCommand /SC MINUTE /MO $EveryMinutes /F | Out-Null
  Write-Host "Task '$TaskName' created: every $EveryMinutes minute(s)"
}

Write-Host "Action: $taskCommand"
Write-Host "To run now: schtasks /Run /TN $TaskName"
Write-Host "To delete: schtasks /Delete /TN $TaskName /F"
