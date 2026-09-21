<#
.SYNOPSIS
Builds the Microsoft Store MSIX package for Upscaly.

.DESCRIPTION
Tauri has no MSIX bundler, so this assembles the package itself: it builds the
Store variant of the app, stages the runtime tree, fills in the Partner Center
identity, and runs MakeAppx over the result.

The Store variant differs from the NSIS build in one way -- it is compiled
without the "self-update" feature. An MSIX installs into a read-only directory
under %ProgramFiles%\WindowsApps and Store policy requires updates to arrive
through the Store, so the updater must not be present. Because Tauri fails the
build on a capability naming a plugin that is not a dependency, this also moves
capabilities/self-update.json aside for the duration of the build and restores
it afterwards (including on failure).

ffmpeg is deliberately NOT bundled. It is GPL and ~290MB; the app downloads it
to %LOCALAPPDATA% on first video job, which keeps the package small and means
Upscaly never redistributes GPL binaries. Store policy 10.2.4 permits this so
long as the dependency is disclosed at the start of the Store description.

.PARAMETER SkipBuild
Reuse the existing target\release build instead of recompiling. Useful when
iterating on the manifest or asset layout.

.EXAMPLE
pwsh -File scripts/build-msix.ps1
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$repo      = Split-Path -Parent $PSScriptRoot
$srcTauri  = Join-Path $repo 'src-tauri'
$msixDir   = Join-Path $srcTauri 'msix'
$stage     = Join-Path $srcTauri 'target\msix-stage'
$outDir    = Join-Path $srcTauri 'target\msix'

function Write-Step($m) { Write-Host "[msix] $m" -ForegroundColor Cyan }
function Fail($m) { throw "[msix] $m" }

# --- Resolve MakeAppx from the newest installed Windows SDK -----------------
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
if (-not (Test-Path $sdkRoot)) { Fail "Windows SDK not found at $sdkRoot. Install the Windows 10/11 SDK." }
$makeAppx = Get-ChildItem $sdkRoot -Directory |
    Where-Object { $_.Name -match '^10\.' } |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
if (-not $makeAppx) { Fail "makeappx.exe not found under $sdkRoot." }
$makePri = Join-Path (Split-Path $makeAppx) 'makepri.exe'
if (-not (Test-Path $makePri)) { Fail "makepri.exe not found next to makeappx.exe." }
Write-Step "MakeAppx: $makeAppx"

# --- Identity + version ----------------------------------------------------
$identityPath = Join-Path $msixDir 'identity.json'
if (-not (Test-Path $identityPath)) { Fail "Missing $identityPath." }
$identity = Get-Content $identityPath -Raw | ConvertFrom-Json

foreach ($f in 'identityName', 'publisher', 'publisherDisplayName', 'displayName') {
    if ([string]::IsNullOrWhiteSpace($identity.$f)) { Fail "identity.json is missing '$f'." }
}
if ($identity.publisher -notmatch '^CN=') { Fail "publisher must start with 'CN=' (got '$($identity.publisher)')." }

$conf = Get-Content (Join-Path $srcTauri 'tauri.conf.json') -Raw | ConvertFrom-Json
# Store versions are four-part with a reserved revision field that must be 0.
$msixVersion = "$($conf.version).0"
if ($msixVersion -notmatch '^\d+\.\d+\.\d+\.0$') { Fail "Bad version '$msixVersion' from tauri.conf.json." }
Write-Step "Version: $msixVersion   Identity: $($identity.identityName)"

# --- Build the Store variant -----------------------------------------------
$capability = Join-Path $srcTauri 'capabilities\self-update.json'
$parked     = Join-Path $srcTauri 'target\self-update.json.parked'

if (-not $SkipBuild) {
    if (Test-Path $capability) {
        New-Item -ItemType Directory -Force -Path (Split-Path $parked) | Out-Null
        Move-Item $capability $parked -Force
    }
    try {
        Write-Step 'Building Store variant (no self-updater)...'
        Push-Location $repo
        # --no-bundle: we package it ourselves below. The NSIS bundler would
        # only produce an installer we are not shipping to the Store.
        #
        # --no-default-features goes after the second "--": the tauri CLI
        # forwards only what follows it to cargo, and rejects the flag as its
        # own. Without it "desktop" would simply be added to the defaults and
        # the updater would still be compiled in.
        npx tauri build --no-bundle --features desktop -- --no-default-features
        if ($LASTEXITCODE -ne 0) { Fail "tauri build failed (exit $LASTEXITCODE)." }
    }
    finally {
        Pop-Location
        if (Test-Path $parked) { Move-Item $parked $capability -Force }
    }
} else {
    Write-Step 'Skipping build (-SkipBuild).'
}

# --- Stage the package tree ------------------------------------------------
Write-Step "Staging into $stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'Assets') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'resources') | Out-Null

$release = Join-Path $srcTauri 'target\release'

$exe = Join-Path $release 'upscaly.exe'
if (-not (Test-Path $exe)) { Fail "upscaly.exe not found in $release. Run without -SkipBuild." }
Copy-Item $exe $stage

# The upscale engine. Tauri strips the target triple when bundling an
# externalBin, and resolve_sidecar_path() probes the plain name next to the
# exe, so it is staged under the plain name here too.
$engine = Join-Path $srcTauri 'binaries\realesrgan-ncnn-vulkan-x86_64-pc-windows-msvc.exe'
if (-not (Test-Path $engine)) { Fail "Engine not found at $engine." }
Copy-Item $engine (Join-Path $stage 'realesrgan-ncnn-vulkan.exe')

# OpenMP runtime the ncnn engine links against.
Copy-Item (Join-Path $srcTauri 'binaries\vcomp140.dll') $stage

Copy-Item (Join-Path $srcTauri 'resources\provision-ffmpeg.ps1') (Join-Path $stage 'resources')
Copy-Item (Join-Path $srcTauri 'sidecar-manifest.json') $stage

# Every scale-*, targetsize-* and altform-* variant ships, not just the base
# file. Windows picks the taskbar and Alt-Tab icon from the "altform-unplated"
# variants of Square44x44Logo; with none present it falls back to the plated
# tile asset composited onto the manifest's BackgroundColor, which is why the
# Store build once showed a dark square where the NSIS build, using icon.ico
# directly, looked right. Generated by scripts/gen-msix-assets.py.
$icons = Join-Path $srcTauri 'icons'
$assetsOut = Join-Path $stage 'Assets'
foreach ($base in 'StoreLogo', 'Square44x44Logo', 'Square71x71Logo',
                  'Square150x150Logo', 'Square310x310Logo', 'Wide310x150Logo') {
    $variants = @(Get-ChildItem $icons -Filter "$base*.png" -File)
    if ($variants.Count -eq 0) {
        Fail "No assets for $base. Regenerate with: python scripts/gen-msix-assets.py"
    }
    $variants | Copy-Item -Destination $assetsOut
}
if (-not (Test-Path (Join-Path $assetsOut 'Square44x44Logo.targetsize-32_altform-unplated.png'))) {
    Fail 'Unplated taskbar variants are missing; run python scripts/gen-msix-assets.py'
}
Write-Step "Staged $((Get-ChildItem $assetsOut -File).Count) asset files"

# --- Manifest --------------------------------------------------------------
$manifest = Get-Content (Join-Path $msixDir 'AppxManifest.xml') -Raw
$manifest = $manifest.
    Replace('IDENTITY_NAME_PLACEHOLDER',         $identity.identityName).
    Replace('PUBLISHER_PLACEHOLDER',             $identity.publisher).
    Replace('PUBLISHER_DISPLAY_NAME_PLACEHOLDER', $identity.publisherDisplayName).
    Replace('DISPLAY_NAME_PLACEHOLDER',          $identity.displayName).
    Replace('VERSION_PLACEHOLDER',               $msixVersion)

if ($manifest -match 'PLACEHOLDER') { Fail 'A placeholder survived substitution; check AppxManifest.xml.' }
# No BOM: MakeAppx rejects a manifest that leads with one.
[IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest, [Text.UTF8Encoding]::new($false))

# --- Resource index --------------------------------------------------------
# Without a resources.pri, Windows does not resolve the scale-*/targetsize-*/
# altform-* qualifiers in the asset filenames at all -- it only ever loads the
# unqualified base file. The index is what makes the unplated taskbar variants
# reachable, so it is not optional here.
Write-Step 'Building resource index...'
$priConfig = Join-Path $stage 'priconfig.xml'
& $makePri createconfig /cf $priConfig /dq en-US /o | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "makepri createconfig failed (exit $LASTEXITCODE)." }
Push-Location $stage
try {
    & $makePri new /pr $stage /cf $priConfig /of (Join-Path $stage 'resources.pri') /o | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "makepri new failed (exit $LASTEXITCODE)." }
}
finally { Pop-Location }
# The config is an input to the index, not part of the package.
Remove-Item $priConfig -Force
if (-not (Test-Path (Join-Path $stage 'resources.pri'))) { Fail 'resources.pri was not produced.' }

# --- Pack ------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir "Upscaly-$msixVersion-x64.msix"
if (Test-Path $out) { Remove-Item $out -Force }

Write-Step 'Packing...'
& $makeAppx pack /d $stage /p $out /o
if ($LASTEXITCODE -ne 0) { Fail "MakeAppx failed (exit $LASTEXITCODE)." }

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host ''
Write-Step "Done: $out  (${sizeMb} MB)"
Write-Host ''
Write-Host 'Upload this file at Partner Center > Submission > Packages.' -ForegroundColor Green
Write-Host 'It is intentionally unsigned -- the Store signs it for you.' -ForegroundColor Green
