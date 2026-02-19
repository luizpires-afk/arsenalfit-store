param(
  [string]$Source = "manual",
  [string]$EnvFile = "supabase/functions/.env.scheduler"
)

$scriptPath = Join-Path $PSScriptRoot "catalog-ingest-runner.cjs"
$nodeCmd = $null
$nodeInfo = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInfo) { $nodeCmd = $nodeInfo.Source }
if (-not $nodeCmd) {
  $candidate = Join-Path $env:ProgramFiles "nodejs\\node.exe"
  if (Test-Path $candidate) { $nodeCmd = $candidate }
}

if (-not (Test-Path $scriptPath)) {
  Write-Error "Arquivo nao encontrado: $scriptPath"
  exit 1
}
if (-not $nodeCmd) {
  Write-Error "Node.js nao encontrado. Instale o Node ou adicione ao PATH."
  exit 1
}

& $nodeCmd $scriptPath --env $EnvFile --source $Source
