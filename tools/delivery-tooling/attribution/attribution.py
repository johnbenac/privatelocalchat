#!/usr/bin/env python3
"""The attribution generator of the neutral-delivery contract (O165, T736; the contract is /cosmoshot/tools/docs/DELIVERY-CONTRACT-DRAFT.md).

A neutral build must always say where it came from. This writes that statement from a build's own metadata, in Brand's exact format, so the scan
can check it and the About page can print it from the same record:

    NOTICE.md          # NAME VERSION
                       from ai of our own
                       Built from commit <40 hex>
                       Licence: <SPDX id>
                       Source: <URL>
    attribution.json   {"name", "version", "commit", "licence", "source"}   (same five fields, one record for the scan and the About page)

    attribution.py write OUTDIR --name N --version V --commit C --licence SPDX --source URL [--build-id ID] [--html FILE] [--notice-name NOTICE.md|SOURCE.txt]
    attribution.py write OUTDIR --from-json build-metadata.json            (keys name, version, commit, licence, source, optional build_id)
    attribution.py check DIR_OR_ARCHIVE                                    (the positive check a scan needs: the block is there and consistent, our name and hosts appear
                                                                            only as the from-line and the Source URL; exit 1 if not; also on a released archive)

Rules, by design:
* There is NO option to rename the application or to leave the block out, and the words "from ai of our own" are a constant, not a parameter. A site layer
  may add text after the block; it cannot remove it (the check fails a folder that lost any of it).
* The commit is the full 40 lower-case hex characters. The licence is data (an SPDX identifier, for example AGPL-3.0-only or GPL-3.0-only); its text ships as LICENSE.
* The source is either a repository root `https://forge.aiofourown.com/programme/<repo>` or a source ARCHIVE URL on the forge
  (`https://forge.aiofourown.com/programme/source-archives/releases/download/<tag>/<file>`) or on the CDN (`https://cdn.aiofourown.com/<app>/source/<file>`);
  an archive URL must name the build: the full commit, its first 8 characters, or the --build-id.
* Both files are written together, atomically, under a lock, so two builds into one folder never leave a mix. Python standard library only.
Exit codes: 0 done, 1 the check failed, 2 bad input.
"""
import argparse
import fcntl
import html
import json
import os
import re
import shutil
import sys
import tempfile

FROM_LINE = "from ai of our own"
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
SPDX_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9.+-]*(?: (?:WITH|AND|OR) [A-Za-z0-9][A-Za-z0-9.+-]*)*")
NAME_RE = re.compile(r"[^\s\x00-\x1f][^\x00-\x1f]{0,79}")
VERSION_RE = re.compile(r"[0-9A-Za-z][0-9A-Za-z._+-]{0,63}")
FORGE_ROOT_RE = re.compile(r"https://forge\.aiofourown\.com/programme/[a-z0-9][a-z0-9._-]{0,80}/?")
FORGE_ARCHIVE_RE = re.compile(r"https://forge\.aiofourown\.com/programme/source-archives/releases/download/[A-Za-z0-9._+-]+/[A-Za-z0-9._+-]+")
CDN_ARCHIVE_RE = re.compile(r"https://cdn\.aiofourown\.com/[a-z0-9][a-z0-9-]{0,40}/source/[A-Za-z0-9._+-]+")
NOTICE_NAMES = ("NOTICE.md", "SOURCE.txt")
# Brand's narrow exemption: in these files our family name and our hosts may appear ONLY as the "from ai of our own" line and the matching Source URL.
# A second mention (in the title, after the block, in the JSON name) still fails.
FAMILY_RE = re.compile(r"ai[ _-]*of[ _-]*our[ _-]*own|aiofourown|cosmoshot", re.I)
HOST_RE = re.compile(r"aiofourown\.com|benac\.dev|privatelocal\.chat|sonalon\.com|cosmogenitor\.com|cyberplanetary\.org|\.pages\.dev|\.workers\.dev", re.I)
FIELDS = ("name", "version", "commit", "licence", "source")


class Bad(Exception):
    pass


def validate(name, version, commit, licence, source, build_id=None):
    name, version, commit, licence, source = (str(x).strip() for x in (name, version, commit, licence, source))
    if not NAME_RE.fullmatch(name) or "\n" in name:
        raise Bad("the application name must be one line of up to 80 characters")
    if not VERSION_RE.fullmatch(version):
        raise Bad("the version must be letters, digits and . _ + -")
    if not COMMIT_RE.fullmatch(commit):
        raise Bad("the commit must be the full 40 lower-case hex characters")
    if not SPDX_RE.fullmatch(licence):
        raise Bad("the licence must be an SPDX identifier such as AGPL-3.0-only")
    if FORGE_ROOT_RE.fullmatch(source):
        pass                                                  # a repository root: the commit is printed beside it
    elif FORGE_ARCHIVE_RE.fullmatch(source) or CDN_ARCHIVE_RE.fullmatch(source):
        names = [commit, commit[:8]] + ([str(build_id)] if build_id else [])
        if not any(n and n in source for n in names):
            raise Bad("a source archive URL must name the build: the commit, its first 8 characters or the build id")
    else:
        raise Bad("the source must be https://forge.aiofourown.com/programme/<repo>, a forge release archive, or "
                  "https://cdn.aiofourown.com/<app>/source/<file>")
    return {"name": name, "version": version, "commit": commit, "licence": licence, "source": source}


def notice_text(a):
    return "# %s %s\n%s\nBuilt from commit %s\nLicence: %s\nSource: %s\n" % (a["name"], a["version"], FROM_LINE, a["commit"], a["licence"], a["source"])


def html_fragment(a):
    """The About page region, escaped: one paragraph from the same record."""
    return ("<p class=\"attribution\">%s %s &middot; %s<br>Built from commit %s &middot; Licence: %s<br>Source: <a href=\"%s\">%s</a></p>\n" % (
        html.escape(a["name"]), html.escape(a["version"]), html.escape(FROM_LINE), a["commit"], html.escape(a["licence"]),
        html.escape(a["source"], quote=True), html.escape(a["source"])))


def _atomic(path, text):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), prefix=".attribution.")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def write(outdir, record, notice_name="NOTICE.md", html_path=None):
    if notice_name not in NOTICE_NAMES:
        raise Bad("the notice file is NOTICE.md or SOURCE.txt")
    os.makedirs(outdir, exist_ok=True)
    fd = os.open(outdir, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)                       # both files are one record: never a mix of two builds
        _atomic(os.path.join(outdir, notice_name), notice_text(record))
        _atomic(os.path.join(outdir, "attribution.json"), json.dumps(record, indent=2, sort_keys=True) + "\n")
        if html_path:
            _atomic(html_path, html_fragment(record))
    finally:
        os.close(fd)
    return record


def second_mentions(text, source):
    """What is left of our name and hosts once the one allowed from-line and the one matching Source URL are taken out."""
    rest = text.replace(FROM_LINE, "", 1).replace(source, "", 1)
    return sorted({m.group(0).lower() for m in FAMILY_RE.finditer(rest)} | {m.group(0).lower() for m in HOST_RE.finditer(rest)})


def check(folder):
    """The positive check: -> list of problems (empty when the block is there, whole and consistent).
    Also fails a second mention of our name or hosts in the notice files and attribution.json (Brand's narrow exemption)."""
    problems = []
    try:
        rec = json.load(open(os.path.join(folder, "attribution.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return ["attribution.json is missing or is not JSON"]
    if sorted(rec) != sorted(FIELDS):
        problems.append("attribution.json must hold exactly: " + ", ".join(FIELDS))
        return problems
    try:
        validate(rec["name"], rec["version"], rec["commit"], rec["licence"], rec["source"])
    except Bad as e:
        problems.append("attribution.json: " + str(e))
    try:
        jtext = open(os.path.join(folder, "attribution.json"), encoding="utf-8").read()
        extra = second_mentions(jtext.replace("\\/", "/"), rec["source"]) if isinstance(rec.get("source"), str) else []
        if extra:
            problems.append("attribution.json mentions " + ", ".join(extra) + " outside the source URL")
    except OSError:
        pass
    found = [n for n in NOTICE_NAMES if os.path.isfile(os.path.join(folder, n))]
    if not found:
        problems.append("neither NOTICE.md nor SOURCE.txt exists")
    for n in found:
        try:
            text = open(os.path.join(folder, n), encoding="utf-8").read()
        except OSError:
            problems.append(n + " cannot be read")
            continue
        if not text.startswith(notice_text(rec)):            # a site layer may add AFTER the block, never change or remove it
            problems.append(n + " does not start with the attribution block of attribution.json")
        extra = second_mentions(text, rec["source"])
        if extra:
            problems.append(n + " mentions " + ", ".join(extra) + " more than the one from-line and the Source URL")
    if not os.path.isfile(os.path.join(folder, "LICENSE")):
        problems.append("LICENSE does not exist")
    return problems


def check_archive(path, limit_bytes=2 * 1024 ** 3):
    """The same check on a RELEASED archive (.tar.gz, .tgz, .tar or .zip): unpack safely into a scratch folder, find the build root (the folder
    holding attribution.json, at the top or one wrapper folder down) and check it. Absolute or escaping paths and links are refused."""
    import tarfile
    import zipfile
    tmp = tempfile.mkdtemp(prefix="attribution-archive-")
    try:
        total = 0
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as z:
                for i in z.infolist():
                    total += i.file_size
                    dest = os.path.realpath(os.path.join(tmp, i.filename))
                    if i.filename.startswith("/") or not dest.startswith(os.path.realpath(tmp) + os.sep) and dest != os.path.realpath(tmp):
                        return ["the archive holds a path that escapes its folder: " + i.filename]
                    if total > limit_bytes:
                        return ["the archive is larger than %d bytes unpacked" % limit_bytes]
                z.extractall(tmp)
        else:
            try:
                t = tarfile.open(path)
            except (tarfile.TarError, OSError):
                return ["the archive cannot be read as tar or zip"]
            with t:
                for m in t.getmembers():
                    total += max(m.size, 0)
                    dest = os.path.realpath(os.path.join(tmp, m.name))
                    if m.name.startswith("/") or not (dest + os.sep).startswith(os.path.realpath(tmp) + os.sep):
                        return ["the archive holds a path that escapes its folder: " + m.name]
                    if m.issym() or m.islnk() or m.isdev():
                        return ["the archive holds a link or device: " + m.name]
                    if total > limit_bytes:
                        return ["the archive is larger than %d bytes unpacked" % limit_bytes]
                t.extractall(tmp)
        roots = [tmp] + [os.path.join(tmp, d) for d in sorted(os.listdir(tmp)) if os.path.isdir(os.path.join(tmp, d))]
        for r in roots:
            if os.path.isfile(os.path.join(r, "attribution.json")):
                return check(r)
        return ["no attribution.json at the top of the archive or one folder down"]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("outdir")
    w.add_argument("--from-json")
    for k in ("name", "version", "commit", "licence", "source", "build-id"):
        w.add_argument("--" + k)
    w.add_argument("--html")
    w.add_argument("--notice-name", default="NOTICE.md")
    c = sub.add_parser("check")
    c.add_argument("folder", help="a build folder, or a released archive (.tar.gz, .tgz, .tar, .zip)")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "check":
            problems = check_archive(a.folder) if os.path.isfile(a.folder) else check(a.folder)
            for p in problems:
                print("FAIL: " + p)
            print("attribution block present and consistent" if not problems else "%d problem(s)" % len(problems))
            return 1 if problems else 0
        meta = {}
        if a.from_json:
            try:
                meta = json.load(open(a.from_json, encoding="utf-8"))
            except (OSError, ValueError):
                raise Bad("cannot read %s as JSON" % a.from_json)
        pick = lambda k: getattr(a, k.replace("-", "_")) or meta.get(k.replace("-", "_"))
        missing = [k for k in FIELDS if not pick(k)]
        if missing:
            raise Bad("missing: " + ", ".join(missing))
        rec = validate(pick("name"), pick("version"), pick("commit"), pick("licence"), pick("source"), pick("build-id"))
        write(a.outdir, rec, a.notice_name, a.html)
        print(json.dumps(rec, sort_keys=True))
        return 0
    except Bad as e:
        print("attribution: " + str(e), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
