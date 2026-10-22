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
for ($monitorAttempt=0; $monitorAttempt -le 3; $monitorAttempt++) {
    # Start-Process -Wait waits for the whole descendant tree on Windows,
    # including the Codex desktop launched during a switch. Watch only Node.
    $monitorProcess=Start-Process -FilePath $monitorNode -ArgumentList @('"'+(Join-Path $monitorRoot 'app.mjs')+'"') -WorkingDirectory $monitorRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $monitorData 'startup.log') -RedirectStandardError (Join-Path $monitorData 'startup-error.log') -PassThru
    $monitorProcess.WaitForExit()
    $monitorProcess.Refresh()
    $monitorExit=$monitorProcess.ExitCode
    [IO.File]::WriteAllText((Join-Path $monitorData 'host-status.json'),(@{lastExitCode=$monitorExit;retry=$monitorAttempt;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    if ($monitorExit -eq 0) { exit 0 }
    if ($monitorAttempt -lt 3) { Start-Sleep -Seconds 3 }
}
exit $monitorExit
