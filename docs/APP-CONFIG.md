# App configuration and model sources

The app does not name where its model files come from. A configuration says so, and the build writes it into the page.

## Files

- **`app-config.json`** at the repository root: the shipped defaults.

  ```
  { "format": "plc-app-config/1",
    "modelSources": [ { "id": "project-cdn", "label": "Private Local Chat project CDN", "base": "https://assets.privatelocal.chat/models/" } ] }
  ```

- **`config/app-config.json`**: an operator's choices, outside the tracked tree (an upgrade never writes it). If present, its `modelSources` **replace** the shipped list whole; they are never merged entry by entry. `APP_CONFIG_OVERRIDE` names a different file for a build: unset means `./config/app-config.json` if it exists, empty means none, and a path that does not exist is an error.

A source has an `id` (lower-case letters, digits, hyphens), a short `label`, and a `base`: an `https://` address or a path on the copy's own host (a single leading `/`). The base is the root that holds `<name>/<revision>/<files>`, the layout of the project's bucket (`docs/CDN-POPULATION.md`). **The first source is used.** Further sources are validated and reserved; nothing uses them yet.

The build checks both files (`checkAppConfig`): an unknown key, a bad address, a repeated id or another format stops it with the reason. It then writes the result into `index.html` as `window.APP_CONFIG`, with `overridden` saying whether an operator's list is in use. There is no extra request and nothing for the offline copy to save.

## In the app

`runtime/config/app-config.mjs` is the only code that knows the shape: `appConfig().modelRoot()`, `.activeSource()`, `.isDefaultSource()`. Without a configuration (a worker, or a test that has not installed one) it throws a plain error rather than using an address of ours; tests import `tests/helpers/install-app-config.mjs` first, which installs what the build would.

The catalog (`runtime/providers/catalog.mjs`), the voices (`chat/voice/voice-manifest*.mjs`) and the memory embedding set (`chat/embedding/embedding-config.mjs`) join the root to the folder each model lives in (`<name>/<revision>/`, kept in `runtime/providers/catalog-data.mjs` as `dir`). No default names Hugging Face, GitHub or any host other than the configured root.

## Integrity

A source decides where bytes come from, never what they are. Every file is checked against the size and SHA-256 pinned in the app (catalog, voice manifests, embedding set) before it is used, from any source. A source that serves other bytes is refused.

## What you see

- **Settings, Models, Model source** (read-only): the label and host in use, and "set by whoever runs this copy" when it is not the shipped source. The choice is made in the copy's configuration, not in the app.
- **Settings, Models, Model source, Updates** (read-only): "This copy is updated by whoever hosts it." It is shown whenever the site manifest has no `site` identity, that is, on every copy that is not our own site, including one whose operator chose their own model source (a wider condition than the notice below, which also needs the shipped source). It is never shown on our own site. It adds no stored key, link or request.
- **The model-source notice**: the first time a download is about to start, on a copy that uses the shipped source and has no site identity in its manifest (that is, a copy that is not our own site), the app says the models come from the project's content delivery network, names the host, and says where to set another source. Download goes on; Cancel stops it. It is shown once (`plc.modelSourceNotice.v1`). It is not shown on our own site, nor when the operator chose the source.

## Existing downloads

Downloaded files are cached on the device by their address. The default addresses are unchanged by this configuration (`docs/evidence/split/model-urls-baseline.json` records all 310), so nobody downloads again. An operator who changes the source downloads again from the new one.

## Site identity

The page head (canonical, Open Graph and social-card addresses, structured data), the share address, the address a settings transfer link opens, and what the assistant says about the host come from the site manifest's `site` block (`docs/SITE-LINKS.md`), not from the app. Without that block the head names no site, nothing offers to share an address, a transfer link opens the copy that made it (`location.origin`), and the assistant says nothing about a host.

## Tests

- `tests/app-config.test.mjs`: the module, the build's checks, the operator override.
- `tests/model-urls.test.mjs`: with the shipped configuration the app requests exactly the 310 addresses in the baseline, each with its pin; every address is under the configured root; an operator source changes only the root.
- `tests/site-identity.test.mjs`: the `site` block, the assistant's sentences, the share panel, and the page head with and without it.
- `tests/e2e/model-sources.e2e.mjs`: four builds in a real browser: our site, a copy that is not our site (notice first, once; declining downloads nothing), an operator's source (only it is asked; wrong bytes are refused).
- `tests/e2e/site-identity.e2e.mjs`: the three Share entry points and the share dialog with and without a site identity.
