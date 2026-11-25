"""Record resolved Windows runtime dependencies and ship their license texts."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1])
metadata = json.loads(subprocess.check_output([
    "cargo", "metadata", "--format-version", "1", "--locked", "--filter-platform", "x86_64-pc-windows-msvc",
    "--manifest-path", str(ROOT / ".nsh/rust/windows-app/Cargo.toml"), "--no-default-features", "--features", "js,svg"
], cwd=ROOT))
packages = {p["id"]: p for p in metadata["packages"]}
graph = {n["id"]: n["dependencies"] for n in metadata["resolve"]["nodes"]}
pending = [p["id"] for p in packages.values() if p["name"] == "nsh-app-fuxwx-native-windows-app"]
used = set()
while pending:
    item = pending.pop()
    if item in used:
        continue
    used.add(item)
    pending.extend(graph.get(item, []))

parts = ["FuxWX — Third-party notices\n", (ROOT / "LICENSE").read_text(encoding="utf-8")]
for path in sorted((ROOT / "third_party/licenses").glob("*")):
    parts.append(f"\n=== {path.name} ===\n{path.read_text(encoding='utf-8')}")
parts.append("Solar Linear icons: Solar Icons Set by 480 Design (CC BY 4.0); package by Hakim Saoudi (MIT)\nhttps://github.com/saoudi-h/solar-icons\nFunctional icons are tinted for FuxWX. The separate FuxWX logo was supplied by the project owner (LicenseRef-FuxWX-Brand).")
records = []
missing = []
for key in sorted(used, key=lambda key: packages[key]["name"]):
    p = packages[key]
    if p["source"] is None:
        continue
    folder = Path(p["manifest_path"]).parent
    files = sorted({*folder.glob("LICENSE*"), *folder.glob("LICENCE*"), *folder.glob("COPYING*"), *folder.glob("NOTICE*")})
    if p.get("license_file"):
        files.append(folder / p["license_file"])
    files = sorted({f for f in files if f.is_file()})
    if not p.get("license") and not files:
        missing.append(p["name"])
    parts.append(f"\n=== {p['name']} {p['version']} ===\nLicense: {p.get('license')}\n{p.get('repository') or p['source']}\nAuthors: {', '.join(p.get('authors', []))}\n")
    evidence = []
    for path in files:
        data = path.read_bytes()
        parts.append(data.decode("utf-8", errors="replace"))
        evidence.append({"file": path.relative_to(folder).as_posix(), "sha256": hashlib.sha256(data).hexdigest()})
    records.append({"name": p["name"], "version": p["version"], "source": p["source"], "repository": p.get("repository"),
                    "license": p.get("license"), "licenseFiles": evidence})
if missing:
    raise SystemExit("Unresolved dependency licenses: " + ", ".join(missing))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text("\n".join(parts), encoding="utf-8")
(ROOT / "third_party/manifests/rust-dependencies.json").write_text(json.dumps(records, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(f"Recorded {len(records)} runtime/build dependencies; notices: {output}")
