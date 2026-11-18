# Real Safari checks of Private Local Chat on production (board T720)

2026-11-18, 04:4x to 04:53 EST. **One machine** (the networked Mac, macOS 26.7.1), **one Safari (27.0)**, **one run of each check**, on production **`5f77ebc`**
(the build with authored-profiles 1.1.0's neutral entry). **John switched the Mac's Wi-Fi off and on by hand** (an agent cannot: `networksetup` reports success and does
nothing); everything else was driven by PLC through a marked tab (`runner=plc-t720`), with the one tab that was already open left alone. Method: Cosmogenitor's praxis
`/srv/praxes/patterns/safari-offline-reopen-with-the-owner-at-the-wifi-switch.md`. Fixtures and the real browser are recorded apart: the two packages are Cosmogenitor's first real
T432 packages (`tests/fixtures/presentation/`), opened in the real app in a real Safari.

## Results

| File | What | Result |
| --- | --- | --- |
| `s0-first-load.json`, `s0b-saved-copy.json` | boot, service worker, saved copy | app booted at `5f77ebc`, service worker active and in control, all of the validator's saved files present in the saved copy, the validator loads from it; bulk runtime files 11 of 11 saved |
| `s1-preview-lantern.json` | preview of lantern-keeper through the app's own button and file input | card `sea` + `folio`; portrait (256×256) and background (1024×576) decoded from blob addresses; background hidden from assistive technology with its text listed; chime named as not used; own-look toggle removes and restores the look; text colour on the panel rgb(234,246,245) on rgb(15,59,68); no animation in the preview; Escape closes it; both picture addresses released |
| `s1-preview-ferry.json` | ferry-clerk (required portrait without bytes) | the character is listed, the look is not used, with the reason; the app's own look is drawn; no pictures |
| `s1-preview-changed.json` | lantern-keeper with one byte changed | "Character package not opened ... Nothing was used", no preview |
| `s2-install-*.json` | install of the small `nano` model (SmolLM2-135M) with no IndexedDB deleted beforehand | completed: 105,454,432 of 105,454,432 bytes in the browser's file store, verified by loading it, "Loaded · ready on this device"; IndexedDB databases the same before and after (`plc-docs`); no error (this is the check that ended in `database connection is closing` when IndexedDB had been deleted first, on Cosmogenitor's run) |
| `s4-offline.log` | reopen with the network down | network down 04:52:35 (epoch 1794995555); the page's `timeOrigin` 1794995559, **4 s after**; marker set before the reload is gone from the page and still in sessionStorage (a real reload); `navType` reload, 1,007 ms, **`transferSize` 0**; service worker in control, app booted, shell up, build `5f77ebc`; saved preset readable; validator's neutral entry in the saved copy and **loads offline**; the installed model still "Loaded · ready on this device" and `readiness.offline` true; a remote fetch **fails** (`remoteReachable` false); and the lantern-keeper preview run **offline** gives the same result as online |
| `s5-cleanup.json` | what was undone | the probe preset removed, the test model removed, the model selection back to the default, IndexedDB list unchanged, my tab closed, my files on the Mac deleted |

## What this does NOT show

- **Generation offline** (a reply written with the network down); only that the installed model is present and loaded.
- A **real keyboard** test: the Tab presses in `s1-*` are synthetic events and do not move real focus, so "focus stays inside" there proves nothing; the real-keyboard check is the Chromium suite (`tests/e2e/presentation-preview.e2e.mjs`).
- **320 px reflow** in Safari (its window was 1324 px wide) and **reduced motion** turned on (the system setting was off; the preview has no animation by construction).
- **iPhone**, any other Safari version, any other machine, or a repeat run.
- **Upgrade** from a previous release (this Safari already holds an older shell cache, `plc-shell-f3d9…`, from an earlier visit, which makes the next release a real upgrade test), a **kept look** (T706 release B is not built), and a changed byte in a stored asset.
- `navigator.onLine` was not used as proof (it lags in Safari); failed pings and the unreachable remote host were.

## Flaw in the instrumentation, kept honest

The first install driver stopped waiting when `localModels.busy` turned false, because the app finishes the download through its own recovery path; its log therefore shows "Download will
continue automatically" and `installed: false`. The state read a few seconds later (`s2-install-final.json`) shows the install complete. The conclusion rests on that final state.

## Files

`plc-offline.sh` (runs ON the Mac, never touches Wi-Fi) and the page scripts it reads (`plc-before.js`, `plc-mark.js`, `plc-reload.js`, `plc-probe.js`, `plc-read*.js`);
`make-preview-driver.py` and `preview-driver.template.js` make the in-page preview driver from a package file. The driver files that embed a package were not kept (they only repeat the fixtures).

## Tampered stored picture, real Safari (2026-11-18, about 13:55 EST)

Mac, Safari 27.0 (macOS 26.7.1), reached over the bridge (ssh port 2222), one run, my own marked tab (`runner=plc-t720b`) on production (commit 7090a3b), a script drove it with AppleScript `do JavaScript`.
`tamper-check-build.mjs` builds the test record from Cosmogenitor's real Harbour Clerk export with PLC's own modules (record 5,650 characters) and the snippets that were injected.
The storage was empty before (no presets, no kept looks) and was emptied again afterwards (both keys read back null).

| State | What Safari showed |
| --- | --- |
| good record kept for a preset, preset chosen | strip shown, palette sea, layout folio, both pictures loaded, message area carries the sea palette, no warning |
| the same record with the last byte of the portrait changed (same size, still valid base64) | strip hidden, no palette, no pictures, the warning "A picture of this look no longer matches the checksum it was kept with, so the look is not shown. Remove it, or add the ..." in the look controls, the stored text unchanged |
| the good record put back | strip shown again, sea and folio, both pictures loaded, no warning |

So the check that shipped in 7a98e27 (stored pictures hashed again before drawing) works in real Safari as it does in Chromium.
Limits: one machine, one Safari version, one run; the record was written into storage by the script, not kept through the preview and Add buttons (that path was run in Chromium); no touch, keyboard or narrow-width check here; no offline test.

## 320 px layout and a focus audit, real Safari (2026-11-18, about 14:10 EST)

Same Mac, Safari 27.0, production (commit 7090a3b at the time), one run, my own marked tab, a script drove it. The viewport of a desktop window cannot be set to 320 px without changing the owner's window, so the app was loaded in a
same-origin frame 320 px wide inside my tab (its media queries and layout see 320 px), with the good Harbour Clerk look kept and its preset chosen (the build script is `tamper-check-build.mjs`). Storage was empty before and emptied afterwards.

- **Layout at 320 px:** no horizontal overflow (document scroll width 320, no element past either edge), the message box (274 px wide) and the "+" button (36 px) are inside the view, the look strip is 320 px wide and shows the sea palette with both pictures loaded. The send button is absent while the box is empty (by design: `body.shell .message-form:not(.has-text) #sendBtn { display: none }`); I did not type a message in this run.
- **Focus audit (a script, not keystrokes):** 48 visible focusable controls, every one has an accessible name, none smaller than 24 x 24 px, no positive tabindex; the first controls in order are "Open sidebar", "Conversation title", the conversation field, "Temporary chat", "Chat options".

Limits, plainly: this is NOT a keyboard test. A script cannot press keys in Safari over this channel, so tab order as actually walked, Space and Enter operation, and whether a focus ring is visible were not checked (a script-set focus on the message box reported no outline, which proves nothing because `:focus-visible` rules may not apply to script focus). A frame is not a 320 px window or a phone: no touch, no real narrow viewport, one machine, one run, no offline test. The keyboard behaviour stays covered by the Chromium suites only.
