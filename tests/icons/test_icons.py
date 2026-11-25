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
                    # Compare opacity and visible color against the current source.
                    # Transparent compositing clears hidden RGB in zero-alpha pixels;
                    # those invisible bytes must not make a new brand color fail.
                    self.assertEqual(actual.getchannel("A").tobytes(), expected.getchannel("A").tobytes())
                    self.assertEqual(actual.convert("RGBa").tobytes(), expected.convert("RGBa").tobytes())

    def test_executable_contains_the_same_frames(self):
        verify(ROOT / "dist/package/FuxWX/FuxWX.exe", ROOT / "dist/icons/FuxWX.ico")


if __name__ == "__main__":
    unittest.main()
