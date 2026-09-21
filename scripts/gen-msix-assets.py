"""
Generates the Microsoft Store asset variants from src-tauri/icons/source-1024.png.

Windows picks a taskbar/Alt-Tab icon from the "altform-unplated" variants of
Square44x44Logo. With none present it falls back to the plated tile asset and
composites it onto the manifest's BackgroundColor -- which is why the Store
build showed a dark square in the taskbar while the NSIS build, which uses
icon.ico directly, looked correct.

Run after changing the source artwork:  python scripts/gen-msix-assets.py
"""
from PIL import Image
from pathlib import Path

ICONS = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"
src = Image.open(ICONS / "source-1024.png").convert("RGBA")

# Base tile sizes, each also emitted at the scale factors Windows requests.
TILES = {
    "Square44x44Logo": 44,
    "Square71x71Logo": 71,
    "Square150x150Logo": 150,
    "Square310x310Logo": 310,
    "StoreLogo": 50,
}
SCALES = (100, 125, 150, 200, 400)
# Sizes Windows asks for by target rather than by scale: taskbar, Alt-Tab,
# Start's app list, File Explorer.
TARGET_SIZES = (16, 24, 32, 48, 256)

written = []


def save(img: Image.Image, name: str) -> None:
    out = ICONS / name
    img.save(out)
    written.append(name)


def square(size: int) -> Image.Image:
    return src.resize((size, size), Image.LANCZOS)


for name, base in TILES.items():
    save(square(base), f"{name}.png")
    for scale in SCALES:
        save(square(round(base * scale / 100)), f"{name}.scale-{scale}.png")

# Wide tile: the logo centred on the app's own window background, so the tile
# reads as one piece with the app rather than a letterboxed square.
BG = (0x11, 0x0F, 0x0E, 255)
for scale in SCALES:
    w, h = round(310 * scale / 100), round(150 * scale / 100)
    canvas = Image.new("RGBA", (w, h), BG)
    side = int(min(w, h) * 0.72)
    logo = src.resize((side, side), Image.LANCZOS)
    canvas.paste(logo, ((w - side) // 2, (h - side) // 2), logo)
    save(canvas, f"Wide310x150Logo.scale-{scale}.png")
    if scale == 100:
        save(canvas, "Wide310x150Logo.png")

for ts in TARGET_SIZES:
    icon = square(ts)
    # Plated: Windows may draw these on the accent/background colour.
    save(icon, f"Square44x44Logo.targetsize-{ts}.png")
    # Unplated: drawn as-is, no background. These are what the taskbar and
    # Alt-Tab use, and their absence is the bug this script exists to fix.
    # The artwork already has a transparent background and enough contrast
    # for both themes, so light and dark share one image.
    save(icon, f"Square44x44Logo.targetsize-{ts}_altform-unplated.png")
    save(icon, f"Square44x44Logo.targetsize-{ts}_altform-lightunplated.png")

print(f"wrote {len(written)} assets to {ICONS}")
