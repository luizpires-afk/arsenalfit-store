param(
  [int]$Supplements = 60,
  [int]$Accessories = 25,
  [int]$Equipment = 20,
  [int]$MenClothing = 20,
  [int]$WomenClothing = 20,
  [switch]$DryRun,
  [string]$EnvFile = "supabase/functions/.env.scheduler"
)

$runner = Join-Path $PSScriptRoot "catalog-ingest-runner.cjs"
$nodeCmd = $null
$nodeInfo = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInfo) { $nodeCmd = $nodeInfo.Source }
if (-not $nodeCmd) {
  $candidate = Join-Path $env:ProgramFiles "nodejs\\node.exe"
  if (Test-Path $candidate) { $nodeCmd = $candidate }
}

if (-not (Test-Path $runner)) {
  Write-Error "Arquivo nao encontrado: $runner"
  exit 1
}
if (-not $nodeCmd) {
  Write-Error "Node.js nao encontrado. Instale o Node ou adicione ao PATH."
  exit 1
}

$argsList = @(
  $runner,
  "--env", $EnvFile,
  "--source", "bulk_import",
  "--bulk-import",
  "--supplements", "$Supplements",
  "--accessories", "$Accessories",
  "--equipment", "$Equipment",
  "--men_clothing", "$MenClothing",
  "--women_clothing", "$WomenClothing"
)

if ($DryRun) {
  $argsList += "--dry-run"
}

& $nodeCmd @argsList
