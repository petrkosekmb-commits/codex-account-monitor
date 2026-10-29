param(
    [Parameter(Mandatory=$true)][string]$TaskName,
    [Parameter(Mandatory=$true)][string]$DataPath,
    [ValidateRange(1024,65535)][int]$Port=55163
)
$ErrorActionPreference='Stop'
$monitorRoot=Split-Path $PSScriptRoot -Parent
$hostScript=Join-Path $PSScriptRoot 'run-monitor-host.ps1'
$resolvedData=[IO.Path]::GetFullPath($DataPath)
if ($resolvedData -match '["\r\n]') { throw 'Invalid data directory.' }
$existingTask=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask -and @($existingTask.Actions | Where-Object { $_.Arguments -like ('*'+[WildcardPattern]::Escape($hostScript)+'*') }).Count -ne 1) { throw 'Task name belongs to a different program.' }
$shellPath=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'
if (-not (Test-Path -LiteralPath $shellPath)) { $shellPath=(Get-Command pwsh -ErrorAction Stop).Source }
$userName=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute $shellPath -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$hostScript+'" -DataPath "'+$resolvedData+'" -Port '+$Port) -WorkingDirectory $monitorRoot
$principal=New-ScheduledTaskPrincipal -UserId $userName -LogonType Interactive -RunLevel Limited
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $userName
$watchdog=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings=New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Principal $principal -Trigger @($trigger,$watchdog) -Settings $settings -Description 'Local account dashboard; starts at user sign-in and restarts after failures. Automatic account switching requires explicit local opt-in.' -Force | Out-Null
