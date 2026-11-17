# Roberta, voicemail and voice notes

## Who Roberta is, and is not

Roberta is the name of the app's robot: the front desk of Private Local Chat. She is a program that plays **prepared messages** in a numbered phone menu and matches what a person says to the right message by meaning. That is all.

* She is **not a person**. She says so in her first sentences ("I'm a program, not a person. I don't have feelings or awareness") and no script claims feelings, memories, a life or consciousness. `tests/ivr.test.mjs` fails if copy starts to.
* She is **not the language model**. Her messages are fixed text (`chat/roberta/ivr-content.mjs`); nothing she says is generated. She says what the model will do once it is ready: "replies in the chat are written by that language model on your device. I'm only the front desk."
* She works **before any model exists**, and in parallel with the model download.
* The name is one constant, `ROBOT_NAME` in `chat/roberta/ivr-content.mjs` (and `ROBOT_NAME` in `index.html`, which names the sender of voice notes). Change both together. The live chat call (the green phone button) still says "Private Local Chat" as the contact; making it say Roberta too is a one-line change if you want one identity everywhere.

## What a visitor sees

| Where | What |
|---|---|
| Her page (sidebar > Roberta; on a phone, the panel drawer) on a **computer** | An **incoming call** from Roberta, styled like a video call: Answer, or Read the voicemail. Answering opens the call window. |
| Her page on a **phone or tablet** | A **voicemail** thread: a voice note from Roberta (nothing speaks until a tap), her numbered options as reply buttons, and a Call Roberta button. Each number tapped adds her answer as another voice note, like a chat on a messaging app. |
| The call | A window on a computer (header with a timer, Roberta's tile, a small "You" tile, captions) and the whole screen on a phone. A **keypad** whose keys are labelled with the current menu, a **Speak** button (say what you need), Skip, Mute voice and End call. Digit keys work from a keyboard. |
| Elsewhere | Roberta is a pinned agent in the sidebar; her page has a Call button, and Settings > Roberta & voice and the Help & about sheet link to it. "Not now" returns to the chat. Nothing opens her automatically. |

Starting the download from her menu (key 3) shows the progress card in the empty chat beside her page's conversation.

## The menu

Press `1` privacy (cloud, storage, outside providers, accounts), `2` talking and listening (read aloud, dictation, voice calls, voice notes), `3` download the model (reports progress when pressed again), `4` share with a friend, `5` restore from a backup, `6` export your chats, `7` move settings or connect a provider, `8` leave a voice message, `9` help (stuck download, model won't load, microphone, storage), `#` start chatting, `0` hear the menu again, `*` go back. More topics are reachable by saying them (who are you, what is this, installing, cost, offline, size, compatibility).

**Dynamic content.** `describeContext()` builds the facts the scripts adapt to: iPhone, iPad, Android, Mac, Windows or Linux; phone or computer; installed or in a browser tab; in-app browser; connected-provider or on-device mode; the model state (none, downloading with percent, downloaded, loading, ready, unavailable), its size, whether it runs on the processor; whether speech input and output exist; whether there are chats to export. A phone hears "Everything here can run on the phone itself" and a download of about 1.2 gigabytes; a computer hears about the larger model; no graphics card adds "replies will be slower".

**Actions** run from a real key press or tap (browsers only allow a file chooser inside one). If a request arrives by speech, items that need a tap show a button ("Choose a backup file") and Roberta says to tap it.

## Understanding what is said

Pressing numbers always works. Speech goes through the browser's speech recognition (one utterance per tap of Speak, so there is no echo of her own voice) and is matched to a topic by `chat/roberta/intent-router.mjs`: word matching works immediately and a small embedding model improves it once it has loaded in the background. See `docs/EMBEDDINGS.md`. A confident match behaves like pressing the key; an unsure one says it could not match and offers the two nearest topics; the keypad is always there.

## Voice notes and voicemail

* **Any reply can become a voice note** (Voice note on a reply). It is the reply spoken by the browser's voice, one sentence at a time, with play and pause, tap-to-seek on the waveform, speeds 1x to 2x, an estimated length and "Show text". The choice is saved with the message. The length is an **estimate** from the word count: the sound is text-to-speech, not an audio file, and nothing is recorded.
* **Record a voice note** (the waveform button by the composer, or "leave a voice message" in Roberta's menu) listens for as long as you talk, keeps going across the browser's pauses, then shows what it heard so you can correct it before sending. The message is the **transcript**, marked "Voice note · 0:42"; **the audio is not saved**. If the model is not ready the message waits and is sent when setup finishes, like any first message.
* Voice uses the browser's own speech services, which may send audio to its speech service (the Privacy page says so).

## Editing and guarding the copy

Scripts, menu, example phrases and keywords are all in `chat/roberta/ivr-content.mjs`. `tests/ivr.test.mjs` checks the menu numbering, that every item has copy, that example phrases are unique across topics, that the owner's own sample questions are present, that no script claims a human inner life, and that scripts adapt to device and model state. If you change `examples`, regenerate the vectors (see `docs/EMBEDDINGS.md`); a test fails until you do.

## Not verified here

* Real phones: text-to-speech voices, the tones, vibration, full-screen layout and the microphone were exercised in headless Chromium with mocks only.
* How the voices sound: only the browser's voices exist, so Roberta sounds like whatever voice the device offers.
