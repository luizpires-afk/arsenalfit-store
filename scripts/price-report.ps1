param(
  [string]$EnvFile = "supabase/functions/.env.scheduler",
  [int]$SinceHours = 24,
  [string]$Mode = "generate_daily",
  [string]$Date = ""
)

$scriptPath = Join-Path $PSScriptRoot "price-report-runner.cjs"
$nodeCmd = $null
$nodeInfo = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInfo) { $nodeCmd = $nodeInfo.Source }
if (-not $nodeCmd) {
  $candidate = Join-Path $env:ProgramFiles "nodejs\\node.exe"
  if (Test-Path $candidate) { $nodeCmd = $candidate }
}

if (-not (Test-Path $scriptPath)) {
  Write-Error "Arquivo não encontrado: $scriptPath"
  exit 1
}
if (-not $nodeCmd) {
  Write-Error "Node.js não encontrado. Instale o Node ou adicione ao PATH."
  exit 1
}

if ($Date) {
  & $nodeCmd $scriptPath --env $EnvFile --since-hours $SinceHours --mode $Mode --date $Date
}
else {
  & $nodeCmd $scriptPath --env $EnvFile --since-hours $SinceHours --mode $Mode
}
