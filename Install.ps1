param(
    [ValidateSet('Apply','Restore')][string]$Mode='Apply',
    [string]$InstallPath='C:\Program Files\Cooler Master\MasterHUB'
)
$ErrorActionPreference='Stop'
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
$expected='a80844ac26e9478023213095006bf88db178712fb7a2e1be7b244d8445202f3f'
$previous=@('fe7ff676b57998eba3bf414bdabac885d2cb71dec987e236f80a07481212ec11','5f7db84866906fdeb9bc8873780b4eea4489030b2e60f99762c82aabd1f2a3b3','92b533f8fe1a3d77d27603cf6392f405e01b6588b29cf7f1643c67fa383bb80e','8078a40164d68940fbff02021b4316019ccbbeffbf67795508c4d1a3c166eeaf','9cd2df98c2be83a01358dd2d74e29330b10cb337812c4c4c757b95289b40a2b3')
$tempBuild=$null
try {
    Write-Host 'MASTERHUB COMMUNITY 0.3.0 BOOTSTRAP INSTALLER' -ForegroundColor Cyan
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    $principal=New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Right-click Apply.cmd and run as administrator, using the same Windows account that runs MasterHUB.' }
    $InstallPath=(Resolve-Path -LiteralPath $InstallPath).ProviderPath
    $target=Join-Path $InstallPath 'resources\app.asar'
    $original=$target+'.community-original'
    $receipt=$target+'.community-bootstrap.json'
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'MasterHUB was not found.' }
    if (Get-Process -Name 'MasterHUB','MHDaemon' -ErrorAction SilentlyContinue) { throw 'Exit MasterHUB from its system-tray icon and close MHDaemon before installing.' }
    $current=Hash $target
    $knownBootstrap=$null
    if(Test-Path -LiteralPath $receipt) { $knownBootstrap=(Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json).sha256 }
    if ($current -ne $expected -and $current -notin $previous -and $current -ne $knownBootstrap) { throw 'Unsupported or externally changed app.asar. No application files changed.' }
    if (Test-Path -LiteralPath $original) {
        if ((Hash $original) -ne $expected) { throw 'Original vendor backup checksum differs; it was preserved.' }
    } elseif ($current -eq $expected -and $Mode -eq 'Apply') {
        Copy-Item -LiteralPath $target -Destination $original
    } elseif ($Mode -eq 'Restore' -and $current -eq $expected) { Write-Host 'Original app is already installed.'; exit 0
    } else { throw 'Original vendor backup is required. Restore the supported vendor installation first.' }
    if($Mode -eq 'Apply') {
        if(Get-Command py -ErrorAction SilentlyContinue) { $python='py';$pythonArgs=@('-3') }
        elseif(Get-Command python -ErrorAction SilentlyContinue) { $python='python';$pythonArgs=@() }
        else { throw 'Install Python 3.10 or later with the Python launcher, then retry.' }
        & $python @pythonArgs -c 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'
        if($LASTEXITCODE -ne 0) { throw 'Python 3.10 or later is required.' }
        $tempBuild=Join-Path ([System.IO.Path]::GetTempPath()) ('mhc-build-'+[Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $tempBuild | Out-Null
        $source=Join-Path $tempBuild 'app.asar'
        & $python @pythonArgs (Join-Path $PSScriptRoot 'build.py') $original --out $source
        if($LASTEXITCODE -ne 0) { throw 'Local patch build failed; installed app was preserved.' }
        $sourceHash=Hash $source
        $slots=Join-Path $env:APPDATA 'MasterHub\community\updates'
        & $python @pythonArgs (Join-Path $PSScriptRoot 'scripts\seed.py') $slots
        if($LASTEXITCODE -ne 0) { throw 'Community release preparation failed; installed app was preserved.' }
    } else { $source=$original;$sourceHash=$expected }
    if ($current -ne $sourceHash) {
        $staged=$target+'.community-staged';$backup=$target+'.community-replacing'
        if ((Test-Path -LiteralPath $staged) -or (Test-Path -LiteralPath $backup)) { throw 'An interrupted replacement exists. Preserve these files and recover before retrying.' }
        Copy-Item -LiteralPath $source -Destination $staged
        if ((Hash $staged) -ne $sourceHash) { Remove-Item -LiteralPath $staged;throw 'Staged file verification failed.' }
        # Explicit backup path avoids PowerShell converting null to an invalid empty path.
        [System.IO.File]::Replace([System.IO.Path]::GetFullPath($staged),[System.IO.Path]::GetFullPath($target),[System.IO.Path]::GetFullPath($backup),$false)
        if ((Hash $target) -ne $sourceHash) { throw "Replacement verification failed; recovery copy is $backup" }
        if($Mode -eq 'Apply') { @{sha256=$sourceHash;bootstrap=1}|ConvertTo-Json|Set-Content -LiteralPath $receipt -Encoding UTF8 }
        Remove-Item -LiteralPath $backup
    } elseif($Mode -eq 'Apply') { @{sha256=$sourceHash;bootstrap=1}|ConvertTo-Json|Set-Content -LiteralPath $receipt -Encoding UTF8 }
    Write-Host "$Mode completed. Start MasterHUB normally, without administrator rights."
    if($Mode -eq 'Apply') { Write-Host 'Add-ons shows the current version and update status. GitHub updates activate on the next full launch.' }
    else { Write-Host 'Profiles, add-ons, and account settings were preserved.' }
    exit 0
} catch {
    Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red
    Write-Host $_.InvocationInfo.PositionMessage
    exit 1
} finally {
    if ($tempBuild -and (Test-Path -LiteralPath $tempBuild)) { Remove-Item -LiteralPath $tempBuild -Recurse -Force }
}
