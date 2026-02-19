param(
  [switch]$Apply,
  [switch]$DryRun,
  [int]$MaxFailuresBeforeApiMissing = 3,
  [string]$EnvFile = "supabase/functions/.env.scheduler"
)

$runner = Join-Path $PSScriptRoot "catalog-cleanup-unblock-runner.cjs"
$nodeCmd = $null
$nodeInfo = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInfo) { $nodeCmd = $nodeInfo.Source }
if (-not $nodeCmd) {
  $candidate = Join-Path $env:ProgramFiles "nodejs\node.exe"
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
  "--max-failures-before-api-missing", "$MaxFailuresBeforeApiMissing"
)

if ($Apply) {
  $argsList += "--apply"
} elseif ($DryRun) {
  $argsList += "--dry-run"
} else {
  $argsList += "--dry-run"
}

& $nodeCmd @argsList
