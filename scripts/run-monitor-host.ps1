param([Parameter(Mandatory=$true)][string]$DataPath,[int]$Port=55163)
$ErrorActionPreference = 'Stop'
$monitorRoot = Split-Path $PSScriptRoot -Parent
$monitorData = [IO.Path]::GetFullPath($DataPath)
$env:ACCOUNT_MONITOR_DATA = $monitorData
$env:ACCOUNT_MONITOR_PORT = [string]$Port
$monitorNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $monitorNode)) { $monitorNode = (Get-Command node -ErrorAction Stop).Source }
New-Item -ItemType Directory -Path $monitorData -Force | Out-Null
Set-Location -LiteralPath $monitorRoot
& $monitorNode (Join-Path $monitorRoot 'app.mjs') 1> (Join-Path $monitorData 'startup.log') 2> (Join-Path $monitorData 'startup-error.log')
exit $LASTEXITCODE
