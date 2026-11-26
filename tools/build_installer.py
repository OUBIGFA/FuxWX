"""Build the branded local test installer, including runtime dependency notices."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from installer_languages import localize
from windows_icons import embed

ROOT = Path(__file__).resolve().parents[1]
metadata = json.loads((ROOT / "nsh.json").read_text(encoding="utf-8"))
os.environ["CARGO_TARGET_DIR"] = str(ROOT / ".local/build/release")


def run(*args):
    subprocess.run(list(args), cwd=ROOT, check=True)


run(sys.executable, "tools/check_stable.py")
run(sys.executable, "tools/generate_icons.py")
runtime_lock = ROOT / "tools/locks/nsh-runtime-Cargo.lock"
if runtime_lock.is_file():
    (ROOT / ".nsh/rust").mkdir(parents=True, exist_ok=True)
    shutil.copy2(runtime_lock, ROOT / ".nsh/rust/Cargo.lock")
run("nsh", "package", "--target", "windows", "-o", "dist/package")
package = ROOT / "dist/package/FuxWX"
icon = ROOT / "dist/icons/FuxWX.ico"
shutil.copy2(icon, package / "nsh/icon.ico")
embed(package / "FuxWX.exe", icon)
run(sys.executable, "-m", "unittest", "discover", "-s", "tests/icons", "-v")
run(sys.executable, "tools/test_window_icons.py")
run(sys.executable, "tools/generate_notices.py", str(package / "THIRD_PARTY_NOTICES.txt"))
shutil.copy2(ROOT / "LICENSE", package / "LICENSE.txt")
# Keep the portable archive consistent with the corrected executable and notices.
shutil.make_archive(str(package), "zip", package.parent, package.name)
script = ROOT / "dist/package/FuxWX.iss"
compiler = shutil.which("ISCC")
if not compiler or not script.is_file():
    raise SystemExit("Inno Setup 6 or generated package script is missing")
# nsh generates the script; compile it again after adding the license files.
languages = localize(script, Path(compiler), ROOT / "assets/installer/languages")
print(f"Installer languages: {len(languages)}; follows Windows display language")
run(compiler, "/Qp", "/O" + str(script.parent), str(script))
built = ROOT / "dist/package/FuxWX-setup.exe"
if not built.is_file():
    raise SystemExit("Inno Setup did not produce the expected installer")
release = ROOT / f"dist/releases/FuxWX-{metadata['version']}.exe"
release.parent.mkdir(parents=True, exist_ok=True)
os.replace(built, release)
digest = hashlib.sha256(release.read_bytes()).hexdigest()
release.with_suffix(".exe.sha256").write_text(f"{digest}  {release.name}\n", encoding="utf-8")
(release.parent / "build-summary.json").write_text(json.dumps({"version": metadata["version"], "installer": release.name,
    "bytes": release.stat().st_size, "sha256": digest, "source": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "dirty": bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True)), "nsh": "0.7.1"}, indent=2)+"\n", encoding="utf-8")
print(f"{release}\nSHA-256 {digest}")
