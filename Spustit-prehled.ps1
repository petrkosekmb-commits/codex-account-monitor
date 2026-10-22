param([switch]$BezOtevreni)
$ErrorActionPreference = 'Stop'
$dataPath = if ($env:ACCOUNT_MONITOR_DATA) { [IO.Path]::GetFullPath($env:ACCOUNT_MONITOR_DATA) } else { Join-Path $env:LOCALAPPDATA 'CodexAccountMonitor' }
if ($dataPath -match '["\r\n]') { throw 'Invalid data directory.' }
$monitorPort = if ($env:ACCOUNT_MONITOR_PORT) { [int]$env:ACCOUNT_MONITOR_PORT } else { 55163 }
if ($monitorPort -lt 1024 -or $monitorPort -gt 65535) { throw 'Invalid port.' }
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'accounts.json'))) { throw 'Create local accounts.json first; see README.' }
$runtimePath = Join-Path $dataPath 'runtime.json'
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$taskName = 'Codex Account Monitor - manual public'
& (Join-Path $PSScriptRoot 'scripts\register-monitor-task.ps1') -TaskName $taskName -DataPath $dataPath -Port $monitorPort
$monitorRunning = $false
if (Test-Path -LiteralPath $runtimePath) {
    try {
        $runtimeInfo = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
        $monitorUri = [uri]$runtimeInfo.url
        if ($monitorUri.Scheme -ne 'http' -or $monitorUri.Host -ne '127.0.0.1') { throw 'Neplatna mistni adresa.' }
        $null = Invoke-RestMethod -Uri ($runtimeInfo.url + '/api/state') -Headers @{'X-Monitor-Key'=$runtimeInfo.key} -TimeoutSec 3
        $monitorRunning = $true
    } catch { $monitorRunning = $false }
}
if (-not $monitorRunning) {
    Start-ScheduledTask -TaskName $taskName
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        if (Test-Path -LiteralPath $runtimePath) {
            try {
                $runtimeInfo = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
                if (([uri]$runtimeInfo.url).Host -ne '127.0.0.1') { throw 'Neplatna mistni adresa.' }
                $null = Invoke-RestMethod -Uri ($runtimeInfo.url + '/api/state') -Headers @{'X-Monitor-Key'=$runtimeInfo.key} -TimeoutSec 1
                $monitorRunning = $true
                break
            } catch {}
        }
    }
}
if (-not $monitorRunning) { throw 'Prehled se nepodarilo spustit. Zkontrolujte mistni zaznam spusteni.' }
if (-not $BezOtevreni) { Start-Process $runtimeInfo.url }
Write-Output $runtimeInfo.url
