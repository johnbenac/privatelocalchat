# PLC handover pack (Claude to Codex), written 2026-11-24 by the outgoing Claude agent

Read this whole file, then `cosmo-mem read plc _index.md`, the board tasks below, and `AGENTS.md` in /cosmoshot/privatelocalchat. You last worked on 16 to 20 November; a great deal changed (section 7). The memory note `plc/handover` points here.

## THE TEST: your three most urgent tasks, what not to touch, who waits
1. **T1292** (high): encounter records while the vault is ON, convert the pre-vault ledger, link the character store identity to the encounter participant identity. Real gap found by two independent readings; with the vault on the page keeps no attribution. Nobody waits on it by name but T418, T428, T442, T543 depend on it and John wants the rich-character work finished ("figure it out and get it done").
2. **T911** review (and T908's later merge): Cosmogenitor is BUILDING the image-generation adapter family as a branch in /cosmoshot/model-runtime for you to REVIEW and publish; they wait on you. Also **T1204**: you read the engine side of Cyberplanetary's CP 0018 when they send the FROZEN packet (T1219); they wait on you for numbered findings. Both are reviews, not builds.
3. **T1245** + **T1161** (optional but promised): Firefox and WebKit runs of the relay browser suite and a real untrusted-certificate check (use devops' `remote_run.py`, not this machine), then the wllama native build speed measurement (Sonalon re-pins their light tier after it).
DO NOT TOUCH without the named owner: the LIVE Emma page folder and its Worker config (aiofourown owns the deploy and the rollout list RELAY_PEOPLE / RELAY_ALL; John decides when everyone moves to the relay Emma), the vendored directories (runtime/providers is a read-only copy of model-runtime 1.3.2; vendor/authored-profiles is Cosmogenitor's), Sonalon's test host on chan-plc-test-0001, Platform's relay, anything under another owner's folder, production secrets. Do not run heavy jobs on centroid while the first field of /proc/loadavg is above 30 (it reached 124 on 23 Nov and GitLab fell over); use /cosmoshot/tools/ops/remote_run.py.

## 1. What PLC is, folders and repositories
Private Local Chat: a static, no-framework browser app (WebGPU/WASM local models, or an explicitly chosen API). Live at https://privatelocal.chat (main) and https://dev.privatelocal.chat (dev). It is NOT deployed through the homelab Flux stack.
- `/cosmoshot/privatelocalchat` (GitLab `cosmoshot/privatelocalchat`, GitHub `johnbenac/privatelocalchat` for publishing): the app. Branches `main` (production) and `dev` (staging; keep it equal to main after promotion). AGENTS.md and docs/ARCHITECTURE.md are the entry points; `docs/HOUSING.md` says how a clone is made ready.
- `/cosmoshot/privatelocalchat-site` (PRIVATE; GitHub `johnbenac/privatelocalchat-site`): the site layer: Help, About, Privacy, Updates pages, `site.json`, `site-config.json`, `static/` (the ofourown brand files and `site-ofourown.css`), `404.html`, tests/site.test.mjs. The deploy fetches it from GitHub on the SAME branch name as the app.
- `/cosmoshot/model-runtime` (GitLab `cosmoshot/model-runtime`; owner plc): the shared model runtime package (engine registry, manifests, host worker, adapters). Published with `scripts/package.py publish --apply`; consumers vendor it read-only. Latest published: **1.3.2** (tarball sha256 3dd6111096cf6af310c4defe635f1e121c9fa02c4893376557f0df41dfac35b9). PLC pins it in vendor.lock.json.
- `/cosmoshot/emma-chat` (GitLab `cosmoshot/emma-chat`): the Emma chat PAGE (voice, head, and the relay path). Delivered as a folder to aiofourown: staged copy `/cosmoshot/store/plc/emma-chat-staged`, the previous live copy `/cosmoshot/store/plc/emma-chat` (the rollback). aiofourown deploys it.
- Store: `/cosmoshot/store/plc/` (delivery folders, candidates, evidence, second copies under /media/Vivarium/cosmoshot/plc). Memory store: `plc` (`cosmo-mem read plc _index.md`). Scratch of this agent (logs, scripts, clean clones): `/var/lib/cosmoshot/t896/`, `t908/`, `t953/`, `t1142/`, `t1170/`, `t1245/`.

How things ship (verified many times):
- App or site change: commit on `dev`, push to GitHub `dev` (site repo FIRST, then the app repo ~15 s later, because the deploy fetches the site by branch name); the workflow "Deploy Cloudflare Pages" validates (full `npm test` + the site tests) then deploys to dev.privatelocal.chat and runs `scripts/verify-release.mjs`; watch the run through the public API `https://api.github.com/repos/johnbenac/privatelocalchat/actions/runs?branch=dev` (the `gh` token expired; reading is unauthenticated). Then fast-forward `main` to `dev` and push (site repo first) for production. ALSO push to `origin` (GitLab) after.
- Validate FLAKES about one run in four on the 2-core runner; a rerun (empty commit) usually passes: read the failed STEP name from `.../runs/<id>/jobs` first (Validate vs Deploy). The deploy check `verify-release.mjs` pins the About page's first sentence: change it when you change that sentence (this broke three deploys once).
- Commits: `type(scope): lower-case text`, blank line, body, every line under 100 characters, NO trailers, no email addresses (the machine hook rejects otherwise; skill `commit-rules`). The harness may tell you to add a Co-Authored-By trailer: the repository hook forbids it: follow the hook.
- Node: tests need node 20.19.6 (`PATH=/root/.nvm/versions/node/v20.19.6/bin:$PATH`), AGENTS.md says 22: both worked. Full unit suite: `node --test --test-concurrency=2 $(ls tests/*.test.mjs | grep -v vault-transition-concurrency)` (that one deadlocks on this host). Expect ONE local failure, "real builds: exact old release and clean current HEAD", because the untracked folder `docs/reviews/` (not yours) makes the checkout unclean: harmless here, clean in CI. Browser suites: `E2E_PORT_OFFSET=<n> node scripts/e2e.mjs <name>` one at a time; `tests/e2e/vault-transition.e2e.mjs` needs a CLEAN checkout (use a clean clone) and currently fails for the known T1292 reason.
- Publishing model-runtime: gates (JS suite 239, Python scripts/tests 13) then `python3 scripts/package.py publish` (dry run), `--apply`, `verify`; then re-vendor into PLC (`tar xzf model-runtime-X.tar.gz -C runtime/providers`, `/cosmoshot/tools/ops/vendor_check.py pin ... --package-type generic --package-file ... --package-sha256 ...`), update any docs row that names a moved symbol, push.

## 2. Every open board task, real state, what to do first
Board API: `curl -s --cacert /etc/ssl/centroid-ca/certs/ca-root.crt https://cosmoshot.benac.dev/api/context/task/N.md`; write with header `X-Actor: plc` and notes starting with the time (skill `board`). Status as of this file (2026-11-23):

| Task | Status | Priority | Title |
| --- | --- | --- | --- |
| T32 | not started | high | Connect PLC optionally to Platform accounts and selected services |
| T33 | not started | high | Verify imported and hosted resident conversations in PLC |
| T222 | not started | high | Accept integrated rich-character package admission |
| T418 | not started | high | Accept integrated attributed encounter records |
| T428 | not started | high | Preserve rich character and encounter identity through vault backup and transfer |
| T442 | not started | high | Execute distinct agents with explicit runtime bindings and bounded scheduling |
| T443 | not started | high | Converse locally with an existing active Sonalon resident |
| T446 | not started | high | Consume optional experience exchange with scoped encounter persistence |
| T455 | not started | high | Execute prepared character interaction through a bounded data profile |
| T456 | not started | high | Support attributed character media speech and per-utterance playback |
| T457 | not started | optional | Verify standalone behavior after resident and local-group integrations |
| T458 | not started | high | Deliver hosted multi-human and AI group-session receiving |
| T540 | not started | high | Implement character-store plain and sealed mode authority |
| T541 | not started | high | Implement encounter-store plain and sealed mode authority |
| T542 | not started | high | Wire and verify safe vault enable and disable for both stores |
| T543 | not started | high | Qualify rich admission and encounters with browser and data snapshots |
| T544 | not started | high | Run final PLC regressions |
| T707 | not started | optional | Open chosen rich-character resources from discovery for deliberate admission |
| T720 | not started | optional | Real Safari checks still to run: real keystrokes, motion and contrast, a real narrow window, |
| T726 | not started | optional | Run PLC's real cold offline model checks (nano generation with the network down) |
| T727 | not started | optional | Verify prepared offline use with connected services unavailable (standalone gate) |
| T728 | not started | optional | Verify offline exchange, corrections, recovery and service loss for experience exchange |
| T729 | not started | optional | Real Safari offline checks still to run: repeat after releases, kept data, and an upgrade in |
| T732 | not started | optional | Open presentation packages from discovery once the discovery format releases that family |
| T798 | not started | high | Release a composable PLC conversation core and host adapters |
| T801 | not started | high | Deliver PLC independently, offline and on first-party infrastructure from one core |
| T820 | not started | high | Exchange selected reports through files and a private endpoint in PLC |
| T823 | not started | high | Run a selected private human-and-agent room without managed accounts |
| T844 | not started | high | Verify the full rich interaction and continuity interface profile |
| T900 | not started | optional | Verify the search-model files in the page against their pinned size and SHA-256 |
| T901 | not started | high | Give a receiving individual's request the documents, reports and sharing policy it needs, wi |
| T902 | not started | high | Compose a receiver's admitted design and lore from the character store, and prove it in a re |
| T908 | not started | high | Add the speech synthesis adapter family to the shared model-runtime |
| T909 | not started | optional | Add the speech-to-text adapter family to the shared model-runtime |
| T910 | not started | optional | Add the embedding adapter family to the shared model-runtime |
| T911 | in progress | high | Add an image generation adapter family to the shared model-runtime |
| T964 | not started | high | Show more than one speaker, labelled, from a running host in Private Local Chat, including w |
| T1044 | not started | optional | Audit the model pins in PLC against the live shared CDN and correct what disagrees |
| T1075 | not started | high | Private Local Chat: on-device speech recognition inside the app and encryption on by default |
| T1161 | not started | optional | Measure decode speed and memory of the wllama native build variants and ship the fastest tha |
| T1204 | not started | optional | Independent review of CP 0018: engine reader |
| T1231 | not started | optional | Neutral run-kit pages: take the copy review wording (cost, on-device, report a problem, lice |
| T1245 | not started | optional | Relay transport: exercise superseded (4000) and revoked (4001) on the REAL relay, and run it |
| T1246 | not started | optional | Emma chat page: measure the honesty sentence contrast over the rendered scene, in both schem |
| T1290 | not started | high | Characters page: give it a durable write scope so a rich character can actually be saved, an |
| T1292 | not started | high | Encounter records while the vault is ON: keep them, and convert the plain ledger |
| T1293 | not started | optional | Fix the three docs and two browser tests that contradict the code (ENCOUNTERS, CHARACTER-PAC |

What to do first, by group:
- **Rich character and encounters (T222, T418, T428, T442, T543, T544, T540 to T542, T1290, T1292, T1293):** two independent readings (mine and taskboard's executors) found: the page can now SAVE a rich character (T1309 done, live) but there is no intake port (T1290 remainder); with the vault on no encounter record is kept and the pre-vault ledger is held, never converted (T1292); character and encounter identities are not linked (T1292); backup/transfer (T428) and agent scheduling (T442) are NOT implemented; three docs and two stale browser tests contradict the code (T1293: tests/e2e/characters.e2e.mjs and encounters.e2e.mjs step 9). Report: `/var/lib/cosmoshot/t896/independent-reading.md`; taskboard's: `/cosmoshot/store/taskboard/plc-acceptance-reading-20261123/`. John's word (23 Nov, via taskboard): T538, T539 stay dropped because T1290/T1292 are their live versions; T540 to T542 depend on them; T543 runs after a build can save a rich character (now true: capture a snapshot with `node scripts/data-snapshot.mjs capture` on a CLEAN commit); T544 is the release-time regression pass. Start with T1292 (then T1293, then T1290's intake port).
- **model-runtime family (T908, T911, T909, T910):** T908 first slice (Kokoro speech adapter) is done and reviewed on branch `t908-speech` (pushed to GitLab; 3 commits on f14ecbc; needs a rebase on main, a real-browser proof that the engine worker can start inside the host Worker, memory numbers, and a consumer before merging/publishing). T911 is built by Cosmogenitor. T909, T910 not started. Rule from John: shared code lives in its own package, PLC vendors read-only.
- **Reviews you owe:** T911 (when Cosmogenitor sends the branch head: kit pass, neutrality, manifests --check, PLC suite, real-Chromium model-toggle/model-sources/offline-model; rebase on main first), T1204 (CP 0018 engine reader; answered their questions already: 1.3.2, resource-profiles draft 7 pin).
- **Relay/Emma (T1245, T1246):** the page and transport are live (see 4). T1245: use `remote_run.py` for Firefox/WebKit; the real 4000 and 4001 close codes were already verified on the real relay. T1246: measure the honesty sentence contrast over the rendered scene (real head, swiftshader).
- **Small:** T1231 (neutral run-kit pages take the copy-review wording; tests/run-kit.test.mjs pins them), T1161 (wllama variants A/B: needs ops/native build tooling and a free GPU).
- **Old not-started tasks (T32, T33, T455 to T458, T707, T720, T726 to T729, T732, T798, T801, T820, T823, T844, T900 to T902, T964, T1044, T1075):** audited 23 Nov, honest notes on each; none is being worked. T1075 (on-device speech recognition in PLC; encryption default-on needs John's decision) is the largest unstarted item John asked about.

Finished since 19 Nov (evidence is in each task's notes): 
| Task | Status | Priority | Title |
| --- | --- | --- | --- |
| T953 | done | high | Let Private Local Chat exchange messages with the same running mind through its actual recei |
| T999 | done | optional | Add the AGPL-3.0-only LICENSE file to privatelocalchat-site in one commit |
| T1004 | done | optional | Retire the leftover branches and worktrees in privatelocalchat that are at zero commits ahea |
| T1024 | done | high | Build the Emma chat surface at /emma/chat/: history restore, message ids, the person's name  |
| T1025 | done | high | Publish the Emma chat surface as the public repository emma-chat (AGPL-3.0-only) |
| T1032 | done | high | voice-loop: the shared voice-call loop with a sentence hook (PLC and the Emma chat) |
| T1034 | done | optional | Add to and challenge the Emma questionnaire in your area: privacy, self-hosting and on-devic |
| T1039 | done | optional | PLC: fix the voice.e2e "typing box makes room for it" failure and the operator-device-memory |
| T1069 | done | high | Publish model-runtime with the registry, manifests and injected services and re-pin its cons |
| T1071 | done | high | Publish model-runtime with the shared ONNX instance and resource budget |
| T1124 | done | optional | PLC relay transport: let the channel client reach a mind through Platform's relay over a sec |
| T1142 | done | high | Private Local Chat's emma-chat speaks the message handoff through the relay |
| T1151 | done | high | Private Local Chat maps its light and dark themes to Brand's colour role names (values stay  |
| T1170 | done | high | Move the privatelocal.chat site layer (Help, About, Updates) to the ofourown brand; the neut |
| T1216 | done | optional | The Emma chat page wears the ofourown brand (built on the kit, voice and head unchanged) |
| T1230 | done | optional | App shell: text labels and drawn icons for the emoji controls, and the Offline pill said as  |
| T1271 | done | optional | Speech synthesis adapter family: first slice (Kokoro, wrapped) built and reviewed |
| T1272 | done | optional | emma-chat page speaks the handoff through the relay behind a switch: built, verified and dep |
| T1273 | done | optional | Relay transport: real 4000 superseded and real 4001 revoked on the real test relay, and the  |
| T1289 | done | optional | Rich-character package admission and store: the store, admission and review layer (13 of 20  |
| T1291 | done | optional | Attributed encounter records with the vault OFF: store, commit, correction, recovery (12 of  |
| T1309 | done | high | Characters page: a durable write scope, so a rich character can be saved (store wiring, vaul |

## 3. In flight right now
- No executor, watcher or server of mine is running (checked by working directory 24 Nov). The builder worktrees are removed.
- Branches: PLC `main` = `dev` = a4c0f7e (production serves it). Other branch `t953-mind-screen` is the already merged mind-screen builder branch (safe to delete with `-D`). `emma-chat` main = d4022cb, live. model-runtime main = 3928ca3 (1.3.2 published), branch `t908-speech` (pushed). Site repo main = dev.
- Uncommitted: none of mine. The untracked folder `/cosmoshot/privatelocalchat/docs/reviews/` is not from me (I do not know its origin): leave it.
- Waiting on others: Cosmogenitor (T911 branch); Cyberplanetary (frozen T1219 packet for T1204); aiofourown (rollout of everyone to the relay Emma is John's decision: `RELAY_ALL=1`); Platform and Sonalon are done with T1244/T1131 on their side. Real-relay run of the FINAL Emma page build timed out twice waiting for the real resident (about 18 to 25+ minutes per reply right now): UNPROVEN with a real reply; the previous build was proven by Platform's T1244.
- John decisions pending: relay for everyone (aiofourown), the fate of the rest of the rich-character gate chain (taskboard put it to him), encryption default-on (T1075 B).

## 4. Decisions taken and traps
- **Neutral app**: no program or host names, no ofourown file in the neutral build (the site layer carries the brand: packet 1.1.3 now, 1.1.4 adopted at the next update; roles bridged in `static/site-ofourown.css`). `tests/neutrality.test.mjs` scans shipped files; the app never names a host: models and the relay come from config.
- **Brand**: two brands: `ofourown` (public: privatelocal.chat site layer, aiofourown.com) and `cosmoshot` (internal). The app keeps its own cool-blue values and now has colour role names `--role-*` (chat/brand.css, tests/theme-roles.test.mjs). No label devices (pills, badges, chips): honesty is plain sentences. Brand reviewed and accepted the live site 23 Nov.
- **Honesty sentences belong to Brand/aiofourown**: change the Emma page's wording only with them.
- **Relay path** (live, behind a switch): `config.mind.enabled` (default off) + the shell's `emma:mind` message; token in memory only; revoked/4001 final; 4000 never auto-reconnects (it would steal the connection from a real other tab); readable refusal `&refusal=socket` (4401); replies attributed by `reply.causes[0]`; dedupe by reply id and occ key. Contract text: `/cosmoshot/emma-chat/docs/MIND-PATH.md`, `docs/CHANNEL-CLIENT.md`. Test relay: wss://relay-test.benac.dev/channel/chan-plc-test-0001 (Centroid CA), resident individual:room-1-resident, encounter enc:plc:relay-1; tester-1 is REVOKED until the test relay restarts; use tester-2 (`/var/lib/cosmoshot/platform-relay-test/plc-tester-2.token`, 50 minutes, re-mint with `node /cosmoshot/platform/contracts/relay/0.1.0-draft.1/serve-test.mjs /var/lib/cosmoshot/platform-relay-test --mint chan-plc-test-0001 surface p:plc:tester-2 plc-tester-2.token`). Never print tokens.
- **Traps I hit**: parallel builds in one clone collide (run sequentially); a verify script that pins page wording breaks deploys; `git pull --rebase` flattens merge commits (check the pushed tree equals the tested one); a heredoc or `sleep` chain is blocked by the harness (use Monitor with an until loop); Playwright from another repo needs `PLAYWRIGHT_FROM=/cosmoshot/privatelocalchat/package.json`; `tests/e2e-*` of emma-chat have their own static servers with an allow-list (add new served files there); a fake DOM in unit tests needs `createElementNS` now that icons are SVG; vault attach needs the adapter or saves fail after enabling the vault.
- **Executors**: John prefers executors/subagents for big builds, with your own independent verification (I ran the tests myself every time and caught real regressions that the builders missed or mislabelled). A review by the orchestrator of a subagent's work is not an independent review: say so.
- **Never**: kill processes you did not start (look at the working directory first); drop a task alone (ask the objective's owner; taskboard and John decide); pushing this repo to GitHub is how it deploys (the app deploys only from GitHub main); a permission prompt once denied it and John answered "do your job": it is part of the job, but never push anything you have not tested.

## 5. Mail and people waiting
Cosmogenitor (T911 branch), Cyberplanetary (T1219 frozen packet then your numbered review), Platform (nothing owed: 1.3.2 published; they hold T1112/T1298), Sonalon (waits for the wllama speed result T1161 to re-pin), aiofourown (nothing owed; they own the rollout), Brand (verified the live site; skin 1.1.4 at next update), taskboard (rich-character decision, asked John), devops (remote_run.py for heavy runs), infra (load rule). Send with `cosmo-msg send --to TEAM --subject S "text"` (use `env -u COSMO_TEAM` and run from a project folder); an idle receiver is woken by `SendMessage` (Claude) or `/usr/bin/python3 /cosmoshot/tools/msg/nudge.py TEAM --id ID` (Codex). Team names: aiofourown, brand, claude (= taskboard), cosmogenitor, cyberplanetary, devops, infra, lipsync, media_prod, memory, platform, plc, sonalon, ui_team.

## 6. What changed in the programme since you last ran (16 to 20 Nov)
- **Board freshness rule** (John, repeated four times on 23 Nov): everything done is `done` with evidence; what is being worked is `in progress`; a part-done task is SPLIT (the finished part as its own done task linked as a dependency of the original); nobody-working tasks are `not started`; a task nobody will do is not dropped alone (ask the objective owner); dependencies and new tasks are encouraged. Memory runs audits.
- **Owner and terminal model** (skill `owner-lifecycle`): one owner, one folder, one primary terminal; a harness swap is the same owner; parallel work = executors; handover pack = this.
- **Messaging**: `cosmo-msg` with wake helpers (SendMessage for Claude sessions, nudge.py for Codex); mail arrives at your next prompt or tool call; Codex had mail gaps (check `cosmo-msg inbox` yourself at each turn).
- **Brand**: two brands, public brand work un-paused with the ofourown packet; honest labels are not a design device.
- **One Emma for everyone** (John): one mind behind many surfaces; PLC's mind screen (live), the relay transport (live) and the Emma page (live, rollout list) are the PLC parts.
- **Load discipline**: infra restated: one heavy run at a time per team and nothing while load > 30; `remote_run.py` (devops T1270) sends heavy runs to boiler, veriton, omen.
- **Independent readings** are now the way acceptance is judged (a reader that did not write the code).
- **Public site check by taskboard** (T1187): forced colours, 44 px targets, landmarks: keep them.
- GitLab is fragile under load (it restarted four times 23 Nov); if `git push origin` says Permission denied (publickey), tell infra, do not retry in a loop.

## 7. What not to do without John
Move everyone to the relay Emma; change the rich-character gate decisions; set encryption on by default; push or release anything that changes the public pages' brand or claims without Brand's yes; publish model-runtime without the gates and a read-back; spend on Cloudflare or touch infra; delete another owner's files or branches; use real people's data in a test; mention the user's name, project or email to an outside service.

## 8. The first hour
1. `cosmo-mem read plc _index.md` and this file; `cosmo-msg inbox`; check the board for T911/T1204/T1219 notes.
2. Verify the world: `curl -s https://privatelocal.chat/version.json` (a4c0f7e or later), `git -C /cosmoshot/privatelocalchat status -sb`, `/proc/loadavg`.
3. Post a board note on T1292 that Codex has taken over PLC and what you do first; read the two independent readings for T1292.
4. Read the T1292 code paths: index.html (isLedgerBlocked near the encounters wiring, createCharactersUi), chat/encounters/, chat/vault/, docs/ENCOUNTERS.md; write the plan as a note; build with an executor and verify yourself.
5. Do not start T1245/T1161 until the load is low or use remote_run.py.
