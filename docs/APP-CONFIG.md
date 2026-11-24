# App configuration and model sources

The app does not name where its model files come from. A configuration says so, and the build writes it into the page.

## Files

- **`app-config.json`** at the repository root: the shipped defaults.

  ```
  { "format": "plc-app-config/1",
    "modelSources": [ { "id": "project-cdn", "label": "Private Local Chat project CDN", "base": "https://cdn.aiofourown.com/models/" } ] }
  ```

- **`config/app-config.json`**: an operator's choices, outside the tracked tree (an upgrade never writes it). If present, its `modelSources` **replace** the shipped list whole; they are never merged entry by entry. `APP_CONFIG_OVERRIDE` names a different file for a build: unset means `./config/app-config.json` if it exists, empty means none, and a path that does not exist is an error.

A source has an `id` (lower-case letters, digits, hyphens), a short `label`, and a `base`: an `https://` address or a path on the copy's own host (a single leading `/`). The base is the root that holds `<name>/<revision>/<files>`, the layout of the project's bucket (`docs/CDN-POPULATION.md`). **The first source is used.** Further sources are validated and reserved; nothing uses them yet.

For a release copy that `serve.mjs --root` serves from an operator folder (`docs/RUN-IT.md`), `config/app-config.json` of that folder is applied when the page is served, not at build: `serve.mjs` checks it with the release's own `checkAppConfig`, and it replaces the shipped list whole in `window.APP_CONFIG`. An invalid file stops the server at start; while it runs, a file that becomes invalid is ignored with one line and the last good one stays in use. A copy behind another web server serves the shipped value.

The build checks both files (`checkAppConfig`): an unknown key, a bad address, a repeated id or another format stops it with the reason. It then writes the result into `index.html` as `window.APP_CONFIG`, with `overridden` saying whether an operator's list is in use. There is no extra request and nothing for the offline copy to save.

## In the app

`runtime/providers/app-config.mjs` is the only code that knows the shape: `appConfig().modelRoot()`, `.activeSource()`, `.isDefaultSource()`. Without a configuration (a worker, or a test that has not installed one) it throws a plain error rather than using an address of ours; tests import `tests/helpers/install-app-config.mjs` first, which installs what the build would.

The catalog (`runtime/providers/catalog.mjs`), the voices (`chat/voice/voice-manifest*.mjs`) and the memory embedding set (`chat/embedding/embedding-config.mjs`) join the root to the folder each model lives in (`<name>/<revision>/`, kept in `runtime/providers/catalog-data.mjs` as `dir`). No default names Hugging Face, GitHub or any host other than the configured root. The one exception to "everything joins the root" is the two WebLLM model libraries (`.wasm`, code): the catalog's `webllmLibBase` is the app's own `runtime/providers/vendor/webllm/libs/` (`docs/RUNTIMES.md`), so a model source never has to hold executable files. `model-urls-baseline.json` records them as `app:<path>`, and they are not in `models.json`. The embedding set is the one exception to the pinned files: the app pins no size or SHA-256 for it, only the content-addressed name of its folder (`DATA-HANDLING.md`, section 2d).

## Integrity

A source decides where bytes come from, never what they are. Every model file and voice file is checked against the size and SHA-256 pinned in the app (catalog, voice manifests) before it is used, from any source. A source that serves other bytes is refused. The memory embedding set is not checked: the app pins no files for it. Its folder name is content-addressed (`chat/embedding/embedding-config.mjs`), so a changed byte at the project's host is a new path, but a source you chose can serve other bytes at that path and the app does not notice. Section 2d of `DATA-HANDLING.md` says the same.

## What you see

- **Settings, Models, Model source** shows the operator source label and host, and lets the person choose a source for their language-model downloads.
- **Settings, Models, Model source, Updates** (read-only): "This copy is updated by whoever hosts it." It is shown whenever the site manifest has no `site` identity, that is, on every copy that is not our own site, including one whose operator chose their own model source (a wider condition than the notice below, which also needs the shipped source). It is never shown on our own site. It adds no stored key, link or request.
- **The model-source notice**: the first time a download is about to start, on a copy that uses the shipped source and has no site identity in its manifest (that is, a copy that is not our own site), the app says the models come from the project's content delivery network, names the host, and says where to set another source. Download goes on; Cancel stops it. It is shown once (`plc.modelSourceNotice.v1`). It is not shown on our own site, nor when the operator chose the source.

## Existing downloads

Downloaded files are cached on the device by their address. The shipped default root moved from `assets.privatelocal.chat` to `cdn.aiofourown.com` in T587 (2026-11-17, no users yet), so a copy that had downloaded from the old root downloads again once; before that the default addresses were unchanged by this configuration (`docs/evidence/split/model-urls-baseline.json` records all 310: 308 downloads and the two app-served libraries), so nobody downloads again. An operator who changes the source downloads again from the new one.

## Site identity

The page head (canonical, Open Graph and social-card addresses, structured data), the share address, the address a settings transfer link opens, and what the assistant says about the host come from the site manifest's `site` block (`docs/SITE-LINKS.md`), not from the app. Without that block the head names no site, nothing offers to share an address, a transfer link opens the copy that made it (`location.origin`), and the assistant says nothing about a host.

## Tests

- `tests/app-config.test.mjs`: the module, the build's checks, the operator override.
- `tests/model-urls.test.mjs`: with the shipped configuration the app requests exactly the 310 addresses in the baseline, each with its pin; every address is under the configured root; an operator source changes only the root.
- `tests/site-identity.test.mjs`: the `site` block, the assistant's sentences, the share panel, and the page head with and without it.
- `tests/e2e/model-sources.e2e.mjs`: four builds in a real browser: our site, a copy that is not our site (notice first, once; declining downloads nothing), an operator's source (only it is asked; wrong bytes are refused).
- `tests/e2e/site-identity.e2e.mjs`: the three Share entry points and the share dialog with and without a site identity.

## Personal language-model sources

In Settings → Models, add a source with a name and its model directory URL. Use HTTPS for remote sources. HTTP loopback is supported for a source on the same machine. The first personal source supplies language-model downloads that need bytes. Move another source to the top to select it, or remove all personal sources to return to the operator's source. Already installed models use the usual verified cache.

**Test source** requests one pinned Qwen configuration file and checks the returned range, size and SHA-256. A mirror can pass this test while still missing other files required by the selected model. Cross-origin servers must allow CORS and expose the `Content-Range` response header. The personal list follows the app's encryption setting and is independent of provider API tokens.

Set `"modelSourcePosture": "curated"` in the site's `site-config.json` to allow only the exact operator-configured model source bases. Neutral builds default to open. This policy applies to language-model sources in Settings.

For a gated source, select **Requires an API token** when adding it, then save the token on that source's row. Turn on the encrypted vault and **Remember API keys** to save and use source tokens in the vault's writable tab. The vault binds a token to the configured endpoint and source entry. Recreating a source requires entering its token again. Turning off key remembering or encryption makes these tokens unavailable. Tokens stay out of source descriptions and plain settings.

Use **Select local model files** or **Select a model folder** to supply the files for an existing pinned language-model profile. Select that model and choose **Install selected files** to verify and install the local bytes. A folder must contain every requested file that is missing from the verified cache. The file selection applies to this page until cleared or reloaded. Installed files remain in the model cache.
