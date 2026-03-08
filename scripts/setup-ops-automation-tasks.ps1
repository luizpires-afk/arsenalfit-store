[CmdletBinding()]
param(
  [string]$RepoPath = "",
  [switch]$SkipSmokeTest
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
  $RepoPath = Split-Path -Parent $PSScriptRoot
}

$RepoPath = [System.IO.Path]::GetFullPath($RepoPath)

if (-not (Test-Path $RepoPath)) {
  throw "RepoPath nao encontrado: $RepoPath"
}

if (-not (Test-Path (Join-Path $RepoPath "package.json"))) {
  throw "package.json nao encontrado em: $RepoPath"
}

Write-Host "[ops-setup] Repo: $RepoPath"

if (-not (Get-Command schtasks.exe -ErrorAction SilentlyContinue)) {
  throw "schtasks.exe nao encontrado. Execute em ambiente Windows com Agendador de Tarefas disponivel."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm nao encontrado no PATH. Instale Node.js/NPM antes de registrar as tarefas."
}

function New-TaskRunCommand {
  param(
    [string]$NpmScript
  )

  return ('cmd /c cd /d "{0}" && npm run {1}' -f $RepoPath, $NpmScript)
}

$tasks = @(
  @{
    Name = "ArsenalFit Ops Daily"
    Schedule = @("/SC", "DAILY", "/ST", "06:30")
    Run = New-TaskRunCommand -NpmScript "ops_production_daily"
  },
  @{
    Name = "ArsenalFit Ops Weekly"
    Schedule = @("/SC", "WEEKLY", "/D", "SUN", "/ST", "07:00")
    Run = New-TaskRunCommand -NpmScript "ops_production_weekly"
  },
  @{
    Name = "ArsenalFit SEO Health"
    Schedule = @("/SC", "DAILY", "/ST", "08:00")
    Run = New-TaskRunCommand -NpmScript "seo_health_report"
  },
  @{
    Name = "ArsenalFit Reliability 2h"
    Schedule = @("/SC", "HOURLY", "/MO", "2")
    Run = New-TaskRunCommand -NpmScript "affiliate_reliability_monitor"
  },
  @{
    Name = "ArsenalFit Discovery Daily"
    Schedule = @("/SC", "DAILY", "/ST", "09:30")
    Run = New-TaskRunCommand -NpmScript "discovery_intelligence_run"
  }
)

function New-OrUpdateTask {
  param(
    [hashtable]$Task
  )

  $args = @(
    "/Create"
    "/TN", $Task.Name
    "/TR", $Task.Run
    "/F"
  ) + $Task.Schedule

  Write-Host "[ops-setup] Registrando tarefa: $($Task.Name)"
  $output = & schtasks @args 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao registrar tarefa '$($Task.Name)': $($output -join ' ')"
  }
}

function Show-TaskSummary {
  param(
    [string]$TaskName
  )

  Write-Host "`n[ops-setup] Resumo tarefa: $TaskName"
  & schtasks /Query /TN $TaskName /V /FO LIST
}

foreach ($task in $tasks) {
  New-OrUpdateTask -Task $task
}

if (-not $SkipSmokeTest) {
  Write-Host "`n[ops-setup] Iniciando smoke test de tarefas principais..."
  & schtasks /Run /TN "ArsenalFit Ops Daily" | Out-Null
  & schtasks /Run /TN "ArsenalFit SEO Health" | Out-Null
}

Write-Host "`n[ops-setup] Checklist rapido"
Write-Host "1) Tarefas registradas com sucesso"
Write-Host "2) Logs esperados em: $RepoPath\logs"
Write-Host "3) Painel admin para revisar: /admin/operational-reliability e /admin/pipeline-health"
Write-Host "4) Guia no site: /como-lancar-produtos"

foreach ($task in $tasks) {
  Show-TaskSummary -TaskName $task.Name
}

Write-Host "`n[ops-setup] Concluido."
