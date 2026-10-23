if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'bridge\publish\CodexSwitch.exe'))){throw 'Chybi sestaveny pomocnik. Nejdriv spustte bridge\Build.ps1. / Build the helper first.'}
$ErrorActionPreference = 'Stop'
$catalogRoot = Join-Path $env:LOCALAPPDATA 'CodexAccountMonitorTools'
$installPath = Join-Path $catalogRoot 'plugins\account-monitor'
if (Test-Path -LiteralPath $catalogRoot) { throw 'Cil instalace uz existuje; neprepisuji jej.' }
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
$entries = @('state-writer.mjs','config.mjs','accounts.example.json','LICENSE','account-state.mjs','app.mjs','core.mjs','rpc.mjs','server.mjs','switcher.mjs','switch-flow.mjs','automatic-switch.mjs','index.html','package.json','README.md','THIRD_PARTY_NOTICES.md','OVERENI.md','Spustit-prehled.ps1','Spustit-prehled.cmd','.mcp.json','.codex-plugin','scripts','tests')
foreach ($entry in $entries) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry) -Destination $installPath -Recurse }
foreach ($entry in $entries) {
    $sourceItem = Get-Item -LiteralPath (Join-Path $PSScriptRoot $entry)
    $files = if ($sourceItem.PSIsContainer) { Get-ChildItem -LiteralPath $sourceItem.FullName -File -Recurse -Force } else { @($sourceItem) }
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($PSScriptRoot.Length + 1)
        if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $installPath $relative) -Algorithm SHA256).Hash) { throw 'Overeni instalacni kopie selhalo.' }
    }
}
New-Item -ItemType Directory -Path (Join-Path $installPath 'bridge') -Force | Out-Null
foreach($entry in @('MonitorOwnership.cs','credential-tests','Program.cs','ChatTitle.cs','AccountErrors.cs','DesktopLaunch.cs','DesktopClose.cs','AccountSwitchBridge.csproj','Build.ps1','LICENSE-codex-switch.txt','.gitignore','compat','tests','publish')) {
    $from=Join-Path (Join-Path $PSScriptRoot 'bridge') $entry
    if(Test-Path -LiteralPath $from){Copy-Item -LiteralPath $from -Destination (Join-Path $installPath 'bridge') -Recurse}
}
$marketplaceDir = Join-Path $catalogRoot '.agents\plugins'
New-Item -ItemType Directory -Path $marketplaceDir -Force | Out-Null
$catalog = @{ name='codex-account-overview-public'; owner=@{name='Account Monitor contributors'}; plugins=@(@{name='account-monitor';source=@{source='local';path='./plugins/account-monitor'};policy=@{installation='AVAILABLE';authentication='ON_INSTALL'};category='Productivity'}) }
[IO.File]::WriteAllText((Join-Path $marketplaceDir 'marketplace.json'),($catalog|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
$cli = Join-Path $env:USERPROFILE '.codex\plugins\.plugin-appserver\codex.exe'
& $cli plugin marketplace add $catalogRoot --json
if ($LASTEXITCODE -ne 0) { throw 'Registrace katalogu selhala.' }
& $cli plugin add 'account-monitor@codex-account-overview-public' --json
if ($LASTEXITCODE -ne 0) { throw 'Instalace pluginu selhala.' }
& (Join-Path $installPath 'Spustit-prehled.ps1') -BezOtevreni
Write-Output ('INSTALLED=' + $installPath)
