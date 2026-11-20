# The shared voice loop (voice-loop)

`runtime/voice-loop/` is a read-only copy of the package **voice-loop** (owner plc, source `/cosmoshot/voice-loop`, public, AGPL-3.0-only), pinned by exact version and SHA-256 in `vendor.lock.json`
and checked by `tests/vendor-lock.test.mjs`. Do not edit it here: change it in `voice-loop`, publish, and re-pin in one commit (`/cosmoshot/tools/docs/VENDORING.md`).

What PLC takes from it: the call's turn loop (`session.mjs`, formerly `chat/voice/voice.mjs`), the browser speech recognition (`recognition.mjs`) and the system voice (`browser-voice.mjs`).
`chat/voice/speech.mjs` re-exports them and keeps only the downloaded-voice route. The Emma chat uses the same package, so the loop has one copy. The `onSentence` hook
(each spoken sentence, with its audio and phonemes from a downloaded voice) is not used by PLC today. `kokoro-speaker.mjs` and `index.mjs` ship in the folder but PLC does not import them.
