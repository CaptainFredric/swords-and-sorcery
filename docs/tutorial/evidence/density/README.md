# Greener Pastures density and choreography evidence

Baseline: main `6413249`, containing merged PR 159. Candidate: `polish/greener-pastures-density-choreography`.

## Result and scope

Greener Pastures now has agricultural compositions, worn lanes, readable slalom gaps and a second low sheepfold obstacle. The opening sightline grows from 175 to 225 metres by extending the northern field. The bridge, complaint office and final confrontation retain their established downstream locations.

There are 69 authored farm pieces: 49 substantial physical objects and 20 decorative pieces. The reusable farm kit writes into the existing material batches. Tuft density was reduced in exchange for composed scenery. World geometry is 154,934 triangles, compared with 155,621 before, and remains nine static world meshes. These figures exclude the fixed sky and clouds; they are not total renderer draw calls.

The first duel's genuine accumulated damage triggers a reusable 2.6 second nonlethal buckle, supported brace and rise. The actor remains alive and retains the blow's normal displacement. The existing grounded boot solver carries the pose. The presentation is available to any living actor through `presentationRecovery`; this pass enables it only for Tutorial Rival. No Blender/action assets, health values or shared damage windows changed.

Player movement and look remain available throughout recovery and escape. The former separation based input lock was removed. Rival turns into his departure and uses ordinary route navigation around composed obstacles. His first stile and sheepfold crossings use ordinary Jump physics.

## Jump synchronization

Rival's genuine far side landing and gloat start the exchange while the learner approaches. The final instruction alone waits for the live takeoff zone. Slow movement therefore extends traversal rather than freezing the player or playing the instruction far away.

A meaningful adaptation is intentional: if a player crosses early, the current recording finishes, then obsolete hints and prompts are skipped. Stable recording keys remain in the plan. The closing jokes still play. This trades exhaustive delivery of hints for responsive play.

The final three scene fixtures followed the real wall gaps and used real recorded sources and local movement. They placed actors at the approach, rather than replaying the whole introduction three times. Normal used full walking input; fast used Sprint and jumped early; slow used 80 percent walking input. Every case crossed successfully. Source completion, not a scripted audio timer, advanced each spoken beat.

| Recording begins | Normal distance before wall | Fast distance before wall | Slow distance before wall |
| :--- | ---: | ---: | ---: |
| Rival's gloat | 115.5 m | 105.0 m | 120.4 m |
| What should I do? | 89.2 m | 70.9 m | 99.6 m |
| Minor ledges | 78.8 m | 56.1 m | 91.2 m |
| What does that mean? | 52.2 m | 23.7 m | 68.8 m |
| Rises to the occasion | 41.7 m | 8.0 m | 59.6 m |
| I do not get hints | 2.7 m | skipped after crossing | 29.9 m |
| Jump | 0.8 m | skipped after crossing | 3.4 m |

Distances are longitudinal distances to the stile plane. The fast case finishes its current line before the post crossing exchange. Normal reached the collision face during the final instruction; slow received it shortly before takeoff. Fixture durations were 30.5, 28.0 and 34.6 seconds respectively.

## Opening title and voice

Presentation gating leaves TutorialDirector state intact. Title establishment lasts the existing 1.3 seconds. Caption reveal uses a 180 ms fade and starts the original Narrator source at the same reveal. The first decoded buffer can extend establishment, capped at 2.5 seconds; beyond that limit captions and Continue remain usable and the first recording stays suppressed for that cue. Stale completions cannot reopen an abandoned or restarted tutorial.

Browser checks used actual restart, recorded playback and temporarily delayed native decoding, with the original downloaded audio bytes. Cached restart: voice at 1.330 s, caption sampled at 1.345 s. Muted: caption at 1.317 s and Continue advances to `exemplary`. An added 1.8 s decode delay: voice at 1.953 s, caption at 1.971 s. A 4 s stall: caption fallback at 2.545 s, with no late opening voice. Caption measurements are sampled on frames, so small differences reflect sampling.

## Full recorded journey

An earlier candidate completed the actual recorded tutorial in 435.0 seconds, including one deliberate bridge failure and checkpoint retry. It reached the normal finale and title. The run loaded the real 159 take mappings and heard 152 source starts across the route and retry. Audio stayed running and the tab stayed visible.

The initial Rival distance was 225 m. Meeting began at 85.7 s from start. First exhaustion occurred at 68.4 s, with Rival 17.5 m away. This efficient driver continued walking during approach dialogue; a slower first visitor can take longer. Extra opening distance alone does not guarantee a fixed remaining distance after exhaustion.

The recovery render trace spans 2.56 s of the configured 2.6 s pose. Movement remained enabled in every recovery sample. Rival began fleeing about 1 m from the player in the sampled run, then settled around 12.5 m ahead. The player can keep close; there is no forced 26 m lead. In that close pursuit Rival's first takeoff was approximately 3 m away. His real jump reached 1.32 m in height.

The final body settled at approximately x 38.57, z minus 1069.83, near the complaint entrance at x 36, z minus 1076. Persistent normal death behavior remains in use.

This complete run preceded the final adaptive hint skipping, tighter final takeoff gate, opening decode readiness and prepared graph changes. Final changed scene fixtures and focused tests cover those revisions. The whole final source has not had a second complete recorded journey; this distinction matters when evaluating the evidence.

## Future authored insertion points

`real-duel.scene.insertionSlots` contains stable `wrong-address-recovery`, between `rival-recovery-started` and `rival-recovered`. Insert the future wrong address line here; existing return to sender dialogue follows during escape. The current pose duration is adjustable for that later recording.

`tattle-reveal.scene.insertionSlots` contains stable `sheepfold-dead-end`, spanning named `dead-end-approach` through `dead-end-exit`. The physical low boundary is at z minus 520. Rival reuses Jump while the player has both a direct Jump and an ordinary eastern side gate. This is the future three line dead end exchange's location. No new recording keys or spoken lines were added.

## Navigation and performance

All farm solids come from the same shared specifications as their render geometry. Tests check actor clearance, checkpoints, both real Jump crossings, the side gate, the intact western bridge, the broken crossing and an open ravine. During browser development, a duel displaced Rival into the cart's route; using the existing navigation service corrected the demonstrated snag.

The enlarged navigation graph otherwise introduced about half a second of cold computation. A generated graph now preserves the exact ordinary links and costs. Geometry signature and navigation policy must match before it is used; edited worlds fall back to ordinary calculation. Tests compare every prepared link against a freshly calculated graph and verify stale geometry rejection.

Three Node cold samples of the original graph were 459.8, 418.3 and 419.7 ms. The enlarged live graph measured 507.9, 514.7 and 486.8 ms. The prepared graph measured 1.78, 1.24 and 0.71 ms. This removes a demonstrated cold graph stall; it is separate from steady rendering performance. Bridge assistance can alter floor geometry and legitimately invalidate the prepared graph.

Four 60 second steady scenes used the same sheepfold camera, default quality and visible tab, with three warmup seconds. There were no capture recorders or test workloads running during these measurements.

| Build / viewport | Median | 95th percentile | Frames above 33.4 ms | Above 50 ms |
| :--- | ---: | ---: | ---: | ---: |
| Baseline 1440 × 812 | 16.7 ms | 18.6 ms | 1 | 1 |
| Candidate 1440 × 812 | 16.7 ms | 18.4 ms | 1 | 0 |
| Baseline 844 × 390 | 16.7 ms | 18.5 ms | 0 | 0 |
| Candidate 844 × 390 | 16.7 ms | 18.3 ms | 2 | 1 |

Steady performance is comparable. Differences this small in single runs do not establish an FPS improvement. The candidate's one constrained long frame remains visible in the record. These are static scene rendering measurements, not repeated combat benchmarks. Viewport tests represent constrained layout and pixel workload, not physical mobile hardware. Temporary viewport overrides were reset.

## Evidence types and limits

`comparison.html` compares fixed developer camera views through the real renderer. Static placement is explicitly a visual comparison fixture, not gameplay evidence. Recovery and first Jump images/video were captured from genuinely earned gameplay states. `browser-input-driver.js` preserves normal local simulation and original audio source completion. The final scene and opening helpers restore their temporary input/audio hooks.

Actual touch hardware, itch.io iframe launch and physical Pointer Lock were outside this pass. Existing bridge assistance, rapid reply cadence, spell reaction priority, ending, music and Claude's entire voice processing and recording assets remain unchanged.

## Verification

Final `npm run verify` passed: syntax for 401 modules, 1,312 repository tests, four HTML5 export tests, and HTTP/WebSocket smoke checks. The focused tutorial/world/motion suite passed 174 tests. The existing recording plan still contains exactly the same 159 mappings. No audio asset, manifest, processing chain or recording mapping appears in the diff.

An earlier full run under concurrent capture load passed 1,309 tests and failed three existing timer sensitive tests in audio startup and Chivalry networking. All seven tests in those files then passed in isolation. The final normal verification run passed completely after capture workloads ended. No music or network test implementation was changed to obtain that result.

The actual title capture is `after/title-before-dialogue.png`. Final comparison fixtures retain the greeting panel intentionally because the director is paused for camera placement; they do not represent opening timing.

## Changed file inventory

Every path included in this candidate is listed here. PNGs are comparison fixtures or actual gameplay captures as described above.

```text
client/game/RemotePlayers.mjs
client/game/SpellbladeAnimator.mjs
client/game/spellbladeMotion.mjs
client/game/spellbladeMotion.test.mjs
client/main.mjs
client/tutorial.css
client/tutorial/TutorialDirector.mjs
client/tutorial/TutorialDirector.test.mjs
client/tutorial/TutorialOpening.mjs
client/tutorial/TutorialOpening.test.mjs
client/tutorial/TutorialRival.mjs
client/tutorial/TutorialRival.test.mjs
client/tutorial/TutorialSceneCues.mjs
client/tutorial/TutorialSceneCues.test.mjs
client/tutorial/TutorialSession.mjs
client/tutorial/TutorialView.mjs
client/tutorial/TutorialView.test.mjs
client/tutorial/tutorialRealVoicePacing.test.mjs
client/tutorial/tutorialRefinement.test.mjs
client/tutorial/tutorialRefinementAuthoring.test.mjs
client/tutorial/tutorialScript.mjs
client/tutorial/tutorialVoice.test.mjs
client/worlds/GreenerPasturesRenderer.mjs
client/worlds/greenerPasturesDecor.test.mjs
client/worlds/kit/farmPieces.mjs
docs/plans/2026-10-12-greener-density-choreography.md
docs/tutorial/evidence/density/README.md
docs/tutorial/evidence/density/after/approach.png
docs/tutorial/evidence/density/after/bridge.png
docs/tutorial/evidence/density/after/complaint.png
docs/tutorial/evidence/density/after/constrained-viewport.png
docs/tutorial/evidence/density/after/counterfire.png
docs/tutorial/evidence/density/after/dead-end.png
docs/tutorial/evidence/density/after/early-pursuit.png
docs/tutorial/evidence/density/after/escape.png
docs/tutorial/evidence/density/after/jump-approach.png
docs/tutorial/evidence/density/after/jump-dialogue-approach.png
docs/tutorial/evidence/density/after/meeting.png
docs/tutorial/evidence/density/after/nonlethal-recovery.png
docs/tutorial/evidence/density/after/opening.png
docs/tutorial/evidence/density/after/orchard.png
docs/tutorial/evidence/density/after/rival-jump-fall.png
docs/tutorial/evidence/density/after/rival-jump-gloat.png
docs/tutorial/evidence/density/after/rival-jump-rise.png
docs/tutorial/evidence/density/after/rival-jump.png
docs/tutorial/evidence/density/after/sheepfold.png
docs/tutorial/evidence/density/after/title-before-dialogue.png
docs/tutorial/evidence/density/after/tutorial-complete.png
docs/tutorial/evidence/density/before/approach.png
docs/tutorial/evidence/density/before/bridge.png
docs/tutorial/evidence/density/before/complaint.png
docs/tutorial/evidence/density/before/counterfire.png
docs/tutorial/evidence/density/before/dead-end.png
docs/tutorial/evidence/density/before/early-pursuit.png
docs/tutorial/evidence/density/before/escape.png
docs/tutorial/evidence/density/before/jump-approach.png
docs/tutorial/evidence/density/before/meeting.png
docs/tutorial/evidence/density/before/opening.png
docs/tutorial/evidence/density/before/orchard.png
docs/tutorial/evidence/density/before/rival-jump.png
docs/tutorial/evidence/density/before/sheepfold.png
docs/tutorial/evidence/density/browser-choreography-observer.js
docs/tutorial/evidence/density/browser-input-driver.js
docs/tutorial/evidence/density/browser-jump-variants.js
docs/tutorial/evidence/density/browser-opening-checks.js
docs/tutorial/evidence/density/browser-static-performance.js
docs/tutorial/evidence/density/comparison.html
docs/tutorial/evidence/density/density-video-jump.webm
docs/tutorial/evidence/density/density-video-recovery.webm
docs/tutorial/evidence/density/full-route.json
docs/tutorial/evidence/density/jump-variants.json
docs/tutorial/evidence/density/metrics.json
docs/tutorial/evidence/density/opening-checks.json
docs/tutorial/evidence/density/static-performance.json
scripts/build-greener-navigation.mjs
shared/sim/botNav.mjs
shared/sim/wire.mjs
shared/src/greenerPastures.test.mjs
shared/worlds/greenerFarm.mjs
shared/worlds/greenerNavigation.mjs
shared/worlds/greenerPastures.mjs
shared/worlds/navigationSignature.mjs
```
