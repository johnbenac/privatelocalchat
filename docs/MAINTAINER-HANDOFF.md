# Private Local Chat: maintainer handoff

> **Open task needing the Cloudflare token: populate the CDN with the search model. See [CDN-POPULATION.md](CDN-POPULATION.md), top box.**

This is the practical starting point for a maintainer with access to the GitHub repository and Cloudflare account. GitHub is the source of truth for the application and its deployment workflow. Cloudflare Pages serves the application; Cloudflare R2 and its CDN serve the model files. A home server is not needed to serve the app.

| Purpose | Source | Deployment |
| --- | --- | --- |
| Development | `dev` | [dev.privatelocal.chat](https://dev.privatelocal.chat), Pages project `privatelocalchat-dev` |
| Production | `main` | [privatelocal.chat](https://privatelocal.chat), Pages project `privatelocalchat` |
| Model distribution | Versioned R2 objects and app catalogue | [assets.privatelocal.chat](https://assets.privatelocal.chat/models/catalog.json), R2 bucket `privatelocalchat-assets` |

The repository is [johnbenac/privatelocalchat](https://github.com/johnbenac/privatelocalchat). `privatelocal.chat` is canonical; `privatelocalchat.com` redirects to it. GitHub also hosts [feedback](https://github.com/johnbenac/privatelocalchat/issues/new/choose). GitHub Pages does not host the app.

## Make and deploy a change

Use Node.js 22 and Python 3. Clone the repository and start from the current development branch:

```sh
git clone git@github.com:johnbenac/privatelocalchat.git
cd privatelocalchat
git switch dev
git pull --ff-only origin dev
npm ci
```

Make a change, review it, and run the same validation as CI:

```sh
npm test
python3 -m unittest discover -s dev-tools/tests -v
DEPLOY_BRANCH=dev npm run build
node scripts/serve.mjs
```

The local server listens at `http://127.0.0.1:18171`. A build made here uses the neutral pages in `run-kit/`; to build as production does, check out the private site repository (`johnbenac/privatelocalchat-site`, same branch name) and set `SITE_DIR` to it. For a production build, run `DEPLOY_BRANCH=main npm run build`; each build replaces `dist/`. A feature branch and pull request into `dev` are suitable for review. Once the change is on `dev`, pushing it triggers deployment automatically. For a direct change on `dev`, commit the intended files and run `git push origin dev`.

Inspect [GitHub Actions](https://github.com/johnbenac/privatelocalchat/actions/workflows/deploy.yml), or use:

```sh
gh run list --workflow deploy.yml --branch dev --limit 5
gh run watch RUN_ID --exit-status
```

Replace `RUN_ID` with the relevant run ID. Wait for success, then check the development custom domain and exercise the changed behavior. To promote the tested source, merge `dev` into `main` (for example, with a GitHub pull request) and push or merge to `main`. The `main` push triggers the production deployment. Check its Actions run and the production custom domain. The sites are built from the same product source: development adds diagnostics; production builds exclude that machinery. Do not maintain a separate product implementation on the two branches.

## What CI does and how to verify it

[deploy.yml](../.github/workflows/deploy.yml) checks out the exact pushed commit, installs dependencies, fetches the private site layer on the same branch (`docs/SITE-LAYER.md`), runs the Node and Python tests and the site's own tests, builds for the branch with that site layer, and uploads `dist/` to its Cloudflare Pages project with Wrangler. It skips an older commit if the branch has advanced before deployment. It then verifies the Pages project URL's commit, branch, app shell, isolation headers, and source and feedback links. The workflow can also be run manually in Actions, selecting `dev` or `main`. Repository Actions secrets are `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `SITE_DEPLOY_KEY`; never put their values in Git, chat, or logs.

CI checks the Pages project hostname, so independently verify the **custom domain** after each deploy. From a checkout at the exact deployed commit:

```sh
DEPLOY_SITE_URL=https://dev.privatelocal.chat GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=dev node scripts/verify-release.mjs
# For a checkout of the production commit:
DEPLOY_SITE_URL=https://privatelocal.chat GITHUB_SHA=$(git rev-parse HEAD) GITHUB_REF_NAME=main node scripts/verify-release.mjs
```

Alternatively inspect `/version.json` on the relevant site and compare its full commit and branch to GitHub. Deployment success verifies delivery, not model inference. For a runtime change, also load a model and generate on the devices and browsers affected; exercise offline reopening where relevant. Record the device, build, prompts, and outcome without exposing private content. [Release acceptance](ACCEPTANCE.md) and the [iPhone investigation](IPHONE-INVESTIGATION.md) contain historical results; some status statements there predate later deployments, so check dates and current evidence rather than treating every statement as current.

## Models, diagnostics, and storage

The app references pinned model files delivered from R2/CDN; deploying a site change does not upload a model. Follow [deployment and model operations](OPERATIONS.md) for publishing immutable model objects, verifying sizes and hashes, updating the catalogue, cache behavior, and rollback. Preserve older objects for older app releases. The 2B download is about 1.20 GB and the 9B download about 5.06 GB; downloaded storage and working memory are separate. WebGPU support and available device resources constrain which models run.

Development diagnostics are documented in [DEV-DIAGNOSTICS.md](DEV-DIAGNOSTICS.md). Treat diagnostic endpoints and captured prompts and responses as sensitive; enable capture only with the device user's informed consent. Keep diagnostics out of production builds. The iPhone investigation identified an important compiler-control change in the native WebAssembly runtime; follow [runtime provenance](RUNTIMES.md) before rebuilding or replacing pinned runtime artifacts. Do not assume a newer compiler or changed runtime is equivalent without parity and device testing.

Repeated large model tests can consume substantial persistent browser storage, including in separate browser profiles or web-app contexts. Use a dedicated test profile, track downloads, and clean up the test-owned storage when finished. Do not clear unrelated user data. Unloading a model from memory is not necessarily deletion of its downloaded files. For practical iOS storage and compiler lessons, see the local Praxes guide `safari-wasm-pwa/iphone-local-llm-release-and-storage.md` when that knowledge repository is available.

## If a release fails

Inspect the failed job with `gh run view RUN_ID --log-failed`. A failed test prevents deployment; a superseded commit may be deliberately skipped. For a bad deployed change, revert it on the affected branch and let CI deploy the revert. Cloudflare Pages also offers a deployment rollback, but reconcile source afterward or a later push can restore the bad version. See [operations](OPERATIONS.md) for details, then verify the custom domain and the affected behavior again.
