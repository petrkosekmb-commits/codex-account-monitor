param([Parameter(Mandatory=$true)][string]$DataPath,[int]$Port=55163)
$ErrorActionPreference='Stop'
$monitorRoot=Split-Path $PSScriptRoot -Parent
$monitorData=[IO.Path]::GetFullPath($DataPath)
$env:ACCOUNT_MONITOR_DATA=$monitorData
$env:ACCOUNT_MONITOR_PORT=[string]$Port
$monitorNode=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if(-not(Test-Path -LiteralPath $monitorNode)){$monitorNode=(Get-Command node -ErrorAction Stop).Source}
New-Item -ItemType Directory -Path $monitorData -Force|Out-Null
$monitorApp=Join-Path $monitorRoot 'app.mjs'
$monitorLastExit=$null
for($monitorAttempt=0;$monitorAttempt -le 3;$monitorAttempt++){
    $monitorProcess=$null
    $adopted=$false
    try{
        $runtimePath=Join-Path $monitorData 'runtime.json'
        if(Test-Path -LiteralPath $runtimePath){
            $runtime=Get-Content -LiteralPath $runtimePath -Raw|ConvertFrom-Json
            $expectedOrigin='http://127.0.0.1:'+$Port
            $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$runtime.pid)
            if($runtime.url -eq $expectedOrigin -and $owner.Name -eq 'node.exe' -and $owner.CommandLine.Contains($monitorApp)){
                $null=Invoke-RestMethod ($runtime.url+'/api/state') -Headers @{'X-Monitor-Key'=$runtime.key} -TimeoutSec 3
                $monitorProcess=[Diagnostics.Process]::GetProcessById($runtime.pid)
                $adopted=$true
            }
        }
    }catch{$monitorProcess=$null}
    if(-not $monitorProcess){
        $start=[Diagnostics.ProcessStartInfo]::new($monitorNode)
        $start.UseShellExecute=$false
        $start.CreateNoWindow=$true
        $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
        $start.WorkingDirectory=$monitorRoot
        $start.ArgumentList.Add($monitorApp)
        $monitorProcess=[Diagnostics.Process]::Start($start)
    }
    [IO.File]::WriteAllText((Join-Path $monitorData 'host-status.json'),(@{watchingPid=$monitorProcess.Id;hostPid=$PID;adopted=$adopted;retry=$monitorAttempt;lastExitCode=$monitorLastExit;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    $monitorProcess.WaitForExit()
    $monitorProcess.Refresh()
    $monitorExit=if($adopted){1}else{$monitorProcess.ExitCode}
    $monitorLastExit=$monitorExit
    [IO.File]::WriteAllText((Join-Path $monitorData 'host-status.json'),(@{lastExitCode=$monitorExit;hostPid=$PID;retry=$monitorAttempt;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    $monitorProcess.Dispose()
    if($monitorExit -eq 0){exit 0}
    if($monitorAttempt -lt 3){Start-Sleep -Seconds 3}
}
exit $monitorExit
