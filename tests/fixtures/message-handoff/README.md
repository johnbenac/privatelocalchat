# Message handoff contract: a read-only copy for PLC's tests (T953 preparation)

Copied on 2026-11-19 from Sonalon's repository (`origin/main` at `2c67738b`), folder `docs/contracts/message-handoff/`: the contract (`CONTRACT.md`, their
README), the JSON Schema and fixtures `F01` to `F13`. The contract is Sonalon's (board T379); PLC does not edit it. `SHA256SUMS` pins every file
(`tests/channel-client.test.mjs` checks it). If Sonalon changes the contract, copy it again and say so on T953.
The reference endpoint these fixtures are replayed through is `tests/helpers/handoff-oracle.mjs`, a copy of the one in Sonalon's
`tests/message-handoff-contract.test.mjs`, with the schema check replaced by a plain structural one (PLC has no JSON Schema library).
