param([switch]$BezOtevreni)
$ErrorActionPreference = 'Stop'
if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'bridge\publish\CodexSwitch.exe'))){throw 'Chybi pomocnik prepinani. Nejdriv spustte bridge\Build.ps1 nebo pouzijte kompletni Windows balicek.'}
$dataPath = Join-Path $env:USERPROFILE 'Codex\account-monitor'
$runtimePath = Join-Path $dataPath 'runtime.json'
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Command node -ErrorAction Stop).Source }
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$taskName = 'Codex - prehled uctu (rucni)'
& (Join-Path $PSScriptRoot 'scripts\register-monitor-task.ps1') -TaskName $taskName -DataPath $dataPath -Port 55163
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
