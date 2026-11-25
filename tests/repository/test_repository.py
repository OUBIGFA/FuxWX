"""Exercise public repository boundaries through real Git indexes."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("check_repository", ROOT / "tools/check_repository.py")
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.put(".gitignore", ".local/\ndist/\n**/_temp/\n")
        self.put("README.md", "Public project\n")
        self.git("add", ".")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def put(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content if isinstance(content, bytes) else content.encode("utf-8"))

    def test_clean(self):
        self.assertEqual(CHECK.check(self.root), [])

    def test_nested_temporary_file(self):
        self.put("a/_temp/private.txt", "private")
        self.git("add", "-f", "a/_temp/private.txt")
        self.assertTrue(CHECK.check(self.root))

    def test_rules_must_match_index_and_temp_rule_stays_last(self):
        self.put(".gitignore", ".local/\ndist/\n**/_temp/\n!important\n")
        self.assertTrue(CHECK.check(self.root))
        self.git("add", ".gitignore")
        self.assertTrue(CHECK.check(self.root))

    def test_staged_secret_is_not_hidden_by_clean_worktree(self):
        self.put("bad.txt", "ghp_" + "a" * 36)
        self.git("add", "bad.txt")
        self.put("bad.txt", "clean")
        self.assertTrue(CHECK.check(self.root))

    def test_invalid_utf8_json_binary_and_large_file(self):
        for filename, data in [("bad.txt", b"\xff"), ("bad.json", b"{"),
                               ("raw.bin", b"\x00\x01"), ("huge.txt", b"a" * (CHECK.MAX_BYTES + 1))]:
            with self.subTest(filename=filename):
                self.put(filename, data)
                self.git("add", filename)
                self.assertTrue(CHECK.check(self.root))
                self.git("rm", "--cached", filename)

    def test_case_conflict_and_symlink(self):
        blob = self.git("hash-object", "-w", "README.md").stdout.decode().strip()
        self.git("update-index", "--add", "--cacheinfo", f"100644,{blob},readme.md")
        self.assertTrue(CHECK.check(self.root))
        self.git("update-index", "--force-remove", "readme.md")
        self.git("update-index", "--add", "--cacheinfo", f"120000,{blob},link")
        self.assertTrue(CHECK.check(self.root))

    def test_registered_binary(self):
        import hashlib
        import json
        data = b"\x00\x01"
        self.put("assets/icon.bin", data)
        self.put("third_party/binaries.json", json.dumps([{
            "path": "assets/icon.bin", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "source": "test fixture", "license": "MIT"
        }]))
        self.git("add", ".")
        self.assertEqual(CHECK.check(self.root), [])


if __name__ == "__main__":
    unittest.main()
