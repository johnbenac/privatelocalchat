# Rich characters in the app (review, keep, library)

The visible side of `docs/CHARACTER-STORE.md`: `chat/characters/characters-ui.mjs`, created once by the page. It never writes browser storage itself: every save, update, copy and removal is a call to the one store. Added 2026-11-16 (board task T222, partial: the formal vault, temporary-chat and multi-tab qualification and the combined data snapshot are still to come).

## What a person can do

* **Import character…** (in "Instructions for this chat", beside Import preset…): choose a package file. The size is checked before the file is read. A `#character=` link opens the same review (bounded before decoding; a link carries metadata only). A file that is really a simple `{name, prompt}` preset says so and points to Import preset…; the simple preset route is unchanged.
* **Review**: the exact name and instructions, a plain list of what the package holds (saved with the character but not used in chat yet; not in this package; kept unread), the named optional parts that are kept but not used, every file with its size, whether it is needed, and a preview drawn by the app itself (text as text, a PNG as a picture only when its bytes are a PNG, a WAV in the app's own player: paused, `preload=none`, no autoplay, never package HTML, CSS or script). The package's own claims about its design are shown as unverified statements. Nothing is saved until the person presses the button; Cancel, closing, reloading and opening a link change nothing.
* **How to keep it**: *Save as a new character* (the default; always a new local reference, even for the same package or the same name) or *Update a character I already saved* (the person picks the character; its reference is kept and its version rises). The version chosen is the version the person saw: a character changed meanwhile (another tab) refuses with a plain message and the proposal stays open for another try.
* **Saved characters…**: a library with details (exact instructions, structured sections as text, exact files reopened through the producer validators, local reference, version), **Make a copy** (a new character with its own reference; it records only where its design came from), **Update from a file…** (starts a review with that target already chosen) and **Remove** (asks first).
* **Files kept outside the package**: when a package declares external resources the review first asks the person to choose them. The chosen files are measured against the manifest (count, each size, total) before any byte is read, matched to the declared resources by their own SHA-256 and verified again by the producer; no address in the package is ever fetched.

## Where a character lives

Normal chats: `plc.characters.v1` through the page's vault-aware storage (`appLocal`), classified in `key-classes.mjs`, the storage inventory and `docs/DATA-HANDLING.md`, format 1, lock `plc-characters`. A temporary chat has its own memory-only store, made when it first needs one and ended when the chat is left (a later temporary chat starts empty); nothing reaches browser storage. Locking or turning off the vault closes every open view, revokes every preview address, ends the temporary store and makes work prepared before the lock stale; the store also rechecks the locked state inside the shared write lock, so a pending save never falls through to plaintext storage. A read-only second vault tab refuses to save and says why.

## What this does not do

* Characters are not used by chats yet: nothing is applied to a conversation, no model is started and nothing is fetched or sent.
* Protected backups do **not** include saved characters or their files yet (a later task). The app says so in the review, the library and Storage and backups: keep the original package and resource files.
* No conversation participant, shared registry or runtime authority is created; the package's names, ids and claims never choose or continue a saved character.

## Tests

`tests/character-resources.test.mjs`, `tests/character-store-bounds.test.mjs` (the reviewed store defects: temporary lifetime, bounds before parsing, counter boundary, lock state), the store and crash suites, and `node scripts/e2e.mjs characters` (real browser, real Pip, Neri and Bex, external Neri, update/copy/remove/stale, refusals, links, temporary chat, vault, read-only tab).
