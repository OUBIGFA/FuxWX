"""Generate all application icon sizes from the user-provided FuxWX logo."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "dist/icons"
out.mkdir(parents=True, exist_ok=True)
source = Image.open(ROOT / "assets/branding/FuxWX_logo.png").convert("RGBA")
icon_sizes = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 88, 96, 128, 256]
sizes = icon_sizes + [512, 1024]
frames = []
for pixels in sizes:
    icon = ImageOps.contain(source, (pixels, pixels), Image.Resampling.LANCZOS)
    square = Image.new("RGBA", (pixels, pixels))
    square.alpha_composite(icon, ((pixels - icon.width) // 2, (pixels - icon.height) // 2))
    square.save(out / f"FuxWX-{pixels}.png")
    if pixels in icon_sizes:
        frames.append(square)
large = Image.open(out / "FuxWX-1024.png")
large.save(out / "FuxWX.png")
# Use the frames resized from the original with Pillow's premultiplied-alpha
# filter. Do not resize the 1024-pixel derivative or let nsh resample them again.
frames[-1].save(out / "FuxWX.ico", sizes=[(n, n) for n in icon_sizes], append_images=frames[:-1])
large.save(out / "FuxWX.icns")
with Image.open(out / "FuxWX.ico") as result:
    assert result.ico.sizes() == {(n, n) for n in icon_sizes}
    for frame in frames:
        assert result.ico.getimage(frame.size).convert("RGBA").tobytes() == frame.tobytes()
print(f"Generated {len(sizes)} PNG sizes and {len(icon_sizes)} exact ICO frames from the original logo")
