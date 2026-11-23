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

## The relay binding (T1124)

`chat/channel/relay-transport.mjs` is the same interface as the HTTP transport (`request`, `subscribe`, `track`, `untrack`, `nudge`, `stop`, a `probeId` that is accepted and not needed) over **one WebSocket to a content-blind
relay** that both this page and the mind's host dial out to, so a page served over https reaches a mind from any browser: no loopback address, no mixed content. The wire is the platform's draft
(`/cosmoshot/platform/contracts/relay/0.1.0-draft.1/RELAY.md`, provisional). The app never names a relay: the address and the channel are the person's (setup) or an operator's, like a model source.

* **One contract frame per WebSocket message**, after one routing line: `{"t":"msg"}`, a newline, the frame. A frame over 1 MiB (bytes, not characters) is never sent: it is a refusal `over-limit`.
* **The token** is a WebSocket subprotocol (`relay.v1`, `bearer.<token>`), never in the address and never in a frame. `getToken()` is asked at every (re)connect, so a fresh token the person put in is used and
  none is ever invented. It is kept for the tab only (session storage, key `plc.mind.relayToken.v1`, `chat/mind/relay-token.mjs`), never in the chat or in a saved file.
* **Pushed, not polled.** Receipts, refusals, status and replies arrive when the host sends them. `request(frame)` resolves with the first frame the host answers for it; later ones go to `onRecord`; each reply
  to `onFrame(frame, seq)`. A `status-query` can still be sent (Check status). The relay has no cursor and replays nothing, so after the host is (back) present the transport asks about the last 20 tracked messages.
* **Dedupe.** A reply is passed on once by its reply id AND by its occurrence key `{source, id}`: the same reply twice, across a reconnect, or after a host restart with the same id, is shown and stored once
  (the client's seen set and the chat's own occurrence keys back it up).
* **States** (what `availability` says; the exact sentences are in `RELAY_COPY`, `chat/mind/mind-model.mjs`):

  | what happened | state | sentence |
  |---|---|---|
  | host-present, or any frame | available | Connected to Ada through a relay. |
  | host-absent, or refused: no-host (the relay answered) | unavailable | The mind is not connected to the relay right now. Nothing can be sent. |
  | no answer (a silence, a lost link) | unreachable, reconnects | No answer from the relay at relay.example. Nothing was sent. It may be slow, the address may be wrong, or your access token may have run out. |
  | failed before opening on a secure address | unreachable (insecure), reconnects | Could not connect securely. (The browser does not say why. Nothing was sent.) |
  | close 4000 `superseded` | superseded, never retried | This conversation was opened in another tab, so it stopped here. (Use it here) |
  | close 4001 `revoked` | revoked, never retried | You are not allowed to use this connection any more. Nothing can be sent. |
  | control line `refused` reason `token` then close 4401 (only when the address asks for `readableRefusal`, i.e. `&refusal=socket`) | token-refused, never retried | The relay did not accept your access token. Nothing can be sent. (it does not say whether the token expired, was revoked or was forged) |
  | no token | needs-token, nothing opened | Add your access token to connect. Nothing can be sent. |

  A browser tells a page nothing about WHY a WebSocket failed to open: an expired token (the relay's bare 401), a wrong address and a certificate it does not trust all look alike. The unreachable sentence therefore names
  the token among the possible causes, and a secure address that fails before opening says only that it could not connect securely.
* **Reconnect**: after any other close, 1.5 s doubling to 15 s, reset by any message. A tab hidden for more than a minute is not reconnected until it is shown (then at once). `superseded` and `revoked` are left
  only by the person (`subscribe` again: "Use it here", "Change connection" with a fresh token).
* `suspend()` lets go of the connection without a way back by itself (the setup dialog does it, because its Check connects as the same person and the relay lets the newer connection win).
* **Tested** by `tests/channel-relay-transport.test.mjs` (a scripted WebSocket), `tests/mind-relay-token.test.mjs` (the token record, concurrency and recovery), and `node scripts/e2e.mjs mind-relay` (a fake relay with the
  relay's wire, and the platform's real test relay with a real resident when they are there).
