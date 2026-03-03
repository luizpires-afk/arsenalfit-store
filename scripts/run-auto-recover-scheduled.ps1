$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$logDir = Join-Path $projectRoot "logs"
if (!(Test-Path $logDir)) {
	New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = Join-Path $logDir "auto-recover-scheduled.log"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Starting auto_recover_mercado_products" | Tee-Object -FilePath $logFile -Append

npm run auto_recover_mercado_products 2>&1 | Tee-Object -FilePath $logFile -Append

$exitCode = $LASTEXITCODE
$endTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$endTimestamp] Finished with exit code: $exitCode" | Tee-Object -FilePath $logFile -Append

exit $exitCode
