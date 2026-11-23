# The channel client (preparation for board T953, a bounded part of T443)

`chat/channel/client.mjs` is PLC's side of Sonalon's **message handoff contract** (board T379; a pinned read-only copy of the contract, its schema and thirteen fixtures is in
`tests/fixtures/message-handoff/`). It lets a person's words reach one running mind, shows what the contract's receipts say, and receives her replies from a stream.

**Status: preparation.** It is tested against the contract's reference endpoint (`tests/helpers/handoff-oracle.mjs`, a copy of Sonalon's, with the schema check made structural) and is
**wired into the page by `chat/mind/`** (docs/MIND-CONVERSATION.md). It has never run against a real mind: that needs Sonalon's endpoint (T952), and T953 stays open until it does, in the deployed app.

## What it does

* **Sends** words as contract messages: one id per attempt group, reused unchanged on every retry; the occurrence digest covers the words only; `after` is the previous message that was not refused.
* **Shows five states** (accepted, delivered, exposed, interpreted, persisted), each reached once and in order. A held message shows `waitingFor`.
* **Resolves an uncertain outcome by asking** (`status-query`): known means do not resend; not known means send the SAME message again, unchanged.
* **Receives replies** from a stream resumed from the last sequence number. Every reply has an occurrence identity (`occ.source` + `occ.id`); one seen is never shown again, also after a reconnect
  or a reload (the seen keys, the cursor and the messages are kept by the caller's `store`). Only the delivered text is shown.
* **Says when she cannot be reached.** `unavailable`: a closed tab or a stopped host (a refusal; nothing was queued). `unreachable`: no answer at all. A message that got no answer is `unknown`,
  never shown as sent. `retry(id)` sends the same message again.
* **Revocation**: the cutoff is the id of the last message the endpoint accepted from this participant.

## What it never does

* Answer in her place: it has no model, prompt or fallback (the tests read the source for it).
* Store her words anywhere itself: no storage, no ledger (`plc.encounters.v1`), no typed records. Until John says it is fine and real deletion exists (board T896), her words are not kept.
* Open a connection, name a host or touch the page. The `transport` and the `store` are the caller's.

## Not yet decided

The stream's sequence numbers and the shape of the real transport belong to Sonalon's binding (T952, the own-computer endpoint, then a relay). The `transport` interface in the file header is
provisional until that exists.

## The HTTP binding and what it can and cannot know (T953)

`chat/channel/http-transport.mjs` carries the contract over ONE route, `POST /message-handoff`, with NDJSON answers and **no subscription**: her replies are fetched by polling a `status-query`
that names a message id the person sent (`transport.track(id)`, also for the ids already in a chat after a reload; while nothing is tracked it asks about a probe id nobody sent, so the state of the host is
known before the first message).

* A poll that gets no answer at all closes with `unreachable`, and the client says `unreachable`; a refusal (`unavailable`) is an answer and makes the client say `unavailable`. The two are never mixed.
* Every non-reply record a poll brings (a status, a refusal) is passed to the client (`onRecord`), so later receipts arrive and a host that is back makes her available again.
* **Unasked words can only be received through polling of tracked ids on this binding.** A word she says with no message of the person's behind it reaches the page only if a poll's answer carries a reply whose
  `causes` are not messages of the person; the screen shows exactly that case as an unasked word. A binding with a subscription would not have this limit.
* `client.adopt(...)` takes over a message the page holds but the client has no record of (its outcome is unknown, never assumed); `client.checkStatus(id)` asks once.
* A page served over https cannot call a plain http address on this computer (see the loopback matrix of the UI team); the screen says BLOCKED, never unreachable, when it can tell.

## The poll schedule (T953)

The loop asks every `pollMs` (1.5 s) for 30 s after anything happened (a send, `transport.nudge()` for Check status, a reply, the tab shown again); then the wait doubles up to 15 s while nothing arrives. A tab hidden for
more than a minute is not polled and is asked at once when shown. The page tracks only the last 20 sent message ids, and keeps asking about a message after its reply came, because the host records the
later receipts (Understood, Saved) only when her own cognition does, minutes later or never: not reached is "not yet", never a failure.
