# Ordinary sword correction, and clips for the Sword Techniques

Draft, for review. Base: `main` at `f355de08`. Nothing here is merged or deployed, and the canonical `spellblade.glb` / `spellblade-fp.glb` are byte-for-byte unchanged.

## Scope, after `main` took the techniques

This branch first carried its own Rigid Riposte and Whirl Like the Wind. PR #454 then merged a separate implementation of both into `main`, and the creator chose to keep `main`'s. So this branch's technique rules, Armory slot, controls and first-person technique arms are **removed**, and what remains is what `main` does not have:

1. **The first ordinary cut (the forehand) is a committed cut in both views.** First person: its follow-through was authored about a blade that is not the one shown, so the cut stalled just after contact and the blade then fell to the left on a still wrist. Third person: the canonical clip never turned the body and let the sword hang point-down after the cut. Both are corrected; timing, damage, recovery, hitbox and Guard windows are untouched.
2. **`main`'s techniques now have their third-person clips.** `main`'s animation plan asks for twelve `Technique_*` clips that were not shipped (its comment: "The supplied GLBs must be shipped separately"), so a technique played the `Guard` pose. The motion sidecar here carries those twelve clips, under the names the plan asks for, laid over the canonical model by bone name.
3. **X works in offline Practice.** On `main` the browser-hosted yard kept the chosen technique in a field named `technique`, which hid its `technique()` command: pressing X threw `this.active[method] is not a function` and nothing happened. The field is renamed (`client/network/LocalHost.mjs`), with a test.

### The clips against `main`'s blade

`server/tests/spellblade-motion-sidecar.test.mjs` holds the sidecar's clips to the blade `main`'s server sweeps (`shared/src/swordTechniqueContracts.mjs`):

| | Drawn blade against swept blade |
| --- | --- |
| Whirl, whole revolution | within 3 cm at the point, once the lift is taken off |
| Riposte, from 0.20 s on (end of brace, thrust, recovery) | within 6 cm |
| Riposte, first 0.20 s | up to 0.32 m apart at the point |

The lift: Argon posed these clips on a stance 5 to 7 cm lower than the canonical one, so the builder raises the pelvis (Riposte 0.072 m, Whirl 0.053 m) to stand the canonical boots on the floor. The drawn blade is that much higher than the swept one.

The Riposte's first 0.20 s is `main`'s animation plan, not the clips: it plays the 0.10 s Enter clip and then joins the Interception clip part-way through, where the server's samples bring the sword up over the whole 0.22 s. Left as it is; it is `main`'s to decide.

### Seen in real Chrome (offline Practice, desktop, this branch)

| Run | Third-person clips played | Result |
| --- | --- | --- |
| Riposte, X tapped at 4.4 m | Idle → RigidRiposte_Enter → Interception → Thrust → Recovery → Idle | 20 damage, no page errors |
| Whirl, X held | Idle → Whirl_Enter → Whirl_Revolution → Whirl_Exit → Idle | 16 × 5, no page errors |
| First cut, one tap | Idle → Slash_1 → Idle | sidecar loaded (`fd67e1f2…`) |

Stills: `main-techniques-riposte-with-sidecar-sheet.jpg`, `main-techniques-whirl-with-sidecar-sheet.jpg` (first person left, third person right).

### Seen and not fixed (they are `main`'s)

- **First person shows nothing of a technique.** The plan asks for `FP_Technique_*` clips that are not shipped, so the arms stay in Idle through a Riposte or a Whirl. Argon's package has twelve such clips; they are not vetted here.
- **A Riposte's lunge ends inside its target.** From 4.4 m the camera finishes inside the Training Dummy's chest.
- **The Technique slot has no "none".** `main` defaults every knight to Rigid Riposte.

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
| 12 `FP_Technique_*` first-person clips | **Not vetted, not shipped** | `main`'s plan asks for them; see the decisions below |
| `sword_technique_contact_manifest.json` tracks | **In `main`** (`shared/src/swordTechniqueContracts.mjs`, from PR #454) | The sidecar's clips are tested against them |
| Supplied code (`combat.mjs`, `InputController.mjs`, `armoryView.mjs`, …) | **Not used here** | `main` has its own technique code (PR #454) |

### Assets

| File | Bytes | SHA-256 | Status |
| --- | ---: | --- | --- |
| `client/assets/characters/spellblade/spellblade.glb` | 11,724,088 | `b43e5c3fb0c60a0a722577e0fad266efb3eef0f260fd88698e81192f41d10e80` | canonical, unchanged |
| `client/assets/characters/spellblade/spellblade-fp.glb` | 7,369,504 | `def9bf62a8b3c16f2974030d28db1ff395cc67425272699f0dc4fea1afda3dcf` | canonical, unchanged |
| `client/assets/characters/spellblade/spellblade-motion.glb` | 316,588 | `fd67e1f2be80fe1f901b177522841e6a6f55c095bf2f5964c71e5d4b49a2a687` | **new**: animation only (no mesh, skin or image), 13 clips |
| Argon `spellblade.glb` (candidate) | 12,868,412 | `9dae42a815f4108afab4fdab95673293422283b677ea97f06ac0375ba50516a1` | build input, not committed |
| Argon `spellblade-fp.glb` (candidate) | 6,868,440 | `1b12af5551b449ff25c8b6f75c4d1a661f6edd271a18a97e31c5eb4d743be904` | reviewed, not used |

Sidecar clips: `Slash_1` (replaces the model's own by name), `Technique_RigidRiposte_{Enter, Interception, Thrust, Recovery, Parried, Air}`, `Technique_Whirl_{Enter, Revolution, GaleLift, Exit, Interrupted, AirRecovery}`. Bone mapping is by name onto the canonical 66 joints; `root` is never animated, and a Whirl's turn is carried by `pelvis` in the clip. The runtime does not turn the knight for a Whirl (it does for a Vortex), so the spin is applied once.

Rebuild: `node tools/assets/build-spellblade-motion.mjs --candidate <Argon spellblade.glb>` (`--check` verifies the committed files). The client loads the sidecar through `spellblade-motion.json`; without it the model plays its own clips and the techniques fall back to `Slash_3` / `Vortex_Spin`. `server/tests/spellblade-motion-sidecar.test.mjs` pins all of this, including that the server's track is the clip's blade.

**No change to the canonical GLB is needed by this PR**, so no shared asset branch was opened. If one is opened later (for Argon's Idle, hips or geometry), this sidecar should be rebuilt against it and the three PRs should take the model from that one branch.

## Verification

### Tests

`npm test` on Node 24: **3,043 of 3,053 pass**. The ten failures are the same ten that fail on `main` at `f355de08` (3,033 of 3,043 there, compared name by name); none is in a file this branch changes.

- `client/game/fpForehandFollowThrough.test.mjs` (5, with the old path shown to fail) and the changed `swordChainPresentation` test: the first cut.
- `server/tests/spellblade-motion-sidecar.test.mjs` (5): the sidecar is animation only and built against the canonical model; every clip `main`'s plan can ask for is in it, at the rules' lengths; the drawn blade against the swept one (table above); boots on the floor and clips meeting end to end; the revised first cut.
- `client/network/offline.test.mjs` (+1): the technique command reaches the browser-hosted yard.

### Recordings

Real Chrome (headless, GPU), a real game server, real input events (`scripts/swordsmanship-capture-browser.mjs`). The first cut's before and after runs are in [RECORDINGS.md](RECORDINGS.md), with videos on branch `evidence/swordsmanship-techniques-20261112`. Phone runs are a landscape phone **emulated in desktop Chrome, not a real phone**.

The first cut, `main` above and this branch below (0.34 to 0.95 s after the press, first person left and third person right):

![first cut, desktop](first-cut-before-above-after-desktop.jpg)

![first cut, emulated phone](first-cut-before-above-after-phone.jpg)

The recordings of this branch's own, removed, technique implementation are still on the evidence branch; they no longer describe this PR.

### Not verified

- A real phone.
- `main`'s techniques with the sidecar clips on a second client or an emulated phone: only offline Practice on desktop was recorded after the merge.
- The Whirl's third-person clip while running: the feet are the clip's planted turn, so they slide.

## Requests to Argon

1. **Hips in the third-person cuts.** `Slash_1/2/3` keep the pelvis fixed. Wanted: pelvis yaw leading the chest by a frame or two through each cut, with both feet re-planted by IK, starting and ending on the canonical Idle exactly (tip within 1 cm, feet within 1 mm).
2. **Technique clips authored on the canonical stance.** The candidate's are built on a stance 5 to 7 cm lower at the foot. Either re-export them on the canonical Idle, or deliver the new Idle with all 46 canonical clips re-posed to it, on one shared asset branch.
3. **`Technique_RigidRiposte_Parried`** starts 0.42 m (tip) from where the thrust is. A version starting on the thrust's pose at 0.10 to 0.20 s would remove the blend.
4. **`Technique_Whirl_GaleLift`** is 0.14 m from `Revolution` at the same phase (pelvis 0.185 m higher). Same phase, same hands, only the legs changed, would let the two swap without a blend.
5. **Link clips**: `Slash_1_to_2` needs the hands kept at least 15 cm apart; `Slash_2_to_3` must keep the tip above the floor.
6. Geometry changes (cuirass, greaves, tabards, FP right arm) need their own review with side-by-sides against the concept; they are not part of this.

## Implemented and proposed

| | Status |
| --- | --- |
| Forehand follow-through, first person | Implemented, tested, recorded |
| Forehand cut and recovery, third person and remote view | Implemented through the sidecar, tested, recorded |
| Third-person clips for `main`'s Rigid Riposte and Whirl | Implemented through the sidecar, tested against `main`'s blade, recorded in offline Practice |
| Technique command in offline Practice | Fixed, tested, recorded |
| Hips driving the third-person cuts | Proposed (request 1) |
| First-person technique arms | Not done: `main` asks for `FP_Technique_*` clips that are not shipped |
| Riposte's first 0.20 s matching the swept blade | Not done: it is `main`'s animation plan |
| Replacing the canonical GLB | Not done, not needed here |

## Decisions for the creator

1. First person shows nothing during a technique on `main`. Vet and ship Argon's `FP_Technique_*` clips the same way (a first-person sidecar), or draw the arms procedurally as the ordinary chain is?
2. The Riposte's Enter clip: keep `main`'s plan (0.32 m off the swept blade for the first 0.20 s), or play the Interception clip from its start so the two agree?
