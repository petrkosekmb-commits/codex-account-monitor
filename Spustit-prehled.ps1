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
    # On-demand only: Task Scheduler hosts the process outside Codex's process job.
    # No trigger, automatic sign-in start, password, or elevated privileges.
    $taskName = 'Codex Account Monitor - manual public'
    $hostScript = Join-Path $PSScriptRoot 'scripts\run-monitor-host.ps1'
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask -and @($existingTask.Actions | Where-Object { $_.Arguments -like ('*' + $hostScript + '*') }).Count -ne 1) { throw 'Nazev rucni ulohy uz pouziva jiny program.' }
    $shellPath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
    if (-not (Test-Path -LiteralPath $shellPath)) { $shellPath = (Get-Command pwsh -ErrorAction Stop).Source }
    $action = New-ScheduledTaskAction -Execute $shellPath -Argument ('-NoProfile -WindowStyle Hidden -File "' + $hostScript + '" -DataPath "' + $dataPath + '" -Port ' + $monitorPort) -WorkingDirectory $PSScriptRoot
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Description 'Rucne spousteny prehled uctu; bez casoveho nebo prihlasovaciho triggeru.' -Force | Out-Null
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
