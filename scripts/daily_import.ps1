param(
  [int]$Supplements = 0,
  [int]$Accessories = 0,
  [int]$Equipment = 0,
  [int]$MenClothing = 0,
  [int]$WomenClothing = 0,
  [switch]$DryRun,
  [string]$Config = "config/daily_catalog_config.json",
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
  "--daily-import",
  "--source", "daily_import",
  "--env", $EnvFile,
  "--config", $Config
)

if ($Supplements -gt 0) { $argsList += @("--supplements", "$Supplements") }
if ($Accessories -gt 0) { $argsList += @("--accessories", "$Accessories") }
if ($Equipment -gt 0) { $argsList += @("--equipment", "$Equipment") }
if ($MenClothing -gt 0) { $argsList += @("--men_clothing", "$MenClothing") }
if ($WomenClothing -gt 0) { $argsList += @("--women_clothing", "$WomenClothing") }
if ($DryRun) { $argsList += "--dry-run" }

& $nodeCmd @argsList
