"""Compare the pinned native runtime with GitHub's latest official stable release."""
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
request = urllib.request.Request("https://api.github.com/repos/longbridge/nsh/releases/latest", headers={"User-Agent": "FuxWX-build"})
with urllib.request.urlopen(request, timeout=30) as response:
    release = json.load(response)
pinned = next(item["version"] for item in json.loads((ROOT / "third_party/manifests/sources.json").read_text(encoding="utf-8")) if item["name"] == "nsh")
if release["draft"] or release["prerelease"] or release["tag_name"] != "v" + pinned:
    raise SystemExit(f"nsh stable changed: pinned {pinned}, official {release['tag_name']}; update and verify before packaging")
print(f"nsh {pinned}: current official stable ({release['published_at']})")
