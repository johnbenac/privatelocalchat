# A conversation with a mind on this computer (board T953)

A thread kind (`thread.mind = { name, address, resident, encounter, participant, timeoutSeconds, ignoreRefusalsBefore }`, and for a relay also `via: 'relay'` and `channel`) whose other side is a running mind reached
through the message handoff contract, over HTTP on the same computer or through a relay (`chat/channel/`). The mind is not a model: nothing in the app answers in her place, shows typing dots or a placeholder, and nothing answers an unasked word.

* **Entry**: composer "+" menu and Explore, "Talk with a mind on this computer". Shown everywhere; where the page cannot reach loopback (`canReachLoopback`) Open is disabled and the sentence is shown.
  First use opens setup (`plcDialogs.open`); later it selects the existing conversation. "Connection" in the thread reopens setup.
* **Screen** (`chat/mind/mind-screen.mjs`): the name as the h1, the fixed sub-line, the status line (polite region; failures in an assertive one), the messages, the composer (disabled with the reason, never hidden).
* **States** (`mind-model.mjs`, `statusOf`): available, unavailable (a refusal), unreachable (no answer), blocked (the browser refused: an https page calling http loopback), outcome unknown (hatched marker on that
  message), not admitted, and checking. The receipt words are ONE object, `RECEIPT_WORDS`, for the owner of wording.
* **Storage** (T966): both sides are ordinary messages of the chat; hers carry `mind.occ` (source + id) and a message id made from it, so a reload, a repeated poll or a second tab writes a word once. Deleting the chat
  deletes her words (the vault compacts as for any chat). `plc.mind.v1` holds bookkeeping only (ids, receipts, cursor): no words. The encounter ledger does not observe these chats.
* **Tests**: `tests/mind-model.test.mjs`, `tests/mind-store.test.mjs`, `tests/channel-*.test.mjs`, `node scripts/e2e.mjs mind-conversation`, and the optional `scripts/mind-host-check.mjs` (a real host).

* **Wording of the status**: a configured name reads "Connected to Ada on this computer."; the neutral default "a mind on this computer" reads "Connected to a mind on this computer."
* **Setup**: Check sits directly above its answer in the scrolling part of the dialog (assertive for a failure, scrolled into view). On a plain http page on this computer the address is prefilled, and `/host.json` names her.
* **Top bar**: the thread title and the pill are filled as for any chat; the screen's own h1 is in the page only while shown.
* **Receipts**: the highest stage is shown calmly; stages not reached are listed as "not reached yet", without alarm.

## Through a relay (T1124)

Setup begins with "How do you reach the mind?": **On this computer** (the loopback address, as before) or **Through a relay**. A relay needs an address (given by whoever runs it), a channel, an access token
and the same three ids. Where this device cannot reach a mind on itself (a phone) the first choice is off, with its sentence, and the entry can still be opened. Nothing on a relay conversation says "this computer":
the sub-line is "Reached through a relay.", the status "Connected to Ada through a relay.", the default name "a mind". The entry's own name is unchanged.

* **The token** is typed into a hidden field, returned by the setup apart from the rest, and kept in session storage for the tab (`plc.mind.relayToken.v1`, by chat id): a new session asks for it again ("Add your
  access token to connect."), a saved chat, a chat history file and a backup never hold it. In "Connection" the field is empty and an empty field keeps the saved token.
* **Check** connects to the relay for a moment, sends nothing, and says what the relay answered. It connects as the same person, so a conversation open in another tab is stopped by it (the setup says so); this tab lets go
  of its own connection while the dialog is open and takes it back on Cancel.
* **States**: available, unavailable (the mind is not connected to the relay: an answer), unreachable (no answer; reconnects with a wait that doubles), could not connect securely, opened in another tab (never
  retried; "Use it here"), no longer allowed (never retried; "Change connection"), no token. The table with the exact sentences is in docs/CHANNEL-CLIENT.md.
* **Compatibility**: a build from before the relay opens such a chat as if the relay address were a loopback host and says unreachable; nothing is lost. The fields are additions to `thread.mind`; no stored format changed.
* **Tests**: `tests/channel-relay-transport.test.mjs`, `tests/mind-relay-setup.test.mjs`, `tests/mind-relay-token.test.mjs`, `node scripts/e2e.mjs mind-relay`.
