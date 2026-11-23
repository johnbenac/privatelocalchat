# A conversation with a mind on this computer (board T953)

A thread kind (`thread.mind = { name, address, resident, encounter, participant, timeoutSeconds, ignoreRefusalsBefore }`) whose other side is a running mind reached through the message handoff
contract over HTTP on the same computer (`chat/channel/`). The mind is not a model: nothing in the app answers in her place, shows typing dots or a placeholder, and nothing answers an unasked word.

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
