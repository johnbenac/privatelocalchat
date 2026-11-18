# Vendoring shared components

Task T560 under objective O160. The rule for sharing code between the programme's applications without sharing a
repository: one team owns a component, publishes it as a versioned package on the forge, and every other application keeps a
**pinned copy** in its own repository and refuses to build or test if the bytes differ. The check is
`ops/vendor_check.py` (standard library only, tests in `ops/tests/test_vendor_check.py`).

## What counts as a shared component

A folder or file that **two or more applications use unchanged**: a provider adapter, a speech or model runtime, a schema, a
small library. Code only one application uses stays in that application. Third-party code the application uses (a runtime, a
model loader) is vendored by the same rules, with its upstream licence kept beside it; its owner is the team that brought it in.

## Rules

1. **One owner per component.** The owner is a team (plc, cosmogenitor, sonalon, ...). Only the owner changes the source and
   publishes versions; others take versions, they never edit their copy. A change another team needs is asked of the owner on
   the board task that needs it.
2. **Extraction when a second application needs the same code.** The first copy-and-paste is tolerated once; when a second
   application needs it, the owner extracts it and publishes version 1.0.0 of a package; both applications then vendor that
   version instead of keeping two diverging copies.
3. **Exact versions, never ranges.** A version is a string such as `1.4.2`. `latest`, `*`, `^1.0.0` and `~1.0.0` are refused.
4. **Pinned by SHA-256.** The lock records the SHA-256 of the vendored copy (the *tree hash*) and, when the component is
   published as a package, the SHA-256 of the package file. A build refuses different bytes.
5. **Updates are deliberate.** Taking a new version is one commit that runs `vendor_check.py pin` for the new version, replaces
   the folder with the new files, and changes the lock. Nobody updates "on the way past".
6. **Vendored files are read-only to the application.** No local patches. If the application needs a change, the owner
   publishes a new version. An edit is detected and refused by the check (the file name is reported).
7. **No code is fetched at run time.** The vendored copy is in the application's repository and release. The registry is used
   to *verify* a pin and to *fetch a new version when someone takes an update*, never when the application starts.
8. **Licences travel with the copy.** The component's licence file and notice are inside the vendored folder (they are hashed
   with it). The application's own licence statement lists the component and its version.
9. **Retention.** The forge keeps the last six versions of a package. A pin to a version that has been retired still works (the
   copy is in the repository), but `--fetch` then reports that the registry no longer has it; take a newer version.

## The lock file

`vendor.lock.json` in the application root (schema `aiofourown-vendor-lock/1`). `vendor_check.py pin` writes it:

    {"schema": "aiofourown-vendor-lock/1",
     "components": [{
        "name": "plc-provider", "owner": "plc", "version": "1.4.2",
        "path": "src/vendor/plc",                    // folder or single file inside the application
        "tree_sha256": "...",                        // sha256 of the sorted lines "<file sha256>  <relative path>"
        "files": {"index.js": "<sha256>", ...},      // per-file hashes, so a mismatch names the file
        "license": "GPL-3.0",
        "package": {"type": "generic", "file": "plc-provider-1.4.2.tar.gz", "sha256": "..."}   // when published on the forge
     }]}

## Publishing a package (the owner)

The shared helper does all of the below: `/usr/bin/python3 /cosmoshot/tools/ops/forge_package.py --name N --version V --owner TEAM --src DIR
--license-name AGPL-3.0-only --license-file LICENSE [--apply]` (tarball, MANIFEST.json, SHA256SUMS, read-back, the consumer's pin command). By
hand it is:

Registry: `https://forge.aiofourown.com/api/packages/<team>/...` (each team has its own publisher user; reads are public).

* generic: `PUT .../generic/<name>/<version>/<file>` with the team's token (a root-only file under
  `/root/.config/aiofourown/forge-tokens/`), and read it back at the same URL;
* npm: `https://forge.aiofourown.com/api/packages/<team>/npm/` as the registry for `npm publish`.

The forge lists each file's SHA-256 at `/api/v1/packages/<team>/<type>/<name>/<version>/files`; put that digest in the lock's
`package.sha256` (or compute it yourself from the file you published).

## The check an application runs

    /usr/bin/python3 /cosmoshot/tools/ops/vendor_check.py check --root .             # offline: re-hash every vendored file
    /usr/bin/python3 /cosmoshot/tools/ops/vendor_check.py check --root . --fetch     # also compare the registry's digest with the pin
    /usr/bin/python3 /cosmoshot/tools/ops/vendor_check.py check --root . --verify-content   # generic packages: download it and compare files

Run the offline form in the application's own tests (a test that runs the command and expects exit 0), and `--fetch` when a pin
is taken or in a periodic check. Exit codes: 0 fine, 1 a vendored file differs, is missing or was added (or the registry's
digest differs), 2 the lock is wrong, 4 the registry could not be reached (never a pass).

## Taking or changing a pin

    cp -r <new files> src/vendor/plc                 # replace the folder with the new version's files
    /usr/bin/python3 /cosmoshot/tools/ops/vendor_check.py pin --root . --name plc-provider --owner plc --version 1.4.3 \
        --path src/vendor/plc --license GPL-3.0 --package-type generic --package-file plc-provider-1.4.3.tar.gz \
        --package-sha256 <digest from the forge>
    /usr/bin/python3 /cosmoshot/tools/ops/vendor_check.py check --root . --fetch

Commit the folder and the lock together. Concurrent `pin` runs on one lock never lose an entry (the lock is held while it is
rewritten).
