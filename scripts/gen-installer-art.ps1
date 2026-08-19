<#
.SYNOPSIS
Draws the NSIS installer header and sidebar bitmaps at their exact native
sizes.

.DESCRIPTION
NSIS wants a 150x57 header and a 164x314 sidebar, as bitmaps -- it has no
notion of scale factors, and no facility to generate either from an icon.
The delivered PNGs had a full lockup (wordmark, tagline, a stack of caption
rows) baked in at those sizes, so the type was already only a few pixels
tall before Windows scaled the dialog on a high-DPI display and resampled
it into mush.

The fix is not a better export -- it is less content. These draw the mark
plus a single wordmark, with type set directly at final size by GDI+ rather
than shrunk into place, so every glyph lands on the pixel grid it will be
displayed at.

Output is 24-bit BMP: NSIS MUI bitmaps have no alpha channel, and a 32-bit
input renders as a black box.
#>
[CmdletBinding()]
param(
    [string]$Logo = "src-tauri/icons/source-1024.png",
    [string]$OutDir = "src-tauri/installer"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Design tokens, matching src/index.css.
$BG      = [System.Drawing.Color]::FromArgb(255, 11, 10, 9)      # --bg-base
$TEXT    = [System.Drawing.Color]::FromArgb(255, 242, 240, 237)  # --text-primary
$MUTED   = [System.Drawing.Color]::FromArgb(255, 138, 132, 124)  # --text-tertiary
$ACCENT  = [System.Drawing.Color]::FromArgb(255, 168, 11, 36)    # --accent

$logoImg = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Logo))

function New-Canvas([int]$w, [int]$h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($BG)
    $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    # Grayscale rather than ClearType: subpixel rendering assumes an RGB
    # stripe panel, and these pixels get scaled by the installer dialog on
    # high-DPI screens, which turns the colour fringes into visible artefacts.
    $g.TextRenderingHint   = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Bmp($canvas, [string]$path) {
    $canvas.Graphics.Dispose()
    $full = Join-Path (Get-Location) $path
    $canvas.Bitmap.Save($full, [System.Drawing.Imaging.ImageFormat]::Bmp)
    Write-Output ("{0}: {1}x{2} {3}" -f (Split-Path $path -Leaf), $canvas.Bitmap.Width, $canvas.Bitmap.Height, $canvas.Bitmap.PixelFormat)
    $canvas.Bitmap.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---------------------------------------------------------------- header
# 150x57, shown top-right on every interior page. Wide and very short, so
# it takes a horizontal lockup and nothing else.
$h = New-Canvas 150 57
$mark = 34
$h.Graphics.DrawImage($logoImg, (New-Object System.Drawing.Rectangle(11, [int](( 57 - $mark) / 2), $mark, $mark)))

$fontName = if ((New-Object System.Drawing.Text.InstalledFontCollection).Families |
                Where-Object { $_.Name -eq 'Segoe UI' }) { 'Segoe UI' } else { 'Arial' }
$titleFont = New-Object System.Drawing.Font($fontName, 13, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brushText = New-Object System.Drawing.SolidBrush($TEXT)
$h.Graphics.DrawString("Upscaly", $titleFont, $brushText, 53, 15)

$capFont = New-Object System.Drawing.Font($fontName, 7, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brushMuted = New-Object System.Drawing.SolidBrush($MUTED)
$h.Graphics.DrawString("SETUP", $capFont, $brushMuted, 54, 32)

$penAccent = New-Object System.Drawing.Pen($ACCENT, 2)
$h.Graphics.DrawLine($penAccent, 0, 55, 150, 55)
Save-Bmp $h "$OutDir/header.bmp"

# --------------------------------------------------------------- sidebar
# 164x314, the tall panel on the welcome and finish pages. Room for a large
# mark and two short lines -- deliberately not the six-row lockup the
# delivered art tried to fit here.
$s = New-Canvas 164 314
$markBig = 104
$s.Graphics.DrawImage($logoImg, (New-Object System.Drawing.Rectangle([int]((164 - $markBig) / 2), 46, $markBig, $markBig)))

$bigFont = New-Object System.Drawing.Font($fontName, 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$s.Graphics.DrawString("Upscaly", $bigFont, $brushText, (New-Object System.Drawing.RectangleF(0, 172, 164, 34)), $fmt)

$s.Graphics.DrawLine($penAccent, 58, 214, 106, 214)

$subFont = New-Object System.Drawing.Font($fontName, 10, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$s.Graphics.DrawString("Image & video upscaling", $subFont, $brushMuted, (New-Object System.Drawing.RectangleF(0, 228, 164, 16)), $fmt)
$s.Graphics.DrawString("Nothing leaves your machine", $subFont, $brushMuted, (New-Object System.Drawing.RectangleF(0, 244, 164, 16)), $fmt)
Save-Bmp $s "$OutDir/sidebar.bmp"

$logoImg.Dispose()
