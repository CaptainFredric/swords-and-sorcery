# Sword animation and the grounded Fight-and-Flight apparatus

Draft, for review. Base: `main` at `7386d30f`. Nothing here is merged or deployed, and the canonical `spellblade.glb` / `spellblade-fp.glb` are byte-for-byte unchanged.

## What this PR is now

`main` has the Sword Techniques (PR #454). This branch does not replace them. It carries the animation and presentation work around them:

1. **The first ordinary cut** is a committed cut in both views (below). Unchanged since the first review.
2. **`main`'s techniques have their clips, in third and first person**, and the drawn blade is the server's blade from the first instant.
3. **The Fight-and-Flight apparatus walks like a heavy machine** on the ground.
4. **X works in offline Practice** (`LocalHost` kept the chosen technique in a field named `technique`, which hid its `technique()` command).

Nothing here changes a rule, a timing, a hitbox, movement or the aim. The canonical models, their skeletons, geometry and base stance are untouched: every clip is in an animation-only sidecar laid over the canonical rig by bone name, so the sidecars can be dropped or rebuilt when Argon's final model lands.

## Sword Techniques: animation

### Rigid Riposte: the first 0.20 s

The server's 0.22 s brace is the `Enter` and `Interception` clips together (0.32 s as authored), brought up faster. `main`'s plan played `Enter` at its own pace and then joined `Interception` part-way through, so for the first 0.20 s the drawn point was up to **0.32 m** from the blade that intercepts.

The plan now plays both clips across the 0.22 s at the server's own pace (fitted to its blade samples in `swordTechniqueContracts.mjs`). Measured against those samples, with the floor lift taken off:

| | Before | After |
| --- | --- | --- |
| First 0.07 s (the sword coming up at about 25 m/s) | up to 0.32 m | within 0.12 m |
| 0.07 s to the end of the brace | up to 0.20 m | within 0.06 m |
| Thrust and recovery | within 0.06 m | within 0.06 m |

The defensive timing is the server's and is untouched: the brace still ends, and the thrust still begins, at 0.22 s (tested at 0.2199 and 0.2201 s).

### Whirl Like the Wind: the entry

The server's blade is going round from the first instant. `main`'s plan played the 0.20 s `Enter` wind-up first and then cut to the `Revolution` clip a third of a turn in: the blade was behind the one that cuts for 0.20 s, then moved **1.7 m in one frame**. The plan now plays the revolution from the start at the server's phase, eased into over 0.14 s. The transition audit shows no snap; the Whirl's drawn blade is within 3 cm of the server's through the whole turn.

### Transitions

`scripts/sword-loop-audit.mjs` runs the real room and the real animation plan and flags any frame where the point moves faster than its clips do. It gained technique scenarios.

| Transition | Finding | Action |
| --- | --- | --- |
| Ordinary chain, taps, held chains, into and out of Guard, running, sprinting, jumping, casting, dashing, parried, blocked (13 scenarios) | 0 snap frames | Left alone |
| Riposte from rest, Riposte after a cut | 0 snap frames | Left alone |
| Whirl entry | 3 snap frames, up to 1.7 m in a frame | Fixed (above) |
| Riposte or Whirl begun as the Guard comes down | point thrown at about 90 m/s for a frame | Eased into over 0.14 s when the knight was guarding within 0.3 s; 0 snap frames from the technique |
| Guard lowered to Idle | point moves about 14 m/s for two frames | Left alone: it is a sword coming down in a quarter of a second, and slower than any cut |
| Technique clip to technique clip | meet end to end (tested) | No blend (the plan's flat 0.08 s blend lagged the blade behind the server's) |

Guard held blocks a technique on `main` (the request is refused), so there is no Guard-to-technique transition while the button is down.

### First person

`main`'s plan asks for twelve `FP_Technique_*` clips that were not shipped, so the arms stayed in Idle. Argon's first-person candidate has all twelve, and they could be taken as authored:

- his first-person rig is the canonical one: the same 46 nodes and parents, and a rest pose identical to the last digit;
- each chain begins and ends on the canonical Idle, and each clip begins where the one before ends (within 1 cm, tested);
- no clip moves the rig's root, and nothing comes nearer the eye than 0.66 m.

They ship as `spellblade-fp-motion.glb`, an animation-only sidecar built by `tools/assets/build-spellblade-fp-motion.mjs`. No retargeting was needed. Recorded in real Chrome: [Riposte](first-person-riposte-sheet.jpg), [Whirl](first-person-whirl-sheet.jpg).

They are modest: the hands move about 10 cm and the blade pivots at the wrist. The Riposte's thrust tips the blade forward and down rather than driving the arm out. That is how they were authored; a fuller thrust is a request to Argon (below), not something to invent here.

### Third person

The motion sidecar's twelve `Technique_*` clips are the ones `main`'s plan asks for. Argon posed them on a stance 5 to 7 cm lower than the canonical one, so the builder raises the pelvis (Riposte 0.072 m, Whirl 0.053 m) to stand the canonical boots on the floor; the drawn blade is that much higher than the swept one, and the test takes it off before comparing.

## Fight-and-Flight on the ground

**What was wrong.** The apparatus's own gait clips author the chassis through each stride: it drops onto each footfall and rises between (10 cm at a walk, 14 at a sprint), leans into its pace, and twists and rolls a degree or two. The legs hang from the chassis and were authored against that motion. The game discarded all of it, because the chassis is reserved for the authority in flight. So on the ground the machine glided dead level over legs striding beneath it.

**What changed** (`client/worlds/flightGroundCarriage.mjs`, presentation only):

- **The gait.** On the ground the chassis takes what the walk, sprint, stopping and standing clips author for it, on the same stride phase the legs use and at the machine's real speed. A change of gait is eased over 0.22 s.
- **Its weight.** A sprung lean on top, from the machine's own acceleration: the top lags as it gathers pace, pitches on as it brakes, sways out of a turn, and rocks to rest (under-damped: it passes level once or twice).
- **It gives way in the air.** Take-off, a hop, landing, a dash run, a crouch, a dive and a wreck all fade it out, so everything airborne is exactly as it was.
- **The rider stays fitted.** The harness, stirrups and hand grips hang from the chassis, and the rider is posed to them, so he rides the motion.
- **The aim does not move.** The aiming eye is read from where the chassis would be without the rock, and the repeater's gimbals counter it.

Nothing in movement, collision, hitboxes or flight reads any of this.

**Measured in real Chrome** (`scripts/flight-carriage-browser.mjs`: Practice, the real mount, real keys; `--baseline` switches the layer off; 60 fps, no page errors):

| | Before | After |
| --- | --- | --- |
| Chassis bob, walking | 0 | 10.4 cm, on the stride |
| Lean, walking | 0° | 5.9° mean, 10° range through gathering pace |
| Sway through a turning walk | 0° | 6.2° range |
| Stopping from a walk | nothing | pitches on to 11.6°, dips 9 cm, rocks back 1° past level, at rest in about 0.9 s |
| Rider's pelvis against the harness | fixed | fixed (0 cm of slip) |
| Rider's foot against the stirrup | fixed | fixed (0 cm of slip) |
| Aiming eye, height and reach | steady | steady (0 cm of movement) |
| In the air, after take-off | neutral | neutral (the layer's weight is 0) |
| Largest chassis step in one frame | 0 | 1.3 cm (2.9 cm on one 44 ms frame hitch) |

Stills: [as it was, walking; now walking, stopping, turning](apparatus-ground-baseline-walk-stop-turn.jpg). Full numbers: `apparatus-ground-baseline.json`, `apparatus-ground-carriage.json`.

Not looked at: the first-person cockpit view while walking (the eye is measured steady; how the braces and repeater look moving around it was not reviewed), and a real phone.

## The first cut: what was wrong, measured

Tools: `scripts/fp-sword-audit.mjs` (first-person path through the real chain rules), `scripts/sword-loop-audit.mjs` and `scripts/lib/glbPose.mjs` (forward kinematics over the shipped GLB).

### First person (`client/game/fpSlash.mjs`)

| After the contact at 0.40 s | Before | After |
| --- | --- | --- |
| Blade turn rate at 0.40 / 0.47 / 0.50 s | 689 / 68 / 84 °/s (stalls) | 754 / 366 / 295 °/s |
| 0.53 to 0.63 s | speeds up again to 462 °/s while the wrist moves under 0.4 m/s; the point drops 26° | 153 falling to 60 °/s; the hand still travelling |
| 0.63 to 0.90 s | rebounds to level, then dips to −19° | held at −12 to −15°, under 45 °/s |
| Drawn blade vs server blade, on screen | mean 5.7° | mean 5.2° |
| At contact | ≤ 1.4° | ≤ 1.4° |

**Cause.** PR #430 turns each strike's keys about the fist so the drawn blade passes through the server's blade at contact, and lets that turn go between 0.06 and 0.24 s after contact. The forehand needed the largest turn of the three (authored 54° left and 12° down at contact; aimed 30° left and 18° up, about 40° apart). Its follow-through keys were authored about the un-aimed blade, so letting the turn go was itself a 30° fall of the blade with the hand already stopped. That is procedural correction stacked on authored motion, released in the follow-through. The backhand and the heavy strike were traced the same way and do not have it (their rates fall steadily after contact with the hand moving at 2.5 m/s or more).

**Fix.** The forehand's approach, contact and follow-through are authored where the aimed blade is (so there is almost nothing to turn and nothing to let go), the hand carries on across to the left hip while the blade slows all the way to the low-left position the server's backhand starts from, and the loading of the backhand is a hold there, not a rebound and a second dip. No angle is clamped. The same keys serve the rising chain's second cut. `client/game/fpForehandFollowThrough.test.mjs` fails on the old path and passes on the new one.

### Third person (canonical `Slash_1`)

| | Canonical clip | Revised clip (sidecar) |
| --- | --- | --- |
| Pelvis and chest heading through the cut | constant (0° of turn) | chest turns about 40° with the cut; pelvis and legs as canonical |
| Blade elevation, contact to end of follow-through | −11° falling to −18° | −9° rising to −1° |
| Tip height at the end of the follow-through | 0.83 m | 1.11 m, hand at the left shoulder |
| Recovery to the stance | tip passes 0.06 m above the floor at −40° | tip never below 0.2 m; crosses the front level |
| Start, raise and end poses; both feet | — | identical to canonical |

In a tap the body rests at the end of the follow-through, which is where the sword visibly hung. The revised finish is also the better set-up for the returning cut (canonical `Slash_2` raises on the left).

The hips still do not turn in third person. Turning the pelvis moves both feet (the legs hang from it) and the clip has no foot IK to re-plant them, so that needs Blender: see the requests to Argon.

One consequence handled deliberately: a cut broken off into Guard now starts from a higher, further finish, so that blend is 0.30 s (was 0.22 s) to keep the blade from being whipped faster than the fastest authored cut. The test that guards this now measures the authored cut itself instead of a literal 1.1 m.

### Nothing else moved

`SWORD_STRIKE_TIMES`, `SWORD_CHAIN`, `MELEE_CONTACT`, `BLADE`, damage and Guard code are untouched by the cut correction. The server's blade for the ordinary chain is the same arc as before, and the drawn blade is closer to it than it was.

## Argon's contributions

Package: `~/Downloads/Castleward_Rigid_Riposte_And_Whirl_PR_Package.zip` (2026-11-11), also in the Drive folder download beside it. Not committed (34 MB of GLB and 26 MB of Blender sources); the build script takes its `spellblade.glb` by path and refuses any file but the reviewed one.

| Item | Decision | Why |
| --- | --- | --- |
| Skeleton, rest pose, inverse bind matrices, sockets (TP 66 joints, FP 41) | **Identical to canonical** | Compared numerically: same joint order and parents, rest transforms and IBMs within 1e-4, `socket_sword` / `socket_sorcery` identical. So clips transfer by bone name |
| 12 `Technique_*` third-person clips | **Accepted, revised** | Clips meet end to end exactly; no root tracks. On the canonical model they stand 5 to 7 cm into the floor, so the pelvis is raised by one constant per technique (Riposte 0.072 m, Whirl 0.053 m) |
| `Slash_1` (revised by Argon) | **Accepted in part, revised** | Upper body of the cut and finish only. Whole clip rejected: it starts from a different stance (tip 0.6 m from the canonical Idle), sinks the boots 9 cm, and its recovery drags the tip through the floor (−0.00 m) |
| `Slash_1_to_2` and the other link clips | **Rejected** | The hands pass through each other (3 cm apart), and `Slash_2_to_3` drives the tip 0.47 m under the floor. PR #430's links are kept |
| Revised `Idle`, `Run`, `Sprint`, `Slash_2/3`, `Sunder_Strike`, `AllNatural_*`, Mordhau, siege clips | **Not taken here** | Out of this PR's scope; `Idle` changes the stance every other clip returns to (feet 7 cm lower, pelvis 3 cm higher) and would need all 46 clips to move together |
| Geometry: `Breastplate` (3,169 → 5,742 triangles, 7 cm wider, 9 cm lower), `Greave.L/R` (3 cm longer), gauntlets, `TabardBack` (4,096 → 2,768 triangles, 10 cm further in), `TabardFront` (4,096 → 1,496), FP `Arm.R` (6.6 cm narrower) | **Rejected** | A model change is its own review; the tabards are thinned; more clips are not a reason to replace the model |
| Textures (`GameBody_BaseColor` 3.77 → 2.85 MB) | **Rejected** | Recompressed; canonical kept |
| 12 `FP_Technique_*` first-person clips | **Accepted as authored** | Same rig and rest pose as canonical; begin and end on Idle; meet end to end; nothing within 0.66 m of the eye. Shipped in `spellblade-fp-motion.glb` |
| `sword_technique_contact_manifest.json` tracks | **In `main`** (`shared/src/swordTechniqueContracts.mjs`, from PR #454) | The sidecar's clips are tested against them |
| Supplied code (`combat.mjs`, `InputController.mjs`, `armoryView.mjs`, …) | **Not used here** | `main` has its own technique code (PR #454) |

### Assets

| File | Bytes | SHA-256 | Status |
| --- | ---: | --- | --- |
| `client/assets/characters/spellblade/spellblade.glb` | 11,724,088 | `b43e5c3fb0c60a0a722577e0fad266efb3eef0f260fd88698e81192f41d10e80` | canonical, unchanged |
| `client/assets/characters/spellblade/spellblade-fp.glb` | 7,369,504 | `def9bf62a8b3c16f2974030d28db1ff395cc67425272699f0dc4fea1afda3dcf` | canonical, unchanged |
| `client/assets/characters/spellblade/spellblade-motion.glb` | 316,588 | `fd67e1f2be80fe1f901b177522841e6a6f55c095bf2f5964c71e5d4b49a2a687` | **new**: animation only (no mesh, skin or image), 13 clips |
| Argon `spellblade.glb` (candidate) | 12,868,412 | `9dae42a815f4108afab4fdab95673293422283b677ea97f06ac0375ba50516a1` | build input, not committed |
| `client/assets/characters/spellblade/spellblade-fp-motion.glb` | 289,116 | `ff7b20dc333c6633cae58a587e7dd1c55945e66c4b002f85bafc3ec2be44a225` | **new**: animation only, 12 first-person technique clips |
| Argon `spellblade-fp.glb` (candidate) | 6,868,440 | `1b12af5551b449ff25c8b6f75c4d1a661f6edd271a18a97e31c5eb4d743be904` | build input for the first-person sidecar, not committed |

Sidecar clips: `Slash_1` (replaces the model's own by name), `Technique_RigidRiposte_{Enter, Interception, Thrust, Recovery, Parried, Air}`, `Technique_Whirl_{Enter, Revolution, GaleLift, Exit, Interrupted, AirRecovery}`. Bone mapping is by name onto the canonical 66 joints; `root` is never animated, and a Whirl's turn is carried by `pelvis` in the clip. The runtime does not turn the knight for a Whirl (it does for a Vortex), so the spin is applied once.

Rebuild: `node tools/assets/build-spellblade-motion.mjs --candidate <Argon spellblade.glb>` (`--check` verifies the committed files). The client loads the sidecar through `spellblade-motion.json`; without it the model plays its own clips and the techniques fall back to `Slash_3` / `Vortex_Spin`. `server/tests/spellblade-motion-sidecar.test.mjs` pins all of this, including that the server's track is the clip's blade.

**No change to the canonical GLB is needed by this PR**, so no shared asset branch was opened. If one is opened later (for Argon's Idle, hips or geometry), this sidecar should be rebuilt against it and the three PRs should take the model from that one branch.

## Verification

Kept economical, as asked: targeted tests and one real-browser pass per change. The whole suite was last run on the previous head (3,043 of 3,053, the same ten failures as `main`); it was not rerun for this round.

### Tests (64 of 64 pass)

- `client/worlds/flightGroundCarriage.test.mjs` (6): the bob is on the stride with no lag; standing still is still; nothing is laid on a machine off its legs; take-off has no step and leaves nothing in the air; the lean lags, pitches on and rocks to rest; turns sway outward either way; a snapshot hitch is not a shove; 30 and 144 fps agree.
- `server/tests/spellblade-motion-sidecar.test.mjs` (7): both sidecars are animation only on the canonical rigs; every clip the plan can ask for is there, in both views; the drawn blade against the server's (Riposte and Whirl); the brace is still 0.22 s; boots on the floor; first-person clips on Idle, end to end, off the eye; the revised first cut.
- `client/game/fpForehandFollowThrough.test.mjs`, `swordChainPresentation.test.mjs`, `spellbladeAnimationPlan.test.mjs`, `spellbladeBlend.test.mjs`, `client/network/offline.test.mjs`, and the six existing tests that touch the flight renderer, rig animation and cockpit eye.

One test in `server/tests/sword-technique-room.test.mjs` ("disconnect cancels a held Whirl…") fails here and on `main` alike.

### Real browser

- Sword: `scripts/swordsmanship-capture-browser.mjs`, offline Practice, desktop. Riposte and Whirl with the first-person clips: no page errors; stills linked above.
- Apparatus: `scripts/flight-carriage-browser.mjs`, with and without the layer; table above.
- First cut, before and after: [RECORDINGS.md](RECORDINGS.md), unchanged from the first review.

![first cut, desktop](first-cut-before-above-after-desktop.jpg)

### Not verified

- A real phone.
- Techniques and the grounded apparatus on a second client (the carriage runs on whatever machine is drawn, remote ones included, but only the local one was recorded).
- The first-person cockpit view while walking.
- Sound.

## Blockers and requests to Argon

None of these blocks the PR; each is art that cannot be fixed in code without inventing motion.

1. **First-person Riposte thrust.** `FP_Technique_RigidRiposte_Thrust` tips the blade forward and down from the wrist (the point ends low and left, the hand moves 4 cm). Wanted: the sword arm driven out along the line of the lunge, point on the reticle at 0.22 to 0.48 s.
2. **Technique clips authored on the canonical stance.** The third-person clips stand 5 to 7 cm into the floor on the canonical model and are lifted in the build. Re-exported on the canonical Idle they would need no lift, and the drawn blade would be the server's exactly.
3. **Hips in the third-person cuts.** `Slash_1/2/3` keep the pelvis fixed. Wanted: pelvis yaw leading the chest by a frame or two, both feet re-planted, starting and ending on the canonical Idle.
4. **`Technique_RigidRiposte_Parried`** starts 0.42 m from where the thrust is, and **`Technique_Whirl_GaleLift`** is 0.14 m from `Revolution` at the same phase. Both are eased over 0.08 s for now.
5. **Whirl while running.** The feet are the clip's planted turn, so they slide when the knight moves.
6. **Link clips** (`Slash_1_to_2`: hands 3 cm apart; `Slash_2_to_3`: the tip 0.47 m under the floor) remain rejected.

## Implemented and proposed

| | Status |
| --- | --- |
| Forehand follow-through, first person | Implemented, tested, recorded |
| Forehand cut and recovery, third person | Implemented through the sidecar, tested, recorded |
| Riposte's first 0.20 s drawn where the server's blade is | Implemented, tested |
| Whirl entry without the jump | Implemented, tested, audited |
| Technique entry out of a lowering Guard | Implemented, audited |
| First-person Riposte and Whirl | Implemented with Argon's clips through a sidecar, tested, recorded |
| Third-person technique clips | Implemented through the sidecar, tested against the server's blade, recorded |
| Grounded Fight-and-Flight carriage | Implemented, tested, measured in the browser with and without |
| Technique command in offline Practice | Fixed, tested |
| A fuller first-person thrust; hips in the cuts | Proposed (requests 1 and 3) |
| Replacing the canonical GLB, skeleton or stance | Not done, not needed |

## The first-person sword arm joined at the wrist

In the canonical `spellblade-fp.glb` the sword fist and its vambrace are separate shells with no shared edge or blended weight, and at rest the cuff's rim sits 19 cm to the side of the fist: from the eye the fist floated under the guard with grass between it and the forearm, in `main`'s Idle and cuts as much as in the technique clips (`node scripts/fp-wrist-seam.mjs` measures the file: 96 mm nearest approach on the sword arm, 8 mm on the magic arm). It was in this PR's own first-person stills and should have been called out then.

`client/game/swordWrist.mjs` closes it as the arms load: the vambrace is leaned over along its own length (nothing at the elbow, everything at the cuff) and drawn in to 0.9, so the cuff closes round the back of the fist, in the rest shape, so every pose and clip carries it. The fist, grip, sword, skeleton and the model file are untouched; a model whose cuff already reaches the fist is left alone. Looked at in the running game in Idle, Guard, a cut and a Riposte: the arm reads as one piece. Not looked at: Whirl, the phone layout. From straight behind (the Riposte's thrust) the cuff hides most of the fist. This is a load-time repair; the lasting one is the same lean in the first-person source art.

## Seen in `main`, not touched

- A Riposte's lunge ends inside its target (from 4.4 m the camera finishes in the Training Dummy's chest). That is movement, not animation.
- The Technique slot has no "none"; every knight defaults to Rigid Riposte.
- On the ground a crouch's authored chassis drop (0.52 m) is also discarded; the carriage layer deliberately stands aside for a crouch.
