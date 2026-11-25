"""Verify the language configuration consumed by the real Inno compiler."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("installer_languages", ROOT / "tools/installer_languages.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class InstallerLanguages(unittest.TestCase):
    def test_system_ui_language_and_chinese_translations_are_included(self):
        temporary = ROOT / "_temp/installer-language-tests"
        temporary.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary) as folder:
            root = Path(folder)
            (root / "Languages").mkdir()
            (root / "Languages/German.isl").write_text("test", encoding="utf-8")
            script = root / "app.iss"
            script.write_text("[Setup]\nAppName=FuxWX\n[Tasks]\n[Code]\n", encoding="utf-8")
            names = module.localize(script, root / "ISCC.exe", ROOT / "assets/installer/languages")
            result = script.read_text(encoding="utf-8")
            self.assertEqual(names, ["english", "chinesesimplified", "chinesetraditional", "german"])
            for directive in ["LanguageDetectionMethod=uilanguage", "ShowLanguageDialog=no", "UsePreviousLanguage=no"]:
                self.assertIn(directive, result)
            self.assertIn("ActiveLanguage", result)
            with self.assertRaises(ValueError):
                module.localize(script, root / "ISCC.exe", ROOT / "assets/installer/languages")


if __name__ == "__main__":
    unittest.main()
