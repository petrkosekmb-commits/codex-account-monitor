param(
    [ValidateSet('Stage','Enable','Disable')][string]$Mode='Stage',
    [Parameter(Mandatory=$true)][string]$NativeExecutable,
    [Parameter(Mandatory=$true)][string]$DesktopExecutable,
    [Parameter(Mandatory=$true)][string]$CodexHome,
    [Parameter(Mandatory=$true)][string]$BackupDirectory
)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$publish=Join-Path $root 'bridge\publish'
$relay=Join-Path $publish 'CodexMonitorRelay.exe'
$bootstrap=Join-Path $publish 'CodexMonitorRelay.bootstrap.json'
$receipt=Join-Path $BackupDirectory 'desktop-relay-installation.json'
$previous=[Environment]::GetEnvironmentVariable('CODEX_CLI_PATH','User')
if($Mode -eq 'Disable'){
    $saved=Get-Content -LiteralPath $receipt -Raw|ConvertFrom-Json
    if($previous -and $previous -ne $saved.relay){throw 'Spousteci nastaveni zmenil jiny program; nebylo prepsano.'}
    [Environment]::SetEnvironmentVariable('CODEX_CLI_PATH',$saved.previous,'User')
    if([Environment]::GetEnvironmentVariable('CODEX_CLI_PATH','User') -ne $saved.previous){throw 'Obnovu nastaveni nelze potvrdit.'}
    Write-Output 'Predchozi nastaveni obnoveno. Bezici desktop nebyl ukoncen.'
    return
}
foreach($path in @($relay,$NativeExecutable,$DesktopExecutable)){if(-not [IO.Path]::IsPathFullyQualified($path) -or -not (Test-Path -LiteralPath $path -PathType Leaf)){throw 'Chybi overeny spustitelny soubor.'}}
if($previous -and $previous -ne $relay){throw 'Existuje jine spousteci nastaveni; nebylo prepsano.'}
$manifest=Get-Content -LiteralPath (Join-Path $publish 'integrity.json') -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath $relay -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.'CodexMonitorRelay.exe'){throw 'Kontrolni soucet adapteru nesouhlasi.'}
New-Item -ItemType Directory -Path $BackupDirectory -Force|Out-Null
if(-not(Test-Path -LiteralPath $receipt)){
    $saved=@{previous=$previous;relay=$relay;native=$NativeExecutable;desktop=$DesktopExecutable;at=[DateTimeOffset]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($receipt,($saved|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
$config=@{NativeExecutable=$NativeExecutable;DesktopExecutable=$DesktopExecutable;Home=[IO.Path]::GetFullPath($CodexHome)}
$temporary=$bootstrap+'.tmp'
[IO.File]::WriteAllText($temporary,($config|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $bootstrap -Force
if($Mode -eq 'Enable'){
    [Environment]::SetEnvironmentVariable('CODEX_CLI_PATH',$relay,'User')
    if([Environment]::GetEnvironmentVariable('CODEX_CLI_PATH','User') -ne $relay){throw 'Ulozeni spousteciho nastaveni nelze potvrdit.'}
}
Write-Output ('Adapter pripraven: '+$Mode+'. Bezici desktop zatim nebyl zmenen.')
