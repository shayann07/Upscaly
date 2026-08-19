<#
.SYNOPSIS
Downloads the ffmpeg/ffprobe sidecars Upscaly needs for video work.

.DESCRIPTION
These two binaries are ~290MB together and are GPL-licensed, so they are
neither committed to the repository nor bundled into the installer -- the
installer fetches them from upstream at install time instead, which also
means Upscaly never redistributes GPL binaries itself.

Run from the NSIS installer's POSTINSTALL hook, and again by the app
itself if the installer's attempt did not succeed (offline machine,
flaky network, GitHub unreachable). Both callers are expected to treat
failure as non-fatal: image upscaling does not need ffmpeg at all, so a
failed fetch must never block the install or the app.

Everything about *what* to download comes from sidecar-manifest.json, the
same file scripts/fetch-sidecars.mjs reads, so there is exactly one place
the pinned URL and hashes live.

.PARAMETER InstallDir
Where the app is installed. Binaries land in <InstallDir>\binaries\,
which is the second location resolve_sidecar_path() checks.

.PARAMETER ManifestPath
sidecar-manifest.json. Defaults to the copy next to this script's parent
directory, which is where the bundle places it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir,

    [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is ~10x faster without it
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step($message) { Write-Output "[upscaly] $message" }

try {
    if (-not $ManifestPath) {
        $ManifestPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'sidecar-manifest.json'
    }
    if (-not (Test-Path -LiteralPath $ManifestPath)) {
        throw "Manifest not found at $ManifestPath"
    }

    $manifest = (Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json).windows.ffmpeg
    $binDir = Join-Path $InstallDir 'binaries'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    # Idempotent: a re-run, a repair install, or an upgrade over a good
    # copy should cost nothing. Hash rather than existence -- a half-written
    # file from an interrupted download is present but useless.
    $needed = @()
    foreach ($entry in $manifest.entries) {
        $dest = Join-Path $binDir $entry.dest
        if (Test-Path -LiteralPath $dest) {
            $have = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($have -eq $entry.sha256.ToLowerInvariant()) {
                Write-Step "$($entry.dest) already present and verified"
                continue
            }
            Write-Step "$($entry.dest) present but does not match the manifest; refetching"
        }
        $needed += $entry
    }
    if ($needed.Count -eq 0) {
        Write-Step 'ffmpeg already provisioned'
        exit 0
    }

    $work = Join-Path ([System.IO.Path]::GetTempPath()) ("upscaly-ffmpeg-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $work | Out-Null

    try {
        $archive = Join-Path $work 'ffmpeg.zip'
        Write-Step "Downloading ffmpeg from $($manifest.archive_url)"
        Invoke-WebRequest -Uri $manifest.archive_url -OutFile $archive -UseBasicParsing -TimeoutSec 900

        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $manifest.archive_sha256.ToLowerInvariant()) {
            throw "Archive SHA-256 mismatch. Expected $($manifest.archive_sha256), got $actual"
        }
        Write-Step 'Archive verified'

        # Only the two entries are pulled out. The archive also carries
        # ffplay.exe (~146MB), which Upscaly never invokes, so a blanket
        # Expand-Archive would cost an extra 146MB of disk and time for a
        # file that is immediately useless.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
        try {
            foreach ($entry in $needed) {
                $found = $zip.Entries | Where-Object { $_.FullName -eq $entry.path_in_archive }
                if (-not $found) { throw "Archive has no entry '$($entry.path_in_archive)'" }

                $staged = Join-Path $work $entry.dest
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($found, $staged, $true)

                $got = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($got -ne $entry.sha256.ToLowerInvariant()) {
                    throw "$($entry.dest) SHA-256 mismatch. Expected $($entry.sha256), got $got"
                }
            }
        }
        finally {
            $zip.Dispose()
        }

        # Moved only after every entry has been extracted *and* verified, so
        # a failure on the second file cannot leave the first one sitting in
        # place and make a broken install look complete.
        foreach ($entry in $needed) {
            Move-Item -LiteralPath (Join-Path $work $entry.dest) -Destination (Join-Path $binDir $entry.dest) -Force
            Write-Step "Installed $($entry.dest)"
        }

        Write-Step 'ffmpeg provisioned successfully'
        exit 0
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
catch {
    # Non-zero so a caller that cares can tell, but callers are expected to
    # continue regardless: video work will prompt for this again in-app,
    # and image upscaling never needed it.
    Write-Output "[upscaly] ffmpeg provisioning failed: $($_.Exception.Message)"
    Write-Output '[upscaly] Upscaly Studio will offer to download it again when a video job is started.'
    exit 1
}
