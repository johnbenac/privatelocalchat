# Model UI: one integrated plan

Status (2026-11-03): ALL BUILT (decisions in section 9 were taken as recommended by the owner). The wording fix; the picker toggle for chat models and voices
(`toggleLocal`, `ctl.toggle`); `chat/models/models-view.mjs` (one vocabulary, `TIER_NOTES`, tested); `window.localModels` actions and `view` (`local-models.js` keeps what
the UI shows in a view object, not in page elements); the rebuilt Settings > Models page (`chat/shell/models-page.mjs`: Language model, Connected provider, Voice,
Other models, Memory and storage; the Voice nav item is gone and `openSettings("voice")` opens Models at the Voice section); both composer pickers and the voice
description built from the same view-models and words; the Storage screen lists chat models and voices in the same words; the legacy model panel (the old model
dropdown, readiness card, Download/Load/Free buttons, advanced controls, `#inferenceMode`) is DELETED from `index.html`, and the provider form sits in a card in its own
section. Help pages and Roberta's content were updated for the new names (Unload, Details and repair). The two composer menus and Settings now draw every model row with the same code (`chat/shell/model-row.mjs`: `rowParts` and `renderRowText`): name, In use badge, state words, progress bar, state dot. Nothing in section 10 is left open except the real-device pass on a phone with a chat model loaded.
Written after a survey of every place a model is chosen, loaded, downloaded, removed or explained.
Scope: all model picking and model management UI (chat models, connected providers, voices, the embedding model, memory). Companion to
`docs/MODEL-MEMORY-PLAN.md` (the memory manager, already built) and `docs/VOICE-ENGINE-PLAN.md`.

## 1. What is wrong today (inventory)

Places where a person picks or manages a model, and what each one is:

| # | Where | Code | What it does |
|---|---|---|---|
| 1 | Composer: model pill and its menu | `chat/shell/shell.mjs` `modelPill`, `chooseLocal`, `chooseProvider` | Lists the three on-device chat models and the provider's models. Clicking one **selects it and loads it if it is not loaded**: an idempotent "turn on". It works by writing to the hidden legacy form (`#inferenceMode`, `#localModelSelect`) and dispatching `change` events. |
| 2 | Composer: voice pill and its menu | `shell.mjs` `voicePill`, `voiceRows`, `chooseVoice` | Lists System voice, Kitten, Kokoro, plus Remove, Hear a sample, Free the memory rows. Clicking a row **selects** (and downloads if needed). Also idempotent. |
| 3 | Settings > Models, top: "On this device" | `shell.mjs` `add("models")`, `#installedModels` | A list of the three chat models with size, Unload and Remove. A third rendering of the same three models. |
| 4 | Settings > Models, middle: "Memory" | `shell.mjs` `#memoryCard` | The One model at a time switch and the list of what is in memory (all kinds). Sits between the chat-model list and the legacy panel. |
| 5 | Settings > Models, bottom: "Choose and download" | `index.html` `#providerSettings` moved into Settings | The **legacy panel**, built before the shell: "Where replies run" select, readiness checklist, "Set up private chat" button, a model `<select>`, details and status text, device (GPU) help, progress bar, Download / Load / Cancel / Free memory buttons, an "Advanced model controls" disclosure (restart engine, verify/repair, remove download, copy device details, diagnostics, keep models on this device), then the whole connected-provider form (quick-start endpoints, endpoint, model list + refresh, token). Redundant with 1 and 3. |
| 6 | Settings > Voice | `shell.mjs` `add("voice")`, `#voiceCard` | The same voices as 2, with Use / Download / Try again / Cancel / Unload / Hear a sample / Remove buttons. Separate nav item, so voices and chat models are on different pages. |
| 7 | Storage screen | `index.html` `openStorage` (~4861) | Lists chat models with "Remove files" (a fourth list of the same models). Voices are not there. |
| 8 | First message / prep card | `index.html` `prep` card, `runtime/prepare.mjs` | Downloads and loads a chat model as part of sending a message. |
| 9 | Mode badge | `shell.mjs` `badge` click -> Settings > Models | A shortcut into 5. |
| 10 | Roberta / calls | `index.html` Roberta actions, `callWaitNote` | Start a model download from a menu; explain model state during a call. |
| 11 | Embedding model (Roberta, search) | `chat/embedding/embedder.mjs` | No user-facing control at all; only visible in the Memory card. |

Problems, in the owner's words and mine:

- The same chat model appears in 1, 3, 5, 7; the same voice in 2, 6. Each place has different verbs and different words.
- "Models" mixes three kinds of thing (chat models, connected providers, voices-via-memory) with no headings by kind; Voice lives on a different page.
- Memory is sandwiched between the chat-model list and the legacy panel.
- Picking a row only ever turns a model **on**; there is no way to turn it off from the picker. (Request: it must be a toggle, for chat models and voices.)
- The shell drives the hidden legacy form by writing values and firing `change` events (`chooseLocal`), so the new UI depends on the old one.
- Wording: "Free and instant" on the System voice (`chat/voice/voice-choice.mjs` `VOICES`) implies the downloaded voices cost something. The system voice is not a model.

## 2. Words (one vocabulary, used everywhere)

- **Model**: something downloaded and run on this device. Kinds: **language model** ("chat model" in sentences), **voice** (a downloaded voice), **embedding model** (Roberta and search), later image and OCR models.
- **Provider**: a connected service (API endpoint). Not a model on this device; it has no memory or download state.
- **System voice**: the voice built into the device. **Not a model.** It is listed apart from the downloadable voices and described neutrally ("Built into your device"). No cost words (free, instant, light).
- Three states a model can be in, and only these:
  1. **Not downloaded** (size shown).
  2. **Downloaded** (on the device, not in memory). Hollow dot.
  3. **Loaded** (in memory, ready). Solid dot; ringed while working; pulsing amber while downloading or loading.
  (Failed is shown as a message on the row, not a fourth state.)
- **In use** (selected) is separate from **loaded**: the radio mark says which model is used; the dot says whether it is in memory.
- Names in sentences are always specific: "the chat model Qwen3.5-9B", "the Kitten voice", "the embedding model". Never "the model".

## 3. The row: one component for every model

A single `model-row` component (new `chat/shell/model-row.mjs`) renders any model from a normalised view-model:

```
{ id, kind: "language" | "voice" | "embedding" | ..., label, note, license, sizeBytes,
  state: "none" | "downloading" | "testing" | "downloaded" | "loading" | "loaded" | "busy" | "failed",
  progress, error, inUse, memoryEstimate, canDownload, canLoad, canUnload, canRemove }
```

It shows: radio mark (in use), name, one line of description (state words from section 2), the dot, and the size. The same row is used in the composer pickers, the Settings sections and the Storage screen. Overflow actions (Remove, Hear a sample, Verify, Details) appear the same way everywhere.

A single aggregator, `chat/models/models-view.mjs`, builds the view-models from the three real sources (`window.localModels`, the voice picker controller, the memory manager) and notifies on change. Nothing in the new UI reads or writes the legacy form.

## 4. Click behaviour: a toggle (the owner's request)

Clicking a model row toggles whether that model is **loaded**. Loading a model also makes it the one in use (you load it to use it). The system voice and providers are not loadable, so clicking them is an idempotent select.

| Row state | Click does |
|---|---|
| Not downloaded | Download, then load, then use it (progress on the row and the pill). |
| Downloading / testing | **Cancel** the download (the toggle going off). Nothing is kept. |
| Downloaded, not loaded | Load it and use it. With One model at a time on, the others unload first (existing behaviour, with the status line explaining it). |
| Loaded | **Unload** it (frees memory, keeps the files). It stays the selected one; it loads again, lazily, the next time it is used. |
| Failed | Try again. For voices, the existing rule stays: one confirmation after a failure, then unlimited tries. |
| System voice | Select it (idempotent). |
| Provider model | Select it (idempotent). |

Consequences to settle (section 9): a loaded language model is always the one in use (the host loads one tier at a time); for voices, at most one voice is loaded at a time (loading Kokoro unloads Kitten), so "loaded" and "in use" agree for voices too.

The pickers stay open after a click so the change (loading, progress, unloaded) is visible; closing is by tapping away. The composer pill's dot shows the same state.

Because a toggle cannot also mean "choose this one without loading it", Settings keeps explicit buttons for that (Use, Load, Unload as separate actions in the row's overflow), and the pickers stay the quick path.

## 5. Settings: Models, reorganised

Settings gets one **Models** page (the separate **Voice** nav item goes away; opening "voice" scrolls to the Voice section). Sections, in this order, each with its own heading:

1. **Language model** (the "chat model")
   - "Where replies run": a two-way control, **On this device | Connected provider**.
   - On this device: the three chat-model rows (one component, section 3). Under them: a status line (what the legacy `#modelStatus` said), device help when the device cannot run it (legacy GPU help, inline), and a **Details** disclosure holding what the legacy "Advanced model controls" held: Restart model engine, Verify / repair, Remove download, Copy device details, diagnostics.
   - Download-stuck and load-failure help links stay, as one line.
   - The "Set up private chat on this device" button and the readiness checklist (Downloaded / Loaded / Ready offline) become one **Set up** row action plus three short state chips in the model row, not a separate card.
2. **Connected provider**
   - Quick-start endpoints, endpoint, model list with refresh, API token (the legacy form, moved as is at first, then restyled as rows). Collapsed by default when replies run on this device; open when they run on a provider. The provider's models also appear as rows in the composer picker (section 6).
3. **Voice** (reading aloud)
   - The System voice row (listed first, labelled "Built in", with no cost words) and the downloadable voices (Kitten, Kokoro) as the same row component. Hear a sample, Remove, Unload are the shared overflow actions. Voice speed and call sounds stay in Personalization as today.
4. **Other models**
   - The embedding model (Roberta and search): a read-only row with its state and an Unload action. Future image and OCR models appear here by registering.
5. **Memory and storage**
   - The **One model at a time** switch with its one-paragraph explanation.
   - What is in memory now (the existing memory list, now rendered with the same row component, kind-agnostic).
   - Total downloaded on this device, **Keep models on this device** (the legacy persist button), and a link to the Storage screen.

Order rationale: what a person chooses most (language model) first, then the things that follow from it, then the cross-cutting memory controls last, as a summary of the whole page rather than a layer in the middle.

## 6. The composer pickers

- One picker pattern, two pills (language model and voice), same rows, same dots, same toggle.
- Language model picker: **On this device** (three rows), **Connected provider** (its models), footer **Manage models…** (opens Settings > Models). The provider section only lists models when a provider is configured.
- Voice picker: **Built in** (System voice), **Downloaded voices** (Kitten, Kokoro), footer rows: voice sample, "Free the memory" (only when something is loaded), **Manage voices…** (opens Settings > Models > Voice). The voice picker keeps its advice and sample hints.
- The pill text shows the state in words where it matters ("Kitten loading…"); the dot is identical in both pills.

## 7. Retiring the legacy panel

The legacy panel is driven by `local-models.js` through element ids, and the shell and the e2e suites use several of those ids. Retire it in steps, keeping every behaviour:

| Legacy control | New home |
|---|---|
| `#inferenceMode` select | "Where replies run" control (section 5.1) |
| `#setupCard`, readiness list, `#setupPrivateChat` | Set up action and state chips on the chat-model row |
| `#localModelSelect` | The chat-model rows |
| `#modelDetails`, `#modelStatus`, `#modelProgress` | Row description, the status line, and the row/pill progress |
| `#gpuHelp`, help links | Inline device help under the language-model rows |
| `#downloadModel`, `#loadModel`, `#cancelModel`, `#freeMemory` | The row toggle (section 4) and overflow |
| Advanced: restart, verify/repair, remove, copy details, diagnostics | **Details** disclosure under the language-model rows |
| `#persistModels` | Memory and storage section |
| API settings form (`#apiSettings`) | Connected provider section |
| `#installedModels` card | Folded into the chat-model rows (it was a third copy) |
| Storage screen model list | The same row component |

Technical approach: first put a controller facade in front of `local-models.js` (the functions the UI needs: download, cancel, load, unload, remove, verify, restart, switch tier, persist, details). Build the new rows on the facade and `models-view.mjs`. Keep the legacy DOM present but hidden while `local-models.js` still renders into it, and delete it only when no test or code reads its ids. Do not synthesise `change` events on legacy controls from the new UI.

## 8. Cues and wording

- Dot states are the same on every row and both pills (section 2). One legend line in the Memory section.
- While models swap, the status line says what and why (already built).
- Wording to change: System voice note becomes "Built into your device." (no "free", no "instant"); the picker and Settings never describe any model as free, light, instant or fast unless a measured number is shown.
- Always specific names; never "the model".

## 9. Decisions for the owner

1. **Unloading the loaded model keeps it selected** (it loads again on next use). Recommended. The alternative (unloading deselects) leaves nothing selected and breaks sending.
2. **At most one voice loaded at a time**, so loaded = in use for voices as for chat models. Recommended.
3. **Voice moves into the Models page**; the Voice nav item goes away. Recommended.
4. **Memory and storage last** on the Models page. Recommended (alternative: first, as a banner).
5. **Where replies run as a two-way control** instead of a dropdown. Recommended.
6. **Provider section collapsed** when replies run on this device. Recommended.
7. **Cancel by clicking** a downloading row (toggle off). Recommended; a visible Cancel button stays on the row.

## 10. Build order

1. Wording fix (System voice note) and the toggle behaviour in the two pickers, using the existing controllers (small, visible, and independent of the rest).
2. `models-view.mjs` + `model-row.mjs` with unit tests; the controller facade over `local-models.js`.
3. Settings > Models rebuilt on the rows: Language model, Provider (legacy form moved as is), Voice, Other models, Memory and storage. Voice nav item removed with a redirect.
4. Composer pickers moved onto the same row component; Storage screen too.
5. Legacy panel retired as in section 7; e2e suites updated to the new controls (they use `#inferenceMode`, `#setupPrivateChat`, `#downloadModel`, `#loadModel`, `#freeMemory`, `#modelDetails`, `#gpuHelp`, `#readiness`, `#tokenInput`, `#installedModels`).
6. Provider form restyled as rows.
7. Real-device pass (iPhone 15 Pro and a Mac): every row state, toggle on/off for a chat model and a voice, One model at a time on and off.
8. Docs: `CLAUDE.md` architecture bullet, `docs/CHAT-FEATURES.md`, help text, `docs/TECHNICAL-DEBT.md`.

Risks: the e2e suites depend on legacy ids (step 5 touches many); `local-models.js` couples state and DOM (the facade must come first); accessibility of the toggle rows (each row is a `menuitemcheckbox` with a clear state label, not colour alone); small phones (the two pills and the overflow menus must keep fitting at 390 px).
