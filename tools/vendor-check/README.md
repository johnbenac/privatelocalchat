# vendor-check

Pins and checks vendored shared components (task T560, objective O162). One file, Python 3 standard library only.

    python3 vendor_check.py check --root .                 # offline: re-hash every vendored file against vendor.lock.json
    python3 vendor_check.py check --root . --fetch         # also compare the forge registry's digest with the pin
    python3 vendor_check.py check --root . --verify-content
    python3 vendor_check.py pin --root . --name N --owner TEAM --version V --path DIR [--package-type generic ...]

The rules are in VENDORING.md. Vendor this package like any other component: put the files in your repository (for example
`tools/vendor-check/`), pin them with `pin`, and run `check` in your own tests, so no application depends on /cosmoshot/tools.
Exit codes: 0 fine, 1 mismatch, 2 bad lock or arguments, 4 registry unreachable. Licence: AGPL-3.0-only (see LICENSE).
