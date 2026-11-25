"""Generate all application icon sizes from the user-provided FuxWX logo."""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "dist/icons"
out.mkdir(parents=True, exist_ok=True)
source = Image.open(ROOT / "assets/branding/FuxWX_logo.png").convert("RGBA")
sizes = [16, 20, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024]
for pixels in sizes:
    icon = ImageOps.contain(source, (pixels, pixels), Image.Resampling.LANCZOS)
    square = Image.new("RGBA", (pixels, pixels))
    square.alpha_composite(icon, ((pixels - icon.width) // 2, (pixels - icon.height) // 2))
    square.save(out / f"FuxWX-{pixels}.png")
large = Image.open(out / "FuxWX-1024.png")
large.save(out / "FuxWX.png")
large.save(out / "FuxWX.ico", sizes=[(n, n) for n in [16, 24, 32, 48, 64, 128, 256]])
large.save(out / "FuxWX.icns")
with Image.open(out / "FuxWX.ico") as result:
    assert result.ico.sizes() == {(n, n) for n in [16, 24, 32, 48, 64, 128, 256]}
print("Generated 12 PNG sizes, multi-size ICO and ICNS from assets/branding/FuxWX_logo.png")
