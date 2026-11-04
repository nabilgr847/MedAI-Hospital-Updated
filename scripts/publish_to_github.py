#!/usr/bin/env python3
"""Publish this project folder to a GitHub repository root in one commit.

Run from the extracted project root. The script deliberately replaces the target
branch's root tree so the repository matches this project exactly. It never reads
or uploads .env files, credentials, dependency folders, private uploads, or build output.
"""
import argparse
import base64
import getpass
import json
import mimetypes
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

EXCLUDE_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", "coverage", "__pycache__", "private_uploads", "uploads", "storage"}
EXCLUDE_NAMES = {".env", ".DS_Store"}
EXCLUDE_SUFFIXES = {".pyc", ".log"}


def api(token, method, path, payload=None):
    url = "https://api.github.com" + path
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MedAI-Hospital-publisher",
        **({"Content-Type": "application/json"} if data is not None else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            raw = res.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:1200]
        raise RuntimeError(f"GitHub API returned HTTP {e.code} for {method} {path}: {detail}") from e


def included_files(root):
    found = []
    for base, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in EXCLUDE_DIRS)
        for name in sorted(files):
            p = Path(base) / name
            rel = p.relative_to(root).as_posix()
            if name in EXCLUDE_NAMES or name.startswith(".env.") or p.suffix.lower() in EXCLUDE_SUFFIXES:
                continue
            if name.endswith(".pem") or name.endswith(".key"):
                continue
            if any(part in EXCLUDE_DIRS for part in p.parts):
                continue
            found.append((p, rel))
    return found


def main():
    ap = argparse.ArgumentParser(description="Publish MedAI Hospital project to a GitHub repo root.")
    ap.add_argument("--repo", required=True, help="GitHub repository, e.g. nabilgr847/MedAI-Hospital-V2")
    ap.add_argument("--branch", default="main", help="Target branch (default: main)")
    ap.add_argument("--message", default="Publish MedAI Hospital V2.3 communication and analysis update", help="Commit message")
    args = ap.parse_args()
    if args.repo.count("/") != 1:
        ap.error("--repo must be OWNER/REPOSITORY")
    root = Path.cwd().resolve()
    if not (root / "apps" / "web" / "src" / "App.tsx").exists() or not (root / "apps" / "api" / "src" / "routes.js").exists():
        ap.error("Run this script from the extracted MedAI_Hospital_V2_1_Fixed project root")
    files = included_files(root)
    print(f"Project root: {root}\nFiles to publish: {len(files)}\nTarget: https://github.com/{args.repo}/tree/{args.branch}")
    print("WARNING: this replaces the target branch's root file tree with this project. Files not present here will be removed from that branch.")
    if input('Type REPLACE to continue: ').strip() != "REPLACE":
        print("Cancelled; no changes made.")
        return 2
    token = os.getenv("GITHUB_TOKEN") or getpass.getpass("GitHub token (Contents: read/write; input hidden): ").strip()
    if not token:
        print("No token provided.", file=sys.stderr)
        return 2
    owner, repo = args.repo.split("/", 1)
    repo_data = api(token, "GET", f"/repos/{owner}/{repo}")
    if repo_data.get("archived"):
        raise RuntimeError("Target repository is archived")
    if not repo_data.get("permissions", {}).get("push", False):
        raise RuntimeError("Token does not have push permission for this repository")
    ref = api(token, "GET", f"/repos/{owner}/{repo}/git/ref/heads/{args.branch}")
    parent_sha = ref["object"]["sha"]
    commit = api(token, "GET", f"/repos/{owner}/{repo}/git/commits/{parent_sha}")
    tree_entries = []
    for index, (path, rel) in enumerate(files, start=1):
        data = path.read_bytes()
        blob = api(token, "POST", f"/repos/{owner}/{repo}/git/blobs", {
            "content": base64.b64encode(data).decode("ascii"), "encoding": "base64"
        })
        mode = "100755" if os.access(path, os.X_OK) else "100644"
        tree_entries.append({"path": rel, "mode": mode, "type": "blob", "sha": blob["sha"]})
        print(f"[{index}/{len(files)}] prepared {rel}")
    new_tree = api(token, "POST", f"/repos/{owner}/{repo}/git/trees", {"tree": tree_entries})
    new_commit = api(token, "POST", f"/repos/{owner}/{repo}/git/commits", {
        "message": args.message, "tree": new_tree["sha"], "parents": [parent_sha]
    })
    api(token, "PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{args.branch}", {"sha": new_commit["sha"], "force": False})
    print("\nPublished successfully:")
    print(f"https://github.com/{args.repo}/commit/{new_commit['sha']}")
    print(f"https://github.com/{args.repo}/tree/{args.branch}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, KeyError, urllib.error.URLError) as exc:
        print(f"Publish failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
