# Solo responsiveness

Practice Yard and Bot Duel now use the browser's shared simulation even when Render is online. Multiplayer continues to use the game server. Local input reaches authority sooner; the measured frame rate remains essentially unchanged.

## Baseline and scope

Base: `aad49e8e46ffeb70da394ec91e3345f8c6f6d888`, current GitHub main at the start and final fetch. Branch: `feat/solo-local-responsiveness`.

Open Draft PRs 145, 146 and 147 were inspected. Their support, release and Inspection Yard changes remain separate. The active Claude checkout was left untouched. This branch changes no shared combat, movement, spell, bot, animation, model or balance files.

Before this change, `GameLink.startSolo` preferred Render whenever connected. Offline fallback used LocalHost. The debug client exposed these same hosts; it provided no special faster combat simulation. A standalone model preview has a different workload and cannot establish gameplay performance.

The profiling identified two avoidable local delays: the existing 50 ms movement packet throttle and queued delivery of already completed local tick facts. Simulation and cloning costs were small. The evidence supports removing those delays while keeping the 30 Hz timer, snapshot copying, prediction and interpolation.

## Implementation

| File | Change |
| :--- | :--- |
| `client/network/GameLink.mjs` | Always route Practice and Bot Duel locally. Ignore background remote room events while playing locally. Carry confirmed profile cloth into solo. Stop the local host when entering multiplayer. |
| `client/network/LocalHost.mjs` | Deliver detached tick events and snapshots synchronously. Keep bootstrap messages queued. Discard queued messages from abandoned rooms with a generation counter. Suppress an old snapshot if a synchronous event handler leaves the room. Carry the confirmed cloth choice. |
| `client/game/movementInput.mjs` | Send local movement intent each render frame. Preserve the existing remote 50 ms cadence and the Inspection Yard frozen input gate. |
| `client/game/GameRuntime.mjs` | Submit local intent early in the frame, before the next combat tick can consume it. Retain remote sending at its existing location. |
| `client/menu/renownView.mjs` | Describe local results as solo training rather than offline training. Rewards remain server verified. |
| `client/network/offline.test.mjs` | Cover online solo routing, loadouts, cosmetics, background reconnect isolation, multiplayer handoff, detached immediate delivery and abandoned room messages. |
| `client/game/movementInput.test.mjs` | Cover next tick local intent, unchanged remote cadence, unchanged simulation advancement and frozen input preservation. |
| `client/menu/renownView.test.mjs` | Check the revised solo reward wording. |
| `docs/SOLO_RESPONSIVENESS.md` | Findings, measurements, verification and integration notes. |
| `docs/evidence/solo/` | Recorded samples, browser probes, deployed source hashes and reproducible summary script. |

Combat still advances at 30 Hz through the same shared simulation. More frequent input updates do not advance movement or combat themselves. Remote packet rate, prediction, reconciliation, interpolation, speed, stamina, hit windows, cooldowns and animations remain unchanged. Local results cannot mint Renown or server verified rewards.

Snapshot cloning remains necessary because serialization contains references into live authority. Consumers and interpolation history must receive detached facts. The measured clone cost did not justify replacing that contract.

## Comparable encounter measurements

Chrome on the same Mac, visible 1280 × 720 viewport, device pixel ratio 1, unchanged desktop visual settings. Each configuration used three 60 second Practice Yard encounters with a responding `FIGHTS_BACK` dummy, preceded by three seconds of warmup. The same browser probe, camera aiming and combat input schedule were used. It exercised movement, sprint, crouch, jump, Guard, sword, Fireball, Dash, damage, death and resets.

The remote runs used the live Render server. Its served combat, practice, movement and wire modules matched the baseline byte for byte; hashes are saved in `remote-source.json`. The remote and old local runs used the baseline implementation, followed by the candidate local implementation in the same browser.

Values below are pooled sample median / 95th percentile in milliseconds. Percentiles use sorted samples at `floor(n × percentile)`.

| Metric | Previous Render solo | Previous local fallback | New local solo |
| :--- | :--- | :--- | :--- |
| Frame interval | 16.7 / 17.2 | 16.7 / 17.5 | 16.7 / 18.3 |
| Sent movement intent to authoritative snapshot acknowledgement | 116.4 / 138.5 | 21.9 / 37.9 | 8.5 / 16.1 |
| Local tick interval, or remote snapshot arrival interval | 33.3 / 40.9 | 33.1 / 34.5 | 33.1 / 34.3 |
| Local snapshot generation time to runtime delivery | Not applicable | 5.3 / 8.5 | 0.3 / 0.9 |
| Frames longer than 50 ms across all three runs | 1 | 0 | 0 |
| Browser long tasks across all three runs | 1 | 0 | 0 |

Frame maxima were 66.6 ms remotely, 33.3 ms in the old fallback and 33.3 ms in the candidate. Local tick maxima were 71.7 ms before and 64.8 ms after. The remote arrival maximum of 635.8 ms includes network delivery and cannot be interpreted as a server simulation tick stall.

The local acknowledgement improvement also holds against the old fallback. Synchronous delivery eliminates its additional task queue wait. The new per frame input schedule separately removes an avoidable wait before the host receives changed intent.

### Keyboard intent probe

A supplementary 20 second probe used the production keyboard listeners for 26 alternating W press and release transitions. This measures the wait before sending, which the encounter acknowledgement metric excludes.

| Metric, median / p95 | Previous local fallback | New local solo |
| :--- | :--- | :--- |
| Keyboard event to sending changed intent | 45.8 / 64.7 ms | 15.4 / 15.9 ms |
| Keyboard event to authoritative acknowledgement | 67.6 / 97.0 ms | 34.9 / 46.2 ms |

Only the first forward transition yielded a useful visible camera displacement sample: 14.6 ms before and 15.1 ms after. Subsequent forward movement reached a wall. Those single samples cannot establish a visual latency improvement. Existing prediction already provides an immediate movement response.

### Costs and smoothness

Old local tick CPU cost was 0.3 / 0.5 ms. Candidate tick CPU cost was 0.4 / 1.0 ms. Candidate tick timing includes synchronous consumer callbacks; the old measurement excludes their queued work. This does not demonstrate more expensive simulation. Copying a message took approximately 0.1 ms median in both configurations.

The median frame interval stayed at approximately 60 FPS and its p95 increased slightly. There is no demonstrated frame rate improvement. No candidate frame exceeded 50 ms in these encounters, but this limited sample does not establish that visual stutters are solved on every device.

Position disagreement before reconciliation remained noisy: p95 0.32 m in the old local host and 0.41 m in the candidate. Resets, deaths and respawns are included, so these values are diagnostic rather than evidence of a reconciliation improvement. Reconciliation was left alone.

The current evidence does not show simulation saturating the main thread. A Worker, timer rewrite or copy elimination would add complexity without a demonstrated benefit here.

## Browser and lifecycle verification

Offline Practice was entered through ordinary menu buttons, configured with a responding dummy, reset and left. Offline Bot Duel was restarted into a new room, advanced through its existing countdown, ran with a responding rival, and returned to the menu. LocalHost was empty afterward.

These offline checks used an already loaded client with its game server connection closed. Cold loading uncached game assets without Internet access was outside this pass.

Bot Duel arena readiness was supplied through the existing authoritative `arenaReady(true)` command because physical Pointer Lock could not be verified in this browser control session. This is a test harness action, not an application workaround.

After solo, the browser reconnected to the local game server, created a private multiplayer room through the menu, and a second real WebSocket client joined. The room reached `PLAYING` with two players, acknowledged a valid movement input sequence, and kept LocalHost empty. Existing server combat tests cover damage, counters, spells and authoritative rules.

Native mouse control reported unavailable windows even after the Mac was unlocked. Automated Start Bot Duel clicks returned `WrongDocumentError` from Pointer Lock although the canvas remained connected to the current document. This check remains unresolved. There is insufficient evidence to attribute that error to this patch, and no speculative input change was made. Physical mouse aiming and Pointer Lock should be checked by the owner before merging.

## HTML5 check

The export process from Draft PR 146 was reused as a standalone helper without merging that branch. The candidate's current client and shared files were exported, the ZIP passed `unzip -t`, and the unpacked client was served inside a local iframe with script, same origin and Pointer Lock sandbox permissions.

The iframe client loaded Castleward and the Spellblade, connected to Render, and entered local Practice through menu controls while Render remained online. A 60 second combat probe verifies the exported client under that sandbox. The recorded HTML5 result and metadata accompany the encounter evidence.

This separate HTML5 run used the browser's normal 714 × 756 window, device pixel ratio 2 and renderer pixel ratio 1.6, with shadows enabled. Its frame median / p95 was 16.7 / 17.1 ms, acknowledgement 8.5 / 15.9 ms and local tick interval 33.1 / 33.9 ms. No frame exceeded 50 ms. The encounter recorded 79 sword swings, 12 spell casts, 7 Dashes, 82 damage events and 13 deaths. These different viewport conditions make it a compatibility check rather than another directly comparable desktop performance result. A preliminary run overlapped repository verification and was discarded; the saved run occurred afterward.

This verifies a local approximation of the intended HTML5 environment. Actual itch.io hosting, cross origin embedding, physical Pointer Lock, mobile devices and touch controls remain unverified in this pass. The game was not uploaded or published.

## Inspection Yard PR 147

PR 147 remains separate. The movement sender explicitly honors its `inspectionFrozen` getter, including frame playback, so live input cannot replace captured input while stepping. A regression test verifies this boundary.

Both branches edit LocalHost and GameRuntime. Integration will require resolving those small overlapping hunks while preserving PR 147's inspection clock and this branch's immediate tick delivery. Run the Inspection Yard tests and frozen frame playback check after integrating; this branch does not claim the combined build is validated.

## Verification

Baseline `npm run verify`: 1,111 tests passed, syntax checks passed, HTTP and WebSocket smoke passed.

Candidate focused routing, input and Renown tests: 25 passed. Final `npm run verify`: 1,118 tests passed, syntax checks passed, HTTP and WebSocket smoke passed. `git diff --check` passed.

No Blender or asset export validation is required because production model and animation assets are unchanged. PR 146's HTML5 packaging was checked separately as described above.

## Reproduction and limits

Open the matching client with `?debug` and keep its tab visible. Use `probe.js` in DevTools, then run `__soloProbe.series('remote', 3)` or `__soloProbe.series('local', 3)`. Choose the remote endpoint before loading. Save `__soloProbe.results`. To reproduce the baseline, use a separate checkout of the stated base commit. To reproduce the candidate, use this branch. Keep viewport, visual settings and browser constant and avoid concurrent verification or other heavy work.

For the keyboard check, run `response.js` after a local encounter, then `await runSoloResponseProbe()`. The camera probe is limited by available space; move its start position into an open area before collecting a larger visible response sample.

Run `node docs/evidence/solo/summarize.mjs` to regenerate `summary.json`. The compressed recordings preserve individual raw samples. The original `actionAck` diagnostic is retained for provenance but deliberately excluded from results because its event mapping and held action timing do not isolate input latency reliably.

Evidence files: `baseline.json.gz`, `candidate.json.gz`, `html5.json.gz`, `baseline-response.json`, `candidate-response.json`, `probe.js`, `response.js`, `summarize.mjs`, `summary.json`, `remote-source.json`, `html5-environment.json` and `html5.png`.

These are instrumented synthetic encounters, not a claim of skilled manual play. Bot randomness and actual contacts differ across runs. JavaScript renderer measurements exclude asynchronous GPU execution and full display scanout. The probe's final renderer counters describe its last render pass, not the entire frame. Settings serialization in the recordings is empty; viewport and device scale were recorded directly and the existing desktop visual settings were held unchanged throughout.

The next useful steps are an owner Pointer Lock check, a combined PR 147 inspection check, and profiling on a slower device or actual itch.io embed. Further smoothness work should follow a captured visible defect rather than another architectural rewrite.
