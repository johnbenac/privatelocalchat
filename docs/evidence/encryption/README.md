# Evidence for the encryption plan

What each file is. `docs/ENCRYPTION-AT-REST-PLAN.md` links these and says what they decided.

| File | What it is | How it was made |
|---|---|---|
| `storage-inventory.json` | Every browser storage key, database and file that touches browser storage, with its class and owner. `chat/vault/key-classes.mjs` is its code twin. | by hand; `tests/storage-inventory.test.mjs` fails if it drifts |
| `baseline-centroid.json` | A heavy user's chats (500 chats, 10,000 messages, 6.4 MB) and key-derivation timing in Node and in Chromium on this machine | `node scripts/encryption-baseline.mjs centroid` |
| `probe-veriton-firefox155.json` | Key-derivation timing and what the browser supports, headless Firefox 155 on the Veriton | `scripts/encryption-probe/run-veriton.sh <out.json>` |
| `probe-mac-safari.json` | The same in Safari on macOS 26.7.1 | the probe page served through a reverse tunnel to a Safari window opened for the purpose, closed afterwards |
| `probe-galaxy-s8plus-chrome131.json` | The same in Chrome 131 on the Galaxy S8+ | `scripts/encryption-probe/run-android.sh <adb-serial> <out.json>` |
| `kdf-timing.json` | The summary of the above and the decision (600,000 iterations) | from the files above |

Not here yet: the iPhone 15 Pro (timing and the real Face ID check), the Galaxy S8+'s real PRF answer. Both need a person at the phone; see steps 5.4 and 5.1 of the plan.

The probes record the user agent, the browser's capability answers and timings. They contain no device identifiers, accounts or addresses.
