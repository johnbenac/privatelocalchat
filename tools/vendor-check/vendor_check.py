#!/usr/bin/python3
"""Pin and check vendored shared components (task T560). Standard library only. Rules: docs/VENDORING.md.

    vendor_check.py check [--lock vendor.lock.json] [--root DIR] [--fetch] [--verify-content] [--json]
    vendor_check.py pin   --name NAME --owner TEAM --version V --path REL [--lock vendor.lock.json] [--root DIR]
                          [--package-type generic|npm --package-file FILE --package-sha256 HEX] [--license SPDX] [--note TEXT]

An app keeps `vendor.lock.json` and runs `vendor_check.py check` in its own tests. For every component the lock records the
owning team, the exact version, the folder (or single file) where the copy lives, and the SHA-256 of that copy: the "tree hash",
the SHA-256 of the sorted lines `<file sha256>  <relative path>` of every file in it. The check refuses (exit 1) when
* a vendored file differs from, is missing from, or is added to the pinned set (an edit, a partial update, a stray file);
* with --fetch: the forge registry's SHA-256 for the pinned package file differs from the pin (a package re-published
  under the same version);
* with --verify-content (generic tar/tar.gz packages): the files inside the downloaded package are not the vendored copy.
`pin` writes or refreshes one entry: that is the deliberate act of taking an update, visible in the commit that changes the lock.
Versions are exact: no ranges, no "latest". Exit codes: 0 fine, 1 mismatch, 2 bad lock or arguments, 4 registry unreachable.
"""
import argparse
import fcntl
import hashlib
import io
import json
import os
import re
import sys
import tarfile
import urllib.error
import urllib.parse
import urllib.request

__version__ = "1.0.0"
SCHEMA = "aiofourown-vendor-lock/1"
REGISTRY = os.environ.get("COSMO_FORGE_URL", "https://forge.aiofourown.com")
NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,80}")
VERSION_RE = re.compile(r"[0-9A-Za-z][0-9A-Za-z._+-]{0,60}")
SHA_RE = re.compile(r"[0-9a-f]{64}")
OWNERS = ("plc", "cosmogenitor", "sonalon", "cyberplanetary", "platform", "devops", "infra", "aiofourown", "memory", "brand",
          "concepts", "business", "simulator")


class Bad(Exception):
    def __init__(self, msg, code=2):
        super().__init__(msg)
        self.code = code


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def file_list(root, rel):
    """-> sorted [(relative path, sha256)] of a vendored folder or single file. Refuses links and special files."""
    full = os.path.join(root, rel)
    if os.path.islink(full):
        raise Bad("%s is a link; vendored copies are real files" % rel, 1)
    if os.path.isfile(full):
        return [(os.path.basename(rel), sha256_bytes(open(full, "rb").read()))]
    if not os.path.isdir(full):
        raise Bad("%s does not exist" % rel, 1)
    out = []
    for base, dirs, files in os.walk(full, followlinks=False):
        dirs.sort()
        for n in sorted(files):
            p = os.path.join(base, n)
            if os.path.islink(p) or not os.path.isfile(p):
                raise Bad("%s is a link or special file" % os.path.relpath(p, root), 1)
            out.append((os.path.relpath(p, full).replace(os.sep, "/"), sha256_bytes(open(p, "rb").read())))
    return sorted(out)


def tree_hash(files):
    return sha256_bytes("".join("%s  %s\n" % (h, p) for p, h in sorted(files)).encode())


def load_lock(path):
    try:
        lock = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Bad("cannot read the lock %s: %s" % (path, type(e).__name__))
    if not isinstance(lock, dict) or lock.get("schema") != SCHEMA or not isinstance(lock.get("components"), list):
        raise Bad("%s is not a %s file" % (path, SCHEMA))
    seen = set()
    for c in lock["components"]:
        if not isinstance(c, dict):
            raise Bad("a component entry is not an object")
        name = c.get("name")
        if not (isinstance(name, str) and NAME_RE.fullmatch(name)) or name in seen:
            raise Bad("component name %r is missing, unsafe or repeated" % (name,))
        seen.add(name)
        if c.get("owner") not in OWNERS:
            raise Bad("%s: owner %r is not a team (%s)" % (name, c.get("owner"), ", ".join(OWNERS)))
        if not (isinstance(c.get("version"), str) and VERSION_RE.fullmatch(c["version"])) or c["version"] in ("latest", "*"):
            raise Bad("%s: version must be an exact version, not %r" % (name, c.get("version")))
        p = c.get("path")
        if not isinstance(p, str) or not p or p.startswith("/") or ".." in p.split("/"):
            raise Bad("%s: path %r must be a relative path inside the app" % (name, p))
        if not (isinstance(c.get("tree_sha256"), str) and SHA_RE.fullmatch(c["tree_sha256"])):
            raise Bad("%s: tree_sha256 must be 64 lower-case hex digits" % name)
        pk = c.get("package")
        if pk is not None and not (isinstance(pk, dict) and pk.get("type") in ("generic", "npm") and
                                   isinstance(pk.get("sha256"), str) and SHA_RE.fullmatch(pk["sha256"]) and pk.get("file")):
            raise Bad("%s: package needs type (generic or npm), file and a 64-hex sha256" % name)
    return lock


def http_get(url, timeout=60):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "cosmoshot-vendor-check"}), timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except (urllib.error.URLError, OSError) as e:
        raise Bad("the registry is unreachable (%s)" % type(e).__name__, 4)


def registry_digest(c, forge):
    """The registry's SHA-256 for the pinned package file, or None when it lists no such file."""
    pk = c["package"]
    url = "%s/api/v1/packages/%s/%s/%s/%s/files" % (forge.rstrip("/"), urllib.parse.quote(c["owner"]), pk["type"],
                                                     urllib.parse.quote(pk.get("name") or c["name"], safe=""), urllib.parse.quote(c["version"]))
    st, body = http_get(url)
    if st == 404:
        return None
    if st != 200:
        raise Bad("the registry answered HTTP %s for %s" % (st, url), 4)
    for f in json.loads(body):
        if f.get("name") == pk["file"]:
            return f.get("sha256")
    return None


def package_tree(c, forge):
    """Download a generic tar/tar.gz package and return its files as [(path, sha256)], after checking the pinned archive hash."""
    pk = c["package"]
    url = "%s/api/packages/%s/generic/%s/%s/%s" % (forge.rstrip("/"), urllib.parse.quote(c["owner"]),
                                                    urllib.parse.quote(pk.get("name") or c["name"], safe=""), urllib.parse.quote(c["version"]),
                                                    urllib.parse.quote(pk["file"]))
    st, data = http_get(url, 300)
    if st != 200:
        raise Bad("the package file could not be downloaded (HTTP %s)" % st, 4)
    if sha256_bytes(data) != pk["sha256"]:
        raise Bad("the downloaded package differs from the pinned SHA-256", 1)
    out = []
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        for m in sorted(tf.getmembers(), key=lambda m: m.name):
            if m.isfile():
                name = m.name[2:] if m.name.startswith("./") else m.name
                out.append((name, sha256_bytes(tf.extractfile(m).read())))
    return sorted(out)


def check(lock, root, fetch=False, verify_content=False, forge=REGISTRY):
    problems = []
    for c in lock["components"]:
        name = c["name"]
        try:
            files = file_list(root, c["path"])
        except Bad as e:
            problems.append({"component": name, "problem": str(e)})
            continue
        got = tree_hash(files)
        if got != c["tree_sha256"]:
            pinned = c.get("files")
            detail = ""
            if isinstance(pinned, dict):
                now = dict(files)
                changed = sorted(p for p in now if p in pinned and now[p] != pinned[p])
                added = sorted(p for p in now if p not in pinned)
                gone = sorted(p for p in pinned if p not in now)
                detail = "; changed: %s; added: %s; missing: %s" % (changed[:8], added[:8], gone[:8])
            problems.append({"component": name, "problem": "the vendored copy at %s differs from the pin (tree sha256 %s, pinned %s)%s" %
                             (c["path"], got[:12], c["tree_sha256"][:12], detail)})
        if fetch and c.get("package"):
            d = registry_digest(c, forge)
            if d is None:
                problems.append({"component": name, "problem": "the registry has no %s %s %s" % (c["package"]["type"], c["version"], c["package"]["file"])})
            elif d != c["package"]["sha256"]:
                problems.append({"component": name, "problem": "the registry's SHA-256 for %s is %s, the pin is %s: the package was "
                                 "re-published under the same version" % (c["package"]["file"], d[:12], c["package"]["sha256"][:12])})
        if verify_content and c.get("package") and c["package"]["type"] == "generic":
            if tree_hash(package_tree(c, forge)) != tree_hash(files):
                problems.append({"component": name, "problem": "the files inside the published package are not the vendored copy"})
    return problems


def pin(args):
    root = os.path.abspath(args.root)
    lock_path = args.lock if os.path.isabs(args.lock) else os.path.join(root, args.lock)
    if not NAME_RE.fullmatch(args.name) or args.owner not in OWNERS or not VERSION_RE.fullmatch(args.version) or args.version in ("latest", "*"):
        raise Bad("name, owner (a team) and an exact version are required")
    if not args.path or args.path.startswith("/") or ".." in args.path.split("/"):
        raise Bad("--path must be a relative path inside the app, without ..")
    files = file_list(root, args.path)
    entry = {"name": args.name, "owner": args.owner, "version": args.version, "path": args.path,
             "tree_sha256": tree_hash(files), "files": dict(files)}
    if args.license:
        entry["license"] = args.license
    if args.package_type:
        if not (args.package_file and args.package_sha256 and SHA_RE.fullmatch(args.package_sha256)):
            raise Bad("--package-type needs --package-file and a 64-hex --package-sha256")
        entry["package"] = {"type": args.package_type, "file": args.package_file, "sha256": args.package_sha256}
    if args.note:
        entry["note"] = args.note
    lock_dir = os.open(os.path.dirname(os.path.abspath(lock_path)), os.O_RDONLY)   # the folder is the lock: no file is left behind
    try:                                                      # two pins at once must not lose each other's entry
        fcntl.flock(lock_dir, fcntl.LOCK_EX)
        lock = {"schema": SCHEMA, "components": []}
        if os.path.exists(lock_path):
            lock = load_lock(lock_path)
        lock["components"] = sorted([c for c in lock["components"] if c["name"] != args.name] + [entry], key=lambda c: c["name"])
        tmp = lock_path + ".tmp-%d" % os.getpid()
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(lock, f, indent=2, sort_keys=True)
            f.write("\n")
        os.replace(tmp, lock_path)
    finally:
        os.close(lock_dir)
    return {"pinned": args.name, "version": args.version, "files": len(files), "tree_sha256": entry["tree_sha256"], "lock": lock_path}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--version", action="version", version="vendor_check " + __version__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    p = sub.add_parser("pin")
    for s in (c, p):
        s.add_argument("--lock", default="vendor.lock.json")
        s.add_argument("--root", default=".")
    c.add_argument("--fetch", action="store_true")
    c.add_argument("--verify-content", action="store_true")
    c.add_argument("--forge", default=REGISTRY)
    c.add_argument("--json", action="store_true")
    p.add_argument("--name", required=True)
    p.add_argument("--owner", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--path", required=True)
    p.add_argument("--license")
    p.add_argument("--note")
    p.add_argument("--package-type", choices=("generic", "npm"))
    p.add_argument("--package-file")
    p.add_argument("--package-sha256")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "pin":
            print(json.dumps(pin(args), indent=2))
            return 0
        root = os.path.abspath(args.root)
        lock = load_lock(args.lock if os.path.isabs(args.lock) else os.path.join(root, args.lock))
        problems = check(lock, root, args.fetch, args.verify_content, args.forge)
        if args.json:
            print(json.dumps({"ok": not problems, "components": len(lock["components"]), "problems": problems}, indent=2))
        elif problems:
            for pr in problems:
                print("REFUSED %s: %s" % (pr["component"], pr["problem"]))
        else:
            print("ok: %d vendored component(s) match their pins" % len(lock["components"]))
        return 1 if problems else 0
    except Bad as e:
        print("vendor_check: %s" % e, file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
