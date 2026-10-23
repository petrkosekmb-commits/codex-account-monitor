param([string]$Dotnet='dotnet',[string]$UpstreamRoot)
$ErrorActionPreference='Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT='1'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE='1'
if(-not $UpstreamRoot){
    $staging=Join-Path $PSScriptRoot '.upstream'
    New-Item -ItemType Directory -Path $staging -Force|Out-Null
    $archive=Join-Path $staging 'codex-switch-v1.41.1.zip'
    if(-not(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri 'https://github.com/Gaebabi/codex-switch/archive/refs/tags/v1.41.1.zip' -OutFile $archive}
    if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne '2D3D42B23211316156D5E1666B49D5E04D4BF77A08F949117C1DED78589B499F'){throw 'SHA256 zdrojoveho archivu nesouhlasi.'}
    $UpstreamRoot=Join-Path $staging 'codex-switch-1.41.1'
    if(-not(Test-Path -LiteralPath $UpstreamRoot)){Expand-Archive -LiteralPath $archive -DestinationPath $staging}
}
& $Dotnet publish (Join-Path $PSScriptRoot 'AccountSwitchBridge.csproj') -c Release -r win-x64 --self-contained true ('-p:UpstreamRoot='+$UpstreamRoot) ('-p:CustomBeforeMicrosoftCommonTargets='+(Join-Path $PSScriptRoot 'compat\ProtocolOverride.targets')) -p:UseSharedCompilation=false -o (Join-Path $PSScriptRoot 'publish')
if($LASTEXITCODE -ne 0){throw 'Sestaveni pomocnika selhalo.'}
& $Dotnet run --project (Join-Path $PSScriptRoot 'tests\ProtocolRegression.csproj') -c Release ('-p:UpstreamRoot='+$UpstreamRoot) ('-p:CustomBeforeMicrosoftCommonTargets='+(Join-Path $PSScriptRoot 'compat\ProtocolOverride.targets')) -p:UseSharedCompilation=false
if($LASTEXITCODE -ne 0){throw 'Regresni testy pomocnika selhaly; balicek neni pripraveny k vydani.'}
& $Dotnet run --project (Join-Path $PSScriptRoot 'credential-tests\CredentialRegression.csproj') -c Release ('-p:UpstreamRoot='+$UpstreamRoot) ('-p:CustomBeforeMicrosoftCommonTargets='+(Join-Path $PSScriptRoot 'compat\ProtocolOverride.targets')) -p:UseSharedCompilation=false
if($LASTEXITCODE -ne 0){throw 'Credential regression tests failed.'}
$publishRoot=Join-Path $PSScriptRoot 'publish'
Copy-Item -LiteralPath (Join-Path $UpstreamRoot 'LICENSE') -Destination (Join-Path $publishRoot 'LICENSE-codex-switch.txt')
$integrity=@{}
foreach($file in Get-ChildItem -LiteralPath $publishRoot -File){if($file.Name -ne 'integrity.json'){$integrity[$file.Name]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
[IO.File]::WriteAllText((Join-Path $publishRoot 'integrity.json'),($integrity|ConvertTo-Json -Depth 3),[Text.UTF8Encoding]::new($false))
