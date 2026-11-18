"""Tests for attribution.py: Brand's exact format, refusals, no way to rename or hide the block, the positive check, and parallel builds into one
folder (CDN_TEST_REPEATS repeats, default 20). No network."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
sys.path.insert(0, SRC)
import attribution as A  # noqa: E402

CLI = os.path.join(SRC, "attribution.py")
REPEATS = int(os.environ.get("CDN_TEST_REPEATS", "20"))
COMMIT = "7e6c083c691299caf5133e7eb02e417dc949c193"
GOOD = dict(name="Private Local Chat", version="2.0.0", commit=COMMIT, licence="AGPL-3.0-only",
            source="https://forge.aiofourown.com/programme/source-archives/releases/download/privatelocalchat-v2.0.0-7e6c083c/privatelocalchat-7e6c083c-source.tar.gz")


class Base(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(prefix="attr-")
        self.addCleanup(shutil.rmtree, self.d, True)

    def run_cli(self, *args):
        return subprocess.run([sys.executable, CLI, *args], capture_output=True, text=True, timeout=60)

    def write_good(self, **over):
        rec = A.validate(**dict(GOOD, **over))
        A.write(self.d, rec)
        open(os.path.join(self.d, "LICENSE"), "w").write("licence text\n")
        return rec


class Format(Base):
    def test_notice_is_exactly_brands_format(self):
        rec = A.validate(**GOOD)
        self.assertEqual(A.notice_text(rec).split("\n"), [
            "# Private Local Chat 2.0.0", "from ai of our own", "Built from commit " + COMMIT, "Licence: AGPL-3.0-only", "Source: " + GOOD["source"], ""])

    def test_json_has_the_same_five_fields_and_both_files_agree(self):
        self.write_good()
        rec = json.load(open(os.path.join(self.d, "attribution.json")))
        self.assertEqual(sorted(rec), ["commit", "licence", "name", "source", "version"])
        self.assertTrue(open(os.path.join(self.d, "NOTICE.md")).read().startswith(A.notice_text(rec)))

    def test_licence_is_data(self):
        for lic in ("AGPL-3.0-only", "GPL-3.0-only", "GPL-3.0-or-later", "Apache-2.0", "MIT OR Apache-2.0"):
            self.assertEqual(A.validate(**dict(GOOD, licence=lic))["licence"], lic)

    def test_the_html_fragment_is_escaped_and_comes_from_the_record(self):
        rec = A.validate(**dict(GOOD, name="A <b>&</b> app"))
        frag = A.html_fragment(rec)
        self.assertNotIn("<b>", frag)
        self.assertIn("&lt;b&gt;", frag)
        self.assertIn("from ai of our own", frag)
        self.assertIn(COMMIT, frag)


class Refusals(Base):
    def test_bad_commit_forms(self):
        for bad in ("7e6c083", COMMIT.upper(), COMMIT[:39], COMMIT + "0", "g" * 40, ""):
            with self.assertRaises(A.Bad, msg=bad):
                A.validate(**dict(GOOD, commit=bad))

    def test_source_must_be_on_the_shared_pattern(self):
        for bad in ("http://forge.aiofourown.com/programme/x", "https://example.com/x.tar.gz", "https://forge.aiofourown.com/other/x",
                    "https://cdn.aiofourown.com/sonalon/models/x.tar.gz", "https://forge.aiofourown.com.evil.example/programme/x",
                    "https://forge.aiofourown.com/programme/x?utm=1", "javascript:alert(1)"):
            with self.assertRaises(A.Bad, msg=bad):
                A.validate(**dict(GOOD, source=bad))

    def test_a_repository_root_is_allowed_without_naming_the_commit(self):
        A.validate(**dict(GOOD, source="https://forge.aiofourown.com/programme/privatelocalchat"))

    def test_an_archive_url_must_name_the_build(self):
        other = "https://cdn.aiofourown.com/sonalon/source/sonalon-someothertag.tar.gz"
        with self.assertRaises(A.Bad):
            A.validate(**dict(GOOD, source=other))
        A.validate(**dict(GOOD, source=other, build_id="someothertag"))                 # named by the build id
        A.validate(**dict(GOOD, source="https://cdn.aiofourown.com/sonalon/source/sonalon-%s.tar.gz" % COMMIT))   # named by the full commit

    def test_bad_name_version_and_licence(self):
        for k, v in (("name", ""), ("name", "line\nbreak"), ("version", "a b"), ("version", ""), ("licence", "AGPL 3"), ("licence", "")):
            with self.assertRaises(A.Bad, msg=(k, v)):
                A.validate(**dict(GOOD, **{k: v}))

    def test_there_is_no_way_to_rename_the_app_or_hide_or_change_the_block(self):
        r = self.run_cli("write", "--help")
        for word in ("rename", "hide", "omit", "skip", "disable", "white", "brand", "from-line", "tagline"):
            self.assertNotIn(word, r.stdout.lower(), word)
        self.assertEqual(A.FROM_LINE, "from ai of our own")


class Cli(Base):
    def test_write_from_json_then_check_passes(self):
        meta = os.path.join(self.d, "meta.json")
        json.dump(dict(GOOD), open(meta, "w"))
        out = os.path.join(self.d, "build")
        open(os.path.join(self.d, "LICENSE"), "w").write("x")
        r = self.run_cli("write", out, "--from-json", meta, "--html", os.path.join(self.d, "about.html"))
        self.assertEqual(r.returncode, 0, r.stderr)
        shutil.copy(os.path.join(self.d, "LICENSE"), os.path.join(out, "LICENSE"))
        self.assertEqual(self.run_cli("check", out).returncode, 0)
        self.assertTrue(os.path.exists(os.path.join(self.d, "about.html")))

    def test_bad_input_exits_2_and_writes_nothing(self):
        out = os.path.join(self.d, "build")
        r = self.run_cli("write", out, "--name", "X", "--version", "1", "--commit", "abc", "--licence", "MIT", "--source", "https://forge.aiofourown.com/programme/x")
        self.assertEqual(r.returncode, 2)
        self.assertFalse(os.path.exists(os.path.join(out, "NOTICE.md")))

    def test_source_txt_can_be_the_notice_file(self):
        rec = A.validate(**GOOD)
        A.write(self.d, rec, notice_name="SOURCE.txt")
        open(os.path.join(self.d, "LICENSE"), "w").write("x")
        self.assertEqual(A.check(self.d), [])
        with self.assertRaises(A.Bad):
            A.write(self.d, rec, notice_name="README.md")


class Check(Base):
    def test_a_good_folder_passes_and_a_layer_may_add_after_the_block(self):
        self.write_good()
        with open(os.path.join(self.d, "NOTICE.md"), "a") as f:
            f.write("\nA site layer adds a line here.\n")
        self.assertEqual(A.check(self.d), [])

    def test_removing_or_changing_any_part_fails(self):
        self.write_good()
        path = os.path.join(self.d, "NOTICE.md")
        original = open(path).read()
        cases = {"from line removed": original.replace("from ai of our own\n", ""), "commit changed": original.replace(COMMIT, "0" * 40),
                 "licence changed": original.replace("AGPL-3.0-only", "MIT"), "emptied": "", "block moved down": "Hello\n" + original}
        for label, text in cases.items():
            open(path, "w").write(text)
            self.assertTrue(A.check(self.d), label)
        open(path, "w").write(original)
        self.assertEqual(A.check(self.d), [])
        os.remove(path)
        self.assertTrue(any("NOTICE" in p for p in A.check(self.d)))

    def test_missing_json_licence_file_or_extra_fields_fail(self):
        self.write_good()
        os.remove(os.path.join(self.d, "LICENSE"))
        self.assertTrue(any("LICENSE" in p for p in A.check(self.d)))
        open(os.path.join(self.d, "LICENSE"), "w").write("x")
        rec = json.load(open(os.path.join(self.d, "attribution.json")))
        rec["tagline"] = "ours"
        json.dump(rec, open(os.path.join(self.d, "attribution.json"), "w"))
        self.assertTrue(A.check(self.d))
        os.remove(os.path.join(self.d, "attribution.json"))
        self.assertTrue(any("attribution.json" in p for p in A.check(self.d)))


class NarrowExemption(Base):
    """Brand: our name and hosts appear in these files ONLY as the from-line and the matching Source URL; a second mention still fails."""

    def test_a_second_mention_after_the_block_fails_even_though_the_block_itself_is_fine(self):
        self.write_good()
        path = os.path.join(self.d, "NOTICE.md")
        for extra in ("Visit ai of our own for more.", "Part of aiofourown.", "See https://aiofourown.com/", "Cosmoshot", "mirror at https://cdn.aiofourown.com/x",
                      "AI of Our Own", "ai-of-our-own", "hosted at privatelocal.chat"):
            open(path, "w").write(A.notice_text(json.load(open(os.path.join(self.d, "attribution.json")))) + "\n" + extra + "\n")
            self.assertTrue(any("mentions" in p for p in A.check(self.d)), extra)

    def test_neutral_text_after_the_block_is_fine(self):
        self.write_good()
        with open(os.path.join(self.d, "NOTICE.md"), "a") as f:
            f.write("\nThis copy is run by whoever installed it, who is responsible for it.\n")
        self.assertEqual(A.check(self.d), [])

    def test_our_name_in_the_application_name_or_the_json_fails(self):
        for bad in ("ai of our own Chat", "AIofourown notes"):
            with tempfile.TemporaryDirectory() as t:
                rec = A.validate(**dict(GOOD, name=bad))
                A.write(t, rec)
                open(os.path.join(t, "LICENSE"), "w").write("x")
                self.assertTrue(any("mentions" in p for p in A.check(t)), bad)

    def test_the_from_line_and_the_matching_source_url_alone_are_exempt(self):
        self.write_good()
        self.assertEqual(A.check(self.d), [])                       # the sample itself names forge.aiofourown.com once, in the Source URL


class ArchiveCheck(Base):
    def make_tar(self, wrapper=None, mutate=None, extra=None):
        build = os.path.join(self.d, "build")
        shutil.rmtree(build, ignore_errors=True)
        A.write(build, A.validate(**GOOD))
        open(os.path.join(build, "LICENSE"), "w").write("licence\n")
        if mutate:
            mutate(build)
        for name, text in (extra or {}).items():
            open(os.path.join(build, name), "w").write(text)
        out = os.path.join(self.d, "release.tar.gz")
        import tarfile
        with tarfile.open(out, "w:gz") as t:
            t.add(build, arcname=wrapper or ".")
        return out

    def test_a_good_release_archive_passes_with_or_without_a_wrapper_folder(self):
        self.assertEqual(A.check_archive(self.make_tar()), [])
        self.assertEqual(A.check_archive(self.make_tar(wrapper="privatelocalchat-2.0.0")), [])

    def test_a_site_layer_may_add_after_the_block_in_the_archive_but_never_change_or_remove_it(self):
        def add(b):
            with open(os.path.join(b, "NOTICE.md"), "a") as f:
                f.write("\nPlain extra text.\n")
        self.assertEqual(A.check_archive(self.make_tar(mutate=add)), [])

        def change(b):
            p = os.path.join(b, "NOTICE.md")
            open(p, "w").write(open(p).read().replace("AGPL-3.0-only", "MIT"))
        self.assertTrue(A.check_archive(self.make_tar(mutate=change)))

        def remove(b):
            p = os.path.join(b, "NOTICE.md")
            open(p, "w").write(open(p).read().replace("from ai of our own\n", ""))
        self.assertTrue(A.check_archive(self.make_tar(mutate=remove)))

        def delete(b):
            os.remove(os.path.join(b, "NOTICE.md"))
        self.assertTrue(A.check_archive(self.make_tar(mutate=delete)))

    def test_an_archive_without_the_record_or_with_unsafe_members_is_refused(self):
        import tarfile
        out = os.path.join(self.d, "empty.tar.gz")
        with tarfile.open(out, "w:gz") as t:
            f = os.path.join(self.d, "x.txt")
            open(f, "w").write("x")
            t.add(f, arcname="x.txt")
        self.assertTrue(any("no attribution.json" in p for p in A.check_archive(out)))
        evil = os.path.join(self.d, "evil.tar.gz")
        with tarfile.open(evil, "w:gz") as t:
            info = tarfile.TarInfo("../escape.txt")
            info.size = 1
            import io
            t.addfile(info, io.BytesIO(b"x"))
        self.assertTrue(any("escapes" in p for p in A.check_archive(evil)))
        link = os.path.join(self.d, "link.tar.gz")
        with tarfile.open(link, "w:gz") as t:
            info = tarfile.TarInfo("a")
            info.type = tarfile.SYMTYPE
            info.linkname = "/etc/passwd"
            t.addfile(info)
        self.assertTrue(any("link" in p for p in A.check_archive(link)))
        self.assertFalse(os.path.exists(os.path.join(os.path.dirname(self.d), "escape.txt")))

    def test_the_cli_checks_an_archive_and_a_zip(self):
        arc = self.make_tar()
        r = self.run_cli("check", arc)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        import zipfile
        z = os.path.join(self.d, "release.zip")
        build = os.path.join(self.d, "build")
        with zipfile.ZipFile(z, "w") as zf:
            for f in os.listdir(build):
                zf.write(os.path.join(build, f), arcname=f)
        self.assertEqual(self.run_cli("check", z).returncode, 0)


class Concurrency(Base):
    def test_parallel_builds_into_one_folder_never_leave_a_mix(self):
        variants = [dict(GOOD, version="1.%d.0" % i, commit=("%x" % (i + 1)) * 40 if False else ("%040x" % (i + 1)),
                         source="https://forge.aiofourown.com/programme/privatelocalchat") for i in range(6)]
        for rep in range(REPEATS):
            with self.subTest(repeat=rep):
                out = os.path.join(self.d, "r%d" % rep)
                procs = [subprocess.Popen([sys.executable, CLI, "write", out, "--name", v["name"], "--version", v["version"], "--commit", v["commit"],
                                           "--licence", v["licence"], "--source", v["source"]], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                         for v in variants]
                for p in procs:
                    p.communicate(timeout=60)
                    self.assertEqual(p.returncode, 0)
                open(os.path.join(out, "LICENSE"), "w").write("x")
                self.assertEqual(A.check(out), [])                      # NOTICE.md and attribution.json belong to the SAME build
                self.assertEqual(sorted(f for f in os.listdir(out) if f.startswith(".")), [])   # no temp file left behind


if __name__ == "__main__":
    unittest.main()
