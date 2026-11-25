"""Compare the pinned native runtime with GitHub's latest official stable release."""
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
headers = {"User-Agent": "FuxWX-build", "Accept": "application/vnd.github+json"}
# Anonymous API calls are rate limited per IP; an optional token from the environment avoids that.
token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
if token:
    headers["Authorization"] = f"Bearer {token}"
request = urllib.request.Request("https://api.github.com/repos/longbridge/nsh/releases/latest", headers=headers)
with urllib.request.urlopen(request, timeout=30) as response:
    release = json.load(response)
pinned = next(item["version"] for item in json.loads((ROOT / "third_party/manifests/sources.json").read_text(encoding="utf-8")) if item["name"] == "nsh")
if release["draft"] or release["prerelease"] or release["tag_name"] != "v" + pinned:
    raise SystemExit(f"nsh stable changed: pinned {pinned}, official {release['tag_name']}; update and verify before packaging")
print(f"nsh {pinned}: current official stable ({release['published_at']})")
