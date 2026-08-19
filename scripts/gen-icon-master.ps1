<#
.SYNOPSIS
Crops the transparent padding out of the delivered logo and re-centres it to
fill the icon canvas.

.DESCRIPTION
The exported master (docs/.../icon-1024.png) draws the cube inside roughly
69% x 76% of its 1024px canvas -- about a third of the image is empty alpha.
Windows renders app icons at 16-48px in most places, so that padding is not
neutral: it shrinks the artwork to an effective ~22px inside a 32px slot and
the mark reads as an indistinct dark blob on a dark taskbar.

This crops to the actual drawn bounds and scales the result up so the longer
edge touches the canvas edge. The scale is uniform, so the cube is never
stretched; the shorter axis keeps whatever margin its aspect ratio implies.

Output feeds `npx tauri icon`, which generates the .ico and every PNG size.
Committed as src-tauri/icons/source-1024.png so the icon set is reproducible
from a known input rather than a one-off manual edit.
#>
[CmdletBinding()]
param(
    [string]$Source = "docs/Design system production assets/assets/icon-1024.png",
    [string]$Destination = "src-tauri/icons/source-1024.png",
    [int]$Size = 1024,
    # Alpha at or below this counts as empty. Not zero: soft edges leave a
    # faint halo that would otherwise defeat the crop entirely.
    [int]$AlphaFloor = 8,
    # How much of the canvas the artwork spans. Not 100: the mark is an
    # isometric cube, and letting its top edge and bottom vertex sit on the
    # canvas boundary removes the empty space that reads as depth -- at
    # desktop icon sizes it stops looking like a cube and starts looking like
    # a filled block. 84 keeps almost the same visual weight while the
    # silhouette still reads three-dimensional.
    [int]$FillPercent = 84
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
try {
    # Locked to a byte array rather than GetPixel: GetPixel on a 1024x1024
    # image is ~1M interop calls and takes minutes.
    $rect = New-Object System.Drawing.Rectangle(0, 0, $src.Width, $src.Height)
    $data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bytes = New-Object byte[] ($data.Stride * $src.Height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    $src.UnlockBits($data)

    $minX = $src.Width; $maxX = -1; $minY = $src.Height; $maxY = -1
    for ($y = 0; $y -lt $src.Height; $y++) {
        $row = $y * $data.Stride
        for ($x = 0; $x -lt $src.Width; $x++) {
            if ($bytes[$row + $x * 4 + 3] -gt $AlphaFloor) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { throw "Source is fully transparent" }

    $cw = $maxX - $minX + 1
    $ch = $maxY - $minY + 1
    $target = $Size * $FillPercent / 100.0
    $scale = [Math]::Min($target / $cw, $target / $ch)
    $dw = [int][Math]::Round($cw * $scale)
    $dh = [int][Math]::Round($ch * $scale)
    $dx = [int][Math]::Round(($Size - $dw) / 2)
    $dy = [int][Math]::Round(($Size - $dh) / 2)

    $out = New-Object System.Drawing.Bitmap($Size, $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src,
        (New-Object System.Drawing.Rectangle($dx, $dy, $dw, $dh)),
        (New-Object System.Drawing.Rectangle($minX, $minY, $cw, $ch)),
        [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    $out.Save((Join-Path (Get-Location) $Destination), [System.Drawing.Imaging.ImageFormat]::Png)
    $pctW = [math]::Round(100 * $dw / $Size)
    $pctH = [math]::Round(100 * $dh / $Size)
    Write-Output "source content ${cw}x${ch} at ($minX,$minY) -> ${dw}x${dh} in ${Size}px canvas (${pctW}% x ${pctH}%)"
    Write-Output "wrote $Destination"
    $out.Dispose()
}
finally {
    $src.Dispose()
}
