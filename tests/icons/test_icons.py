"""Verify resized transparency and the actual packaged icon resources."""
import sys
from pathlib import Path
import unittest
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
from windows_icons import verify


class IconQuality(unittest.TestCase):
    def test_package_uses_original_size_frames_without_dark_alpha_edges(self):
        source = Image.open(ROOT / "assets/branding/FuxWX_logo.png").convert("RGBA")
        with Image.open(ROOT / "dist/package/FuxWX/nsh/icon.ico") as ico:
            for size in [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 88, 96, 128, 256]:
                with self.subTest(size=size):
                    self.assertIn((size, size), ico.ico.sizes())
                    actual = ico.ico.getimage((size, size)).convert("RGBA")
                    expected = ImageOps.contain(source, (size, size), Image.Resampling.LANCZOS)
                    self.assertEqual(actual.tobytes(), expected.tobytes())
                    # This logo's translucent outer rim is green; mixed-in black
                    # reduced its green channel to ~158 in the old 32px package.
                    rim = [p for p in actual.get_flattened_data() if 20 < p[3] < 230]
                    self.assertTrue(rim)
                    self.assertGreater(min(p[1] for p in rim), 240)

    def test_executable_contains_the_same_frames(self):
        verify(ROOT / "dist/package/FuxWX/FuxWX.exe", ROOT / "dist/icons/FuxWX.ico")


if __name__ == "__main__":
    unittest.main()
