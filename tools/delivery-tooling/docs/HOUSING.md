# Housing

* Working copy: `/cosmoshot/delivery-tooling`. Origin: `ssh://git@gitlab.benac.dev:32224/cosmoshot/delivery-tooling.git`, branch `main`.
* Nothing is kept out of git: the repository holds only small source and documents. No second copy of a store is needed.
* A fresh clone needs only `git` and `/usr/bin/python3` (and Node 20 or newer for PLC's parts once they are moved here).
* When it is published: a versioned generic package on `https://forge.aiofourown.com` (`devops/delivery-tooling`), pinned by each application.
* A public mirror of the source is not requested yet; it would be listed in `/cosmoshot/tools/ops/forge-mirrors.json`.
* How a version is built (from 1.2.1): `git archive HEAD`, then without the agent files (`AGENTS.md`, `CLAUDE.md`, `.claude`, `.agents`, `.github`, `program.json`, `.releaserc.cjs`, `.gitignore`), so an application that vendors it does not receive instructions meant for agents working in this repository. Published with `/cosmoshot/tools/ops/forge_package.py --name delivery-tooling --version V --owner devops --src DIR --license-name AGPL-3.0-only --license-file LICENSE --apply`. Versions 1.0.0 to 1.2.0 carry the agent files and are unchanged.
* Node: the scan and validator tests run with `node --test scan/tests/ validator/tests/` on Node 20 or newer, without dependencies.
