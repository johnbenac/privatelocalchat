# Sharing and transfer

Three flows, deliberately separate, each with its own entry label, dialog title, scope text, icon and affirmative action.

| Flow | Entry | Dialog | What it moves | Main action |
|---|---|---|---|---|
| Public recommendation | **Share** (Explore menu and Settings > About) | Share Private Local Chat | The public address only | Share, or Copy link |
| Configuration | **Transfer settings** (Import export and transfer) | Transfer settings | Endpoint, model, theme, optionally an API token | Create transfer link |
| Conversation data | **Transfer chats and backups** (same section, and Storage & backups) | Transfer chats and backups | Conversations and app data, as files | Export saved conversations / Create protected backup |

Code: `chat/transfer/product-share.mjs` (fixed public payload and the share panel, also used on the public About and Help pages), `chat/transfer/settings-transfer.mjs` (format, encryption, readers; no DOM), `chat/transfer/transfer-ui.mjs` (the dialogs, import review, unlock, pending token), `chat/transfer/qr.mjs` (local QR, capacity check). The page owns storage and tokens and gives them to the dialogs through the `transferApp` facade in `index.html`.

## Share

The payload is built from three constants (`PRODUCT` in `product-share.mjs`): `https://privatelocal.chat/`, "Private Local Chat" and the product sentence. It never reads the current address, a conversation, settings, credentials or an imported transfer. `navigator.share` is called directly in the Share button's click handler (nothing is awaited first); cancelling the sheet is a finished action, not an error. Copy link is always present (primary where native sharing is missing) and the address is shown selectable when the clipboard is unavailable. The QR is generated locally from the same constant.

## Settings transfer, version 2

```
{ "format": "plc-settings-transfer/2",
  "settings": { "endpoint": "...", "model": "...", "theme": "dark" },
  "protectedToken": { "suite": "pbkdf2-sha256-aes256gcm/1", "salt": "...", "iv": "...", "ciphertext": "..." } }
```

* Link: `https://privatelocal.chat/#settings=` + unpadded Base64URL of the UTF-8 JSON. The fragment is not sent to the server on the page request. The same text is the QR content, and the downloaded file is the same envelope (`private-local-chat-settings.json`), all from one immutable snapshot created by the single affirmative action. Any edit to an included value, the token choice or the password withdraws the snapshot until it is created again.
* Settings are readable. Only the token is encrypted: PBKDF2-HMAC-SHA-256, 600,000 iterations, 16-byte random salt, non-extractable 256-bit AES key, AES-GCM with a 12-byte random IV and a 128-bit tag. The readable settings are authenticated as additionalData: `TextEncoder(JSON.stringify([format, suite, endpointIdentity, model, theme]))`, so a changed endpoint (host, path or query), model, theme or ciphertext prevents the token being accepted while the ordinary settings stay reviewable.
* The password is used exactly as typed: its UTF-8 bytes, no trimming, case folding or normalisation; every string, including one character, spaces, Unicode and the empty string, is valid. This is deliberately separate from `chat/crypto.mjs` (encrypted backups and app lock), which is unchanged and keeps its own rules.
* Limits: decoded JSON at most 64 KiB, with the Base64URL length bound checked before decoding; the same limit applies to version 2 files. Field types, byte lengths (salt 16, iv 12, ciphertext longer than the tag) and the suite are validated before Web Crypto runs. A damaged or unsupported token envelope never stops valid settings importing.
* Endpoint identity (`endpointIdentity`): scheme, host, port, path and query of the parsed absolute http(s) URL, without trailing slashes or a trailing `/chat/completions`, without a fragment, and none at all for credentials in the URL. The app uses the same identity to key saved API tokens (`canonicalizeEndpoint` now keeps the query), so a token saved for one destination is never sent to another, and a late unlock compares the token's authenticated destination with the endpoint selected at that moment.

### Receiving

A `#settings=` fragment is authoritative: version 2 fragments are read by the version 2 reader and a malformed one is reported, never silently replaced by old query fields. Without it, earlier `?settings=` / `?endpoint=` links and earlier configuration files (`{config, models}` or bare) still import. All of them open the same review ("Import these settings"): fields, token status, what changes and what is kept. Importing never clears a working token for the same endpoint when the incoming token is absent or locked; clearing is its own checkbox. A locked token opens "Unlock API token" with Unlock API token / Continue without API token; a failure says "Couldn't unlock the API token. Your other settings are ready." with Try again and Enter an API token manually. The encrypted package is kept in `sessionStorage` (`plc.pendingToken.v1`) until it is unlocked, replaced by a token entered for that destination, discarded, or the session ends, and Settings shows "Unlock transferred API token" with its destination and Discard pending token. The consumed fragment and legacy parameters are removed from the address bar with `history.replaceState`. Model-list requests start only after the review and the token question are settled.

## Chats and backups

Uses the existing file formats and readers (plain history JSON, `plc-backup/1` inside `plc-encrypted-backup/1`, foreign imports, Merge/Replace preview). The review beside each action is built from the real scope: conversation count, projects, memory, presets, preferences, documents (and how many when included), provider settings and credentials (both "Not included": use Transfer settings), file type and encryption. Export saved conversations is the full-history action; there is no subset selection, so no "selected conversations" action exists.

## Release verification that needs a person

* Scan the Share QR and a Transfer settings QR with a physical phone camera and check the destination.
* Use a real native share sheet (iOS Safari, Android Chrome) for both Share and Share transfer link; confirm cancelling leaves the panel usable.
* Check enlarged system text and the on-screen keyboard on a phone with the Transfer settings password field.
