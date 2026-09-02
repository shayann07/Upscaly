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

What to download is resolved fresh on every run (see Resolve-FfmpegRelease
below) rather than read from a frozen, dated pin: this used to point at a
specific "autobuild-YYYY-MM-DD-HH-MM" BtbN release tag with a hash baked
into sidecar-manifest.json, which broke every install once that tag aged
out of BtbN's rolling release window and 404'd -- the exact failure this
version exists to stop recurring. See sidecar-manifest.json's own comment
for why realesrgan-ncnn-vulkan does not need the same treatment.

.PARAMETER InstallDir
Where the app is installed. Binaries land in <InstallDir>\binaries\,
which is the second location resolve_sidecar_path() checks.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$InstallDir
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is ~10x faster without it
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Step($message) { Write-Output "[upscaly] $message" }

# Only the major series is pinned in source. Everything else -- exact
# patch build, archive hash, filename, download URL -- is resolved fresh
# every run against BtbN's own currently-published "latest" release and
# its checksums.sha256, a file they regenerate and re-sign for every
# release. BtbN prunes old "autobuild-*" tags on a rolling window (their
# release history holds roughly the last couple of weeks), so a frozen
# dated tag eventually 404s no matter how carefully it was chosen when
# pinned. The "latest" tag itself is a permanent alias BtbN maintains
# indefinitely; only the series is a deliberate, rare choice worth a
# human decision (a major FFmpeg bump can change encoder defaults/flags).
$FfmpegSeries = '8'

function Resolve-FfmpegRelease {
    param([string]$Series)

    $checksumsUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256'
    Write-Step "Resolving current ffmpeg build (BtbN, series $Series.x)"
    # Read back from a file rather than trusting Invoke-WebRequest's own
    # .Content: on Windows PowerShell 5.1 with -UseBasicParsing, .Content
    # comes back as a raw byte array rather than decoded text depending on
    # the response headers, and treating it as a string then silently
    # matched nothing. -OutFile + Get-Content is the same download
    # mechanism the archive itself uses two steps down, so there is only
    # one way this script reads a file off the network.
    $checksumsFile = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $checksumsUrl -OutFile $checksumsFile -UseBasicParsing -TimeoutSec 60
        $checksums = Get-Content -LiteralPath $checksumsFile -Raw
    }
    finally {
        Remove-Item -LiteralPath $checksumsFile -Force -ErrorAction SilentlyContinue
    }

    # win64, GPL (Upscaly's fallback software encoder needs libx264),
    # static (not "-shared"), that exact series -- "master" and other
    # series (BtbN publishes several concurrently) are deliberately
    # excluded so a checksums.sha256 with multiple matches cannot pick
    # one at random.
    $pattern = "(?m)^(?<hash>[0-9a-f]{64})\s+(?<name>ffmpeg-n$Series[0-9.]*-latest-win64-gpl-$Series\.[0-9]+\.zip)$"
    $match = [regex]::Match($checksums, $pattern)
    if (-not $match.Success) {
        throw "BtbN's current checksums.sha256 has no win64-gpl series-$Series build -- their release layout may have changed. Checked $checksumsUrl."
    }

    [PSCustomObject]@{
        Name   = $match.Groups['name'].Value
        Sha256 = $match.Groups['hash'].Value.ToLowerInvariant()
        Url    = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/$($match.Groups['name'].Value)"
    }
}

try {
    $binDir = Join-Path $InstallDir 'binaries'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    $destFfmpeg = Join-Path $binDir 'ffmpeg-x86_64-pc-windows-msvc.exe'
    $destFfprobe = Join-Path $binDir 'ffprobe-x86_64-pc-windows-msvc.exe'

    # Idempotent: a re-run, a repair install, or an upgrade over a good
    # copy should cost nothing. Existence rather than a hash match -- a
    # "latest" build is inherently a moving target, so there is no fixed
    # hash to keep re-checking installed files against; a corrupt or
    # half-written file is caught the same way a fresh install catches a
    # corrupt download, by the hash check further down on that attempt.
    if ((Test-Path -LiteralPath $destFfmpeg) -and (Test-Path -LiteralPath $destFfprobe)) {
        Write-Step 'ffmpeg already provisioned'
        exit 0
    }

    $ffmpeg = Resolve-FfmpegRelease -Series $FfmpegSeries

    $work = Join-Path ([System.IO.Path]::GetTempPath()) ("upscaly-ffmpeg-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $work | Out-Null

    try {
        $archive = Join-Path $work 'ffmpeg.zip'
        Write-Step "Downloading ffmpeg from $($ffmpeg.Url)"
        Invoke-WebRequest -Uri $ffmpeg.Url -OutFile $archive -UseBasicParsing -TimeoutSec 900

        $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $ffmpeg.Sha256) {
            throw "Archive SHA-256 mismatch against BtbN's own checksums.sha256. Expected $($ffmpeg.Sha256), got $actual"
        }
        Write-Step "Archive verified against BtbN's published checksum"

        # Only ffmpeg.exe and ffprobe.exe are pulled out, found by suffix
        # rather than a predicted path: the archive's top-level folder
        # name is derived from the exact build string (e.g.
        # ffmpeg-n8.1.2-50-g1a748fe2cd-win64-gpl-8.1), which changes on
        # every BtbN run and is not worth predicting. The archive also
        # carries ffplay.exe (~146MB), which Upscaly never invokes, so a
        # blanket Expand-Archive would cost an extra 146MB of disk and
        # time for a file that is immediately useless.
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
        try {
            $ffmpegEntry = $zip.Entries | Where-Object { $_.FullName -match '/bin/ffmpeg\.exe$' } | Select-Object -First 1
            $ffprobeEntry = $zip.Entries | Where-Object { $_.FullName -match '/bin/ffprobe\.exe$' } | Select-Object -First 1
            if (-not $ffmpegEntry) { throw "Archive $($ffmpeg.Name) has no bin/ffmpeg.exe entry" }
            if (-not $ffprobeEntry) { throw "Archive $($ffmpeg.Name) has no bin/ffprobe.exe entry" }

            $stagedFfmpeg = Join-Path $work 'ffmpeg.exe'
            $stagedFfprobe = Join-Path $work 'ffprobe.exe'
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($ffmpegEntry, $stagedFfmpeg, $true)
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($ffprobeEntry, $stagedFfprobe, $true)
        }
        finally {
            $zip.Dispose()
        }

        # Moved only after both files have been extracted, so a failure
        # partway through cannot leave one of the two in place and make a
        # broken install look complete.
        Move-Item -LiteralPath $stagedFfmpeg -Destination $destFfmpeg -Force
        Write-Step 'Installed ffmpeg-x86_64-pc-windows-msvc.exe'
        Move-Item -LiteralPath $stagedFfprobe -Destination $destFfprobe -Force
        Write-Step 'Installed ffprobe-x86_64-pc-windows-msvc.exe'

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
    #
    # The exception's type name and originating line are included -- not
    # just .Message -- because .Message alone was once a dead end: the
    # message from a PowerShell path-resolution failure read like it came
    # from a parameter named "drive", which does not exist anywhere in
    # this script, and there was no line number to chase it from.
    $where = if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) {
        " (line $($_.InvocationInfo.ScriptLineNumber))"
    } else { '' }
    Write-Output "[upscaly] ffmpeg provisioning failed: [$($_.Exception.GetType().FullName)] $($_.Exception.Message)$where"
    Write-Output '[upscaly] Upscaly Studio will offer to download it again when a video job is started.'
    exit 1
}
