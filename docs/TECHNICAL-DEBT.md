# Technical debt

A running list of known shortcuts, gaps and drift, newest review first. Each item says why it matters and what a fix looks like. Remove an item when it is fixed; add the date and a line to the review log at the bottom when you add one.

Last reviewed: 2026-11-01. Related, not duplicated here: `docs/IPHONE-INVESTIGATION.md` (open iPhone memory investigation), `docs/CHAT-FEATURES.md` ("Limits you should know about"), `docs/RELEASE-RECORD-2026-11-01.md` (what is unverified for the sharing release), `docs/PUBLIC-SITE.md` (public-site configuration).

## Process and safety nets

1. **Most browser tests are still not run by CI.** `.github/workflows/deploy.yml` runs `npm test` and the Python dev-tools tests, and these workflows run Playwright suites: Offline e2e, Vault e2e, Voice e2e, Data upgrade (data and saved-file compatibility, newer-data guard), Update behaviour, Site links and Model sources. About 30 other suites in `tests/e2e/` (chat core, voice, providers, mobile, dialogs, roberta, sharing and the rest) are only run by hand with `node tests/e2e/<name>.e2e.mjs` or `npm run e2e`, so a regression in them can reach production. *Fix:* add them to a workflow the same way (a job that installs Chromium with `npx playwright install --with-deps chromium`); the suites are hermetic (fake API, local server) and take a few minutes. The browser test of the public pages lives in the private site repository.
2. **`npm run e2e` stops at the first failure** (`|| exit 1`) and prints little. Consider a runner that runs all suites and summarises.
3. **No linter or formatter.** `index.html` is hand-formatted JavaScript; style drifts between the old inline code and the newer `.mjs` modules.
4. **Commit titles over 100 characters** exist (two on 2026-11-01). `.gitlint` asks for at most 100, but nothing in CI enforces it. Either enforce it or relax the config.
5. **Agent worktrees are not git-ignored.** `.claude/worktrees/` is only excluded locally (`.git/info/exclude`); a stray `git add -A` once staged an embedded repository. *Fix:* add `.claude/worktrees/` to `.gitignore`.
6. **Version numbers disagree.** `package.json` says 2.0.0 while semantic-release tags are v0.x, and the app, Updates page and release record each need to pick one. Decide which is canonical (`docs/PUBLIC-SITE.md` currently uses the tags).

## Code structure

7. **Fixed (2026-11-03): `index.html` is 1,167 lines, down from 6,013.** Its styles are `chat/page.css`; its script is boot, the wiring that creates the feature modules, the composer / preferences glue and the event listeners; every feature and the chat core's slices are modules under `chat/`. `docs/RESTRUCTURE-PLAN.md` has the plan and what each step did; `docs/ARCHITECTURE.md` the structure.
8. **Two sources of truth for the API token.** `provider.config.token` (mirrors the visible field) and the per-endpoint store (`chat/provider/endpoint-tokens.mjs`, keyed by endpoint identity) can disagree; requests use `authTokenFor(endpoint)` but several paths in `chat/provider/provider-settings.mjs` still write `config.token` directly. The store is now one pure, tested module, which makes the fix small. *Fix:* make the store the only one and derive the field from it.
9. **Fixed (2026-11-03): no native `confirm` / `alert` / `prompt`.** Every question, message and "copy this by hand" fallback is the page's own dialog (`window.plcDialogs.confirm / alert / copyText`, built on `openAppDialog` in `index.html`; a delete button is red with white text). `tests/no-native-dialogs.test.mjs` fails if any source file uses the browser's boxes again, and `tests/e2e/dialogs.e2e.mjs` fails on any native dialog while driving delete history, reset settings, the token copy fallback and removing a model.
10. **Two sets of colour variables.** `chat/chat.css` and the inline `<style>` define `--color-*` tokens, which `chat/brand.css` maps onto `--plc-*`. Fold them into one set.
11. **The About modal and the Help sheet overlap.** The modal is kept as "Quick summary of this app" and is still reachable from the Help sheet and the first-run screens; the public `/about/` page is the canonical version. Decide whether to keep both.
12. **Duplicated release-path rewriting.** `scripts/build.mjs` rewrites asset paths for `index.html` and, separately, for the public pages (`scripts/public-site.mjs`); a third entry point would need a third copy.
13. **The head script in `index.html` (stale-build repair, start-failure banner) is plain ES5 by design** and duplicates a little logic with `local-models.js`' service-worker registration. Keep it small; do not let it grow.

## Runtime and models

14. **CPU (WebAssembly) path is unmeasured on a real model.** It is proven with a tiny fixture only (`tests/e2e/cpu.e2e.mjs`): no tokens-per-second for Qwen3.5-2B, and the runtime is single-threaded because no multi-thread build is vendored. The fixture also cannot exercise the chat endpoint. *Fix:* measure on a real machine with the GPU disabled, record it in `docs/`, and consider a multi-thread build (the site is already cross-origin isolated).
15. **Fixed (split stage 4): the catalogue defaults are the configured model source.** `app-config.json` (and an operator's `config/app-config.json`) give the root; the catalog, the voices and the embedding set join it to `<name>/<revision>/`. No default names Hugging Face or `raw.githubusercontent.com`, and `local-models.js` passes no override (`docs/APP-CONFIG.md`, `tests/model-urls.test.mjs`).
16. **Large runtime files are cached best-effort** by the service worker so a phone cannot get stuck on an old version, so the model runtime can be incomplete until first use. *Restated 2026-11-03 (offline plan):* the indicator now reflects it (Settings > Models > Ready for offline use has a "What runs the model" line with the count saved and a Save now button, fed by the service worker), and on desktop the files were all saved within about 20 s of the first visit. Still a risk on slow connections and phones, now visible and fixable by the person rather than silent.
17. **iPhone memory limit** is an open investigation (`docs/IPHONE-INVESTIGATION.md`); the CPU fallback is deliberately not offered on iPhone/iPad because of it.
18. **Model-download stall watchdog** (2 minutes without progress) was unit-tested but never reproduced on a real phone; the threshold is a guess.

## Privacy, security and data

19. **API tokens live unencrypted in `sessionStorage`** (`chatConfig`, `chatEndpointTokens`). Fine for the threat model stated on the Privacy page, but worth revisiting if app lock should cover them.
20. **Old settings links carry a plaintext token in the query string.** They are still read for compatibility and the Privacy page says so. Consider a sunset date for the legacy reader.
21. **Privacy statements are checked by reading code, not by a test.** "No analytics, no cookies, only these hosts" can drift silently. *Fix:* add a test that scans `index.html`, `local-models.js`, `chat/`, `runtime/` and the public pages for third-party hosts and tracking APIs and compares them with an allowlist.
22. **Help copy names UI labels** ("Advanced model controls", "Verify / repair", "Remove download", ...). Renaming a control breaks the instructions without any test failing (it already happened once with the backup buttons). *Fix:* add a test that each quoted label exists in `index.html`.

## Speech

23. **WebKit microphone permission is untestable here.** Dictation and voice conversation were built from the platform's documented behaviour and tested against mocks; DuckDuckGo on iOS and Safari were not exercised. Two assumptions are unverified: that `resultIndex` behaves as in Chrome on WebKit, and that voice mode's recogniser restarts without a tap are allowed after the first permission.
24. **Voice call polish is unverified on real phones.** The ring, pick-up and hang-up tones, vibration, the full-screen call layout, the on-screen keyboard and iOS audio unlocking (the audio context is created inside the tap that starts the call) were tested in headless Chromium with a mocked audio context only. Check them on an iPhone and an Android phone, with the ringer switch both ways.
25. **Voice mode has no echo cancellation** beyond turning the microphone off while it speaks, so a speakerphone setup may cut replies short.
26. **Roberta, voice notes and recording are untested on real phones and Safari.** They were built from documented browser behaviour and driven in headless Chromium with mocked speech: the voicemail layout, the keypad, `speechSynthesis` sentence queueing and pause, recording through the speech recogniser, and the labelled keypad on a small screen. Try an iPhone (Safari and home-screen app) and an Android phone before relying on them.
28. **The robot's name is defined twice** (`ROBOT_NAME` in `index.html` and `chat/roberta/ivr-content.mjs`), and the live voice call's contact name is still "Private Local Chat" rather than Roberta. Make the page import the one constant and decide whether the call should show Roberta.
29. **The vendored embedding worker is edited after bundling** (`ops/embedding/build-worker.mjs` splits one 32-letter model class name so GitHub push protection does not mistake it for a Mistral API key). Rebuilding with the script keeps the edit; replacing the bundle by hand would bring the push block back.

## Public site and operations (all need the owner)

30. **Unset configuration in the site's `site-config.json` (in the private site repository):** support email and owner, Discussions URL and owner, hosting-log note, verification date, demo. The site hides what depends on them; the Help copy for contact and community is minimal until then.
31. **Unverified infrastructure facts:** log retention for the Pages projects and the R2 domain; the live `robots.txt` (and any edge content-signal policy) versus the generated file; the `privatelocalchat.com` redirect rule (outside this repo); Search Console; social-preview checks in real services.
32. **No demonstration video** and no genuine ratings or reviews, so none are claimed.
33. **Physical-device checks never done:** scanning a QR with a phone camera, a real native share sheet, enlarged text and the on-screen keyboard on a phone, and the stale-Safari / home-screen-app repair path on the reporter's device.
34. **Known-issue entries on `/help/` were derived from repository documents**, not re-tested; each says so. Re-verify and update the dates at every release.

## App layout (2026-11-02)

35. **The new layout has not been checked on a real iPhone**, nor the call screen's status text and the stalled-speech cut-off (the stall timer is a conservative guess, untested against a real stuck voice engine).
36. **Meaning search keeps its vectors in memory only**, rebuilt each time the search opens (up to 2,500 passages, newest first). Persist them in IndexedDB if it feels slow on large histories.
37. **No Images destination** (nothing to show), and a call does not start a model download by itself.

38. **LFM2.5 and Granite are untested on a GPU and on iPhone.** They were proven end to end on the processor path only (download, hash check, load, two answers, unload, remove). The earlier speechtest work qualified LFM2.5-2.6B Q3_K_M on Mac Safari with a 16 MB bounded loader; run the same check on a real iPhone before offering them there, and measure memory (the figures in `catalog.mjs` are estimates). Granite's window is 8,192 here; its manifest allowed 16,384.
39. **LFM2.5 prints a leading newline** before its first sentence; the Markdown view hides it, but a copied answer may start with a blank line.

41. **Kokoro is built and selectable; the 326 MB GPU-only variant is not.** The q8 model (97 MB) runs on WebAssembly. The fp32 GPU variant read back perfectly at 6.7x real time on an RTX 3060 (`docs/evidence/voice/kokoro-webgpu-spike.json`) but needs a 326 MB download plus a 29 MB WebGPU runtime, and was deliberately not built.
42. **Advice thresholds come from few devices.** `probeMaxMs` (500) and `qualityProbeMaxMs` (200) come from five real devices and a CPU-contention sweep (`docs/VOICE-CALIBRATION.md`); no mid-range phone or low-end laptop has been measured for real. They only drive the "recommended" and "may be slow" labels, never a block.
43. **Text normalisation is the reference's, plus two small changes.** (1) Sentence punctuation is kept instead of stripped (`speechChunks` in `chat/voice/voice-kitten.mjs`): measured as intelligible as the reference setting, it keeps the pauses between sentences and gets the first sentence ready sooner. (2) Full stops after common abbreviations (Dr, Mr, St, ...) are dropped and "e.g.", "i.e.", "etc." are expanded before chunking, so they do not split a sentence. `chat/voice/voice-text.mjs` ports Kitten's own pre-processor (numbers, currency, percentages, times, ordinals, units, fractions, decades, phone numbers, IP addresses, ranges, scientific notation, contractions; URLs, e-mail addresses and HTML tags are dropped) and runs it before chunking, checked against 517 golden outputs of the Python reference. Not covered: the reference's own gaps (no month or weekday names or abbreviations such as "Dr." and "St.", which are read as written, or "doctor"-style expansion; no dates such as 3/4/1990 beyond fractions; addresses and code are read as plain words; numbers above the trillions are dropped; "twenty" ordinals read "twentyth"), non-English text, and the reference's removal of all punctuation, which makes a short text one chunk with no sentence pauses. Markdown is stripped before reading, as for the system voice.
44. **The browser eSpeak build differs from Python's.** One of seven reference chunks differed by one vowel ("four"), so output is very slightly different from Kitten's reference.
45. **Installing needs `createWritable()`.** Older Safari without it cannot install the voice (the offer then fails and the system voice stays).
46. **The service worker caches the whole app on first visit (about 42 MB) regardless of voice.** Removing the voice also deletes the 13 MB ONNX Runtime cache entries, but the shell cache is the app itself and remains.
47. **A slow voice can stutter on long replies.** The playback lead is sized for a 20 s reply and capped at `maxStartDelayMs`; a 2-minute reply at 0.7x real time pauses between chunks. Fine for the usual short answer; revisit if long answers are read aloud often.
48. **Model memory is managed by a switch, but swap latency is not measured on a phone.** "One model at a time" (Settings > Models > Memory, `runtime/memory-manager.mjs`) unloads the other models before one is used; off, the app tries whatever is asked. A voice also unloads after 60 s idle. Not measured: how long the chat model takes to come back on an iPhone after a voice has been used. See `docs/MODEL-MEMORY-PLAN.md`.
49. **Two tabs can race an install.** Install is de-duplicated within one page only; a second tab's cleanup could delete the first tab's partial files, which then fails and records a fallback.
50. **Sentence splitting follows Kitten's reference.** Text is split at every full stop, so "3.5", "e.g." and "U.S." are cut into pieces, and one very long unbroken run (a URL or code) is a single long chunk.
51. **Fixed: no remembered refusals.** The earlier offer flow, its decline memory, fallback memory and iOS block are gone; see the voice picker in `docs/CHAT-FEATURES.md`.
52. **Installed files are hashed once, at install.** `status()` trusts size plus a marker file afterwards; same-size corruption in private storage would not be noticed.

## Review log

* 2026-11-01: first version, written after the sharing / transfer / public-pages release.
* 2026-11-01: added voice notes, Roberta and semantic matching items (26-29) after that release.
* 2026-11-02: added the app layout items (35-38) after the shell release.
* 2026-11-02: added LFM2.5 and Granite items (39-40).
* 2026-11-02: added the voice upgrade items (41-46), and 47-52 from the independent review of it.
* 2026-11-04: added item 54 (settings transfer and the API format).

53. **"Failed to write to file" while downloading Granite on the iPhone automation context (2026-11-03): diagnosed as the context, not the app.** The download stopped at about 370 MB with that message and retried without saying why. A direct OPFS test in the same Safari context (a worker writing 4 MB chunks to one file, with and without `{at}`) then failed after 12 to 16 MB, while the phone had 77 GB free and `navigator.storage.estimate()` reported 74 MB used of 41 GB. The bridge's context is a temporary, non-persistent Safari namespace, so it most likely allows only a few hundred MB of writes in total, however large the estimate says the quota is. It was not reproduced on the owner's real Safari, where Granite downloads work. Changed: `runtime/download-recovery.mjs` now reports the same failure three times in a row (`repeated: <message>`) and `local-models.js` says the browser may have no room left (free space, close tabs, choose a smaller model) instead of showing "Downloading" with no cause; retries continue as before. Not done: a real-Safari reproduction on a device with a nearly full disk.

54. **Settings transfer does not carry the API format.** Only endpoint, model and theme travel (`chat/transfer/settings-transfer.mjs`), so a custom server set to the Responses or Anthropic format falls back to the format its address implies in the receiving browser. See `docs/PROVIDERS-PLAN.md`.
