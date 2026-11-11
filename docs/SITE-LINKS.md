# Links to our pages

The app never names one of our pages itself. Where the pages are comes from a small manifest, so a copy served without our site links to none of them and nothing is left behind.

## The manifest

`site.json` at the repository root (for now; the private site repository takes it over later):

```
{ "format": "plc-site/1", "pages": { "help": "/help/", "about": "/about/", "privacy": "/privacy/", "updates": "/updates/" } }
```

- A value is a path on the same host (one leading `/`) or an absolute `https://` address, so an operator can point Help at their own page.
- A page that is absent, or whose value is neither, does not exist for this copy.
- `SITE_JSON_PATH` chooses the file for a build: unset means `./site.json` if it exists, an empty value means none, and a path that does not exist is an error. A build with no manifest is a neutral copy.
- The build checks the manifest (`checkSiteJson`): an unknown page name, an invalid value or another format stops it with the reason. It then writes the validated result into `index.html` as `window.SITE_LINKS`, beside `window.APP_BUILD` and `window.SITE_CONFIG`. There is no extra request and nothing for the offline copy to save.
- `site-config.json` is separate: it holds facts about the operator (support address, discussion space, hosting logs) that fill sections of the generated pages. `site.json` says where the pages are.

## In the app

`chat/site/site-links.mjs` is the only code that knows the shape: `siteLinks().has(page)` and `siteLinks().href(page, anchor)`, which gives the address with an optional `#anchor` or `null`. Callers draw nothing for `null`. Anchors (`help` with `faq`) belong to the app; a neutral help page without one opens at the top.

| Surface | File | Without the page |
| --- | --- | --- |
| Help & about | `chat/transfer/transfer-ui.mjs` | the row is not drawn; with none, the list and the sentence about it go |
| Settings, About | `chat/shell/shell.mjs` | no Privacy row |
| Model page | `chat/shell/models-page.mjs` | no "Trouble?" line |
| Failed reply, download hint, welcome setup | `chat/core/messages-view.mjs` | no Get help link |
| Speech messages | `chat/voice/voice-ui.mjs` | no Get help button |
| Welcome screen | `index.html` (`data-site-page`) | the link is removed |
| New-version notice | `index.html`, inline script | no What changed link |

The source link, the releases link and Report a problem point at the project's public GitHub repository, not at our pages. They stay in every copy and are not part of the manifest.

## Rules

- A new link to one of our pages goes through `siteLinks()` and draws nothing when it is `null`. `tests/site-links.test.mjs` fails when app code names `/help/`, `/about/`, `/privacy/` or `/updates/` anywhere else.
- A new page needs a name in `PAGES`, a row in the table above and a surface in `tests/links/surfaces.mjs`.

## Tests

- `tests/site-links.test.mjs`: the rules of the module, the manifest check, and the no-bypass scan.
- `tests/e2e/site-links.e2e.mjs`: three builds in a real browser. With our manifest every surface matches `docs/evidence/split/links-baseline.json`, recorded by `scripts/links-snapshot.mjs record` from the app as it was before the manifest existed. With no manifest none of our pages is linked and no empty list, row or sentence is left. Without Privacy only the Privacy links go.
- The baseline is changed only on purpose, when a link is deliberately added or removed.
