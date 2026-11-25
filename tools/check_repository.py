"""Check the staged Git blobs; never print secret contents."""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

MAX_BYTES = 2 * 1024 * 1024
PRIVATE = {".local", ".nsh", "_temp", "output", "dist", "target", "node_modules", "__pycache__"}
SECRET = re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")
MACHINE = re.compile(r"[A-Za-z]:[\\/](?:Users|Data|_Free code|_BIGFAFree)[\\/]", re.I)


def git(root, *args, data=None, check=True):
    return subprocess.run(["git", "-C", str(root), *args], input=data, capture_output=True, check=check).stdout


def staged(root):
    entries = []
    for entry in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, oid, stage = metadata.decode().split()
        entries.append((name.decode("utf-8"), mode, oid, stage))
    # One Git process reads all blobs, including files changed after staging.
    payload = git(root, "cat-file", "--batch", data=b"".join((e[2] + "\n").encode() for e in entries))
    blobs, offset = {}, 0
    for name, mode, oid, stage in entries:
        end = payload.index(b"\n", offset)
        size = int(payload[offset:end].rsplit(b" ", 1)[1])
        blobs[name] = payload[end + 1:end + 1 + size]
        offset = end + size + 2
    return entries, blobs


def check(root):
    root = Path(root)
    errors = []
    entries, blobs = staged(root)
    if not entries:
        return ["index is empty"]
    rules = blobs.get(".gitignore", b"")
    if not (root / ".gitignore").is_file() or (root / ".gitignore").read_bytes().replace(b"\r\n", b"\n") != rules:
        errors.append(".gitignore differs from staged version")
    active = [line.strip() for line in rules.decode("utf-8", errors="replace").splitlines()
              if line.strip() and not line.startswith("#")]
    if not active or active[-1] != "**/_temp/":
        errors.append(".gitignore must end with **/_temp/")
    probes = [".local/private", "dist/package.exe", "nested/_temp/private"]
    ignored = git(root, "check-ignore", "--no-index", "--stdin", "-z",
                  data=b"\0".join(p.encode() for p in probes) + b"\0", check=False).split(b"\0")
    if any(p.encode() not in ignored for p in probes):
        errors.append("local boundary probes are not ignored")
    tracked_ignored = git(root, "check-ignore", "--no-index", "--stdin", "-z",
                         data=b"\0".join(n.encode() for n in blobs) + b"\0", check=False)
    if tracked_ignored.strip(b"\0"):
        errors.append("index contains ignored files")
    try:
        binaries = {item["path"]: item for item in json.loads(blobs.get("third_party/binaries.json", b"[]"))}
    except (ValueError, KeyError, TypeError):
        binaries = {}
        errors.append("invalid binary manifest")
    folded = set()
    for name, mode, oid, stage in entries:
        data = blobs[name]
        parts = PurePosixPath(name).parts
        if stage != "0" or mode not in {"100644", "100755"}:
            errors.append(f"{name}: unsupported mode or unresolved conflict")
        if any(p in PRIVATE for p in parts):
            errors.append(f"{name}: local-only path")
        if name.casefold() in folded:
            errors.append(f"{name}: case collision")
        folded.add(name.casefold())
        if any(re.search(r'[<>:"\\|?*]|[ .]$', p) or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", p, re.I) for p in parts):
            errors.append(f"{name}: invalid Windows filename")
        if len(data) > MAX_BYTES:
            errors.append(f"{name}: exceeds size limit")
        if SECRET.search(data):
            errors.append(f"{name}: potential credential")
        if name in binaries:
            entry = binaries[name]
            if not entry.get("source") or not entry.get("license") or entry.get("bytes") != len(data) or entry.get("sha256") != hashlib.sha256(data).hexdigest():
                errors.append(f"{name}: binary registration mismatch")
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            errors.append(f"{name}: invalid UTF-8 or unregistered binary")
            continue
        if "\0" in text or text.startswith("\ufeff"):
            errors.append(f"{name}: NUL or BOM")
        if MACHINE.search(text):
            errors.append(f"{name}: machine-specific absolute path")
        if name.endswith(".json"):
            try:
                json.loads(text)
            except ValueError:
                errors.append(f"{name}: invalid JSON")
        if name.endswith(".md"):
            for target in re.findall(r"\]\(([^\s)]+)\)", text):
                if ":" in target or target.startswith("#"):
                    continue
                target = target.split("#", 1)[0]
                resolved = (root / name).parent.joinpath(target).resolve()
                try:
                    relative = resolved.relative_to(root.resolve()).as_posix()
                except ValueError:
                    relative = ""
                if relative not in blobs:
                    errors.append(f"{name}: missing staged link target {target}")
    if "third_party/manifests/icons.json" in blobs:
        for entry in json.loads(blobs["third_party/manifests/icons.json"]):
            data = blobs.get(entry["path"])
            if data is None or len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                errors.append(f"{entry['path']}: Solar source registration mismatch")
    return errors


if __name__ == "__main__":
    findings = check(Path(__file__).resolve().parents[1])
    for finding in findings:
        print(finding)
    print(f"Repository check: {len(findings)} issue(s)")
    sys.exit(bool(findings))
