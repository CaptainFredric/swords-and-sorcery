# Spellblade quality pass: Argon's 8916d5bd candidate, and the sword arm (2026-11-16)

Draft only: no merge, no deploy. Base: `main` `3d8300cf` (de8c8655 live) with draft PR #502's tests.

**What this branch changes in the game:** the third-person model's gauntlet skin weights, and nothing else in it. The
new file `d4889a8a` is `de8c8655` byte for byte apart from four accessors: `Gauntlet.L/.R` `JOINTS_0` and `WEIGHTS_0`
(`scripts/spellblade-audit/skin-identity.mjs`). Every clip, mesh vertex, bind, joint and the first-person model
(`80de8aee`) are untouched. Argon's `8916d5bd` stays a candidate (§3).

## 1. The arm that crumples and wraps round the sword

### Reproduced on main, in Castleward

`scripts/spellblade-pose-gallery-browser.mjs` records real Chrome in Castleward's inspection yard:
- the attack started with a real key held;
- the yard frozen through the game link, so the held key keeps driving it;
- one 30 Hz tick at a time;
- the knight as the game composes him, drawn by the game's renderer from the front, both sides, behind, beside the
  sword arm, and in first person;
- the skinned arm's surface measured on every tick.

| Scenario | Main: worst edge stretch, torn edges | Where |
|---|---|---|
| Chain | 5.5×, 1,441 | Slash_3 0.287 s; Slash_1 at 0.271 s: 5.24× |
| Guard | 9.5×, 1,427 | Guard 1.674 s |
| Running | 5.2×, 965 | Run |
| Rigid Riposte | 5.3×, 1,110 | Interception 0.209 s |
| Whirl | 4.3×, 545 | Revolution 0.136 s |

Close up (`evidence/arm-slash1-main-vs-corrected.jpg`, top row; `evidence/gauntlet-bind-vs-slash1-f8.jpg`): in Slash_1 the forearm balloons into a rounded mass. Later in the cut
the cuff is sheared forward over the hilt as a tilted box in front of the fist: the "wrap round the sword". In Guard
the gauntlet folds into a twisted sliver round the grip.

### Cause: three layers, each measured

1. **Skin weights (the tearing).** Every plate of `Gauntlet.R` is skinned with a soft forearm→hand gradient
   (`scripts/spellblade-audit/gauntlet-anatomy.mjs`):
   - the cuff (648 vertices) 0.83 / 0.17;
   - the wrist band (200) 0.49 / 0.51;
   - the palm (308) 0.43 forearm / 0.40 hand / 0.17 finger;
   - the vambrace and the back-of-hand plates 3–12% of the other bone.

   With **the clips alone, no game layers** (`scripts/spellblade-arm-strain.mjs`), Slash_1 f8 gives exactly what
   Chrome showed: 5.24×, 971 torn edges. So it is **not** the game's composition. The worst edges are always between a
   [forearm 0.58 + hand 0.42] vertex and a [forearm 0.93 + hand 0.07] vertex. The left gauntlet has the same weights but
   its wrist bends 16–25°, so it peaks at 1.6×.
2. **Articulation (the swing).** `hand.R` sits on the grip about 15 cm past the anatomical wrist. Along the forearm
   (elbow 0, `hand.R` 1) the cuff spans 0.53–0.78 and the fist 0.60–1.10. Every bend swings the whole fist round the
   grip. Making the plates rigid exposes this as the fist coming away from the vambrace (`evidence/gauntlet-pieces-rigid-detaches.jpg`).
3. **Authored hand transforms (the impossible wrist).** Against the forearm, measured about the forearm's own axis
   (`scripts/spellblade-audit/wrist-anatomy.mjs`):
   - **The cuts are fine.** Against the grip, Idle f0, they bend the wrist 12–35° and twist the forearm 13–70°.
   - **Locomotion and defence aren't:**
     - Walk folds the hand 111–123° from the grip, Run 106–111°, Sprint 89–99°, Brake_Stop up to 120°;
     - Guard, Block_Impact and Rigid Riposte twist it 126–130°.

     No wrist does either. Moving the elbow alone, with the sword kept exactly where it is, only gets Walk to 100°
     (`scripts/spellblade-audit/arm-resolve-probe.mjs`), so this needs re-authoring.

### The correction (mine): rigid gauntlet plates

`scripts/spellblade-reweight-gauntlet.mjs`, per connected piece of each gauntlet:
- the vambrace and its band → forearm 100%;
- the back of the hand and the knuckles → hand 100%;
- the cuff and the wrist band → one uniform blend across each piece (it turns as one plate between forearm and fist);
- the palm → its forearm share given to the hand, its finger share kept;
- the elbow pieces untouched.

Three wrist treatments were measured over all 90 clips (`scripts/spellblade-audit/plate-folds.mjs`):

| Wrist treatment | Sword-arm plate edges, all 90 clips | What it does |
|---|---|---|
| As delivered | up to **9.5×** (Rigid_Riposte_Air_Dash_Thrust), down to 0.02× | tears |
| **Uniform plates (chosen)** | up to **1.08×** | never tears; folds only where a clip turns the wrist past any forearm (layer 3) |
| Rigid plates | 0.92–1.08× | the fist visibly detaches in Guard and Brake_Stop (layer 2) |
| Graded ramp | up to 4.8× (Walk) | a ramp can't span the gap |

In Castleward (the candidate's animation with these weights; the frozen-step stills):

| Scenario | Worst stretch: as delivered → corrected |
|---|---|
| Chain | 8.0× → 3.6× |
| Guard | 9.5× → 4.2× |
| Running | 5.2× → 1.8× |
| Riposte | 5.3× → 1.7× |
| Whirl | 4.3× → 1.7× |

What remains in those figures is the elbow pieces (left alone), the shoulder plate (§2) and wrist folding (layer 3).

The model this branch installs, against production, both in Castleward (`d4889a8a` installed; `de8c8655` served
with `--glb`):

| Scenario | Production: worst stretch, torn or folded edges per tick | Corrected |
|---|---|---|
| Walking (W plays Run) | 8.4×, 616 | 1.53×, 238 |
| Sprinting | 8.2×, 607 | 1.65×, 170 |
| Sunder (brace and slams) | 5.7×, 680 | 3.8×, 328 |

`evidence/walk-sprint-main-vs-corrected.jpg`: at that camera the difference is modest. Production's wrist shows
angular tears where the cuff plates rip, clearest in the sprint frame; the corrected arm keeps whole plates. The edges
that still count are folds (down to 0.17×): the locomotion clips turn the wrist beyond any forearm (layer 3).
Side by side (`evidence/arm-slash1-main-vs-corrected.jpg`, `evidence/guard-main-vs-corrected.jpg`, `evidence/gauntlet-pieces-uniform.jpg`): the forearm runs straight into a
whole cuff and fist on the grip, with nothing folded over the hilt.

The guard is `server/tests/spellblade-gauntlet-plates.test.mjs`:
- no clip stretches a sword-arm gauntlet plate past 1.15×;
- re-applying the correction changes nothing, so a revision that brings the gradients back fails.

**Still for Blender authoring (`ARGON-REQUEST.md` §3):** the wrist pivot, and the locomotion and guard clips' wrist.

## 2. Remaining defects found on the way

- **The shoulder plate:** `Pauldron.R` is skinned 0.72 pauldron / 0.28 clavicle. It reaches 1.9–2.4× in the raw
  Slash_2_to_3 and Slash_3; in Castleward, 278–340 edges at Slash_3. For Argon (§8).
- **First person** (`80de8aee`, kept as instructed): `Arm.R` has the same gradients, but its clips bend the wrist
  less. It peaks at 1.8× (FP_Whirl_Wind f16) and 1.4× (Slash_1 f12). For Argon (§8).
- **A still pose in the chain:** after Slash_3, the rising chain shows Slash_2 frame 0 for three ticks (0.1 s). It
  happens on main and on the candidate.

## 3. Argon's 8916d5bd: candidate, not adopted

**Verified:**
- 90 clips, compatible (`scripts/spellblade-compat-check.mjs`).
- Geometry, skin weights, inverse binds, joints and rest skeleton byte-identical to `de8c8655`: 105 of 105 accessors
  and structures. So no mesh defect is repaired by it.
- 17 clips changed: the three cuts, the Alt cuts, the four bridges, the Disaster slams, Sunder and the 1H_Alt
  arrival. Walk, Run, Sprint, Guard, Rigid Riposte, Whirl and the siege clips are untouched.

| | `de8c8655` (main) | `8916d5bd` | Seen in Castleward |
|---|---|---|---|
| Backhand follow-through | 137° | **82°** | **Worse to look at:** from 0.43 to 0.53 s the elbow holds at 30.2–31.3° and the blade-to-forearm angle at 75.4–76.1°. The arm locks straight out sideways at shoulder height and stops dead (`evidence/slash2-main-vs-8916.jpg`) |
| Chop | 37° to the side of the aim | **−6°** | **Better:** a real descent in front of the body. Only −24° below the aim within 0.12 s (target −40°); the torso barely leans in (`evidence/slash3-main-vs-8916.jpg`) |
| Forehand hips / shoulders | 3° / 44° | 8° / 44° | Still square |
| Footwork | glides 43–93 cm per cut | **glides 21.6 cm, the other foot pinned** | **Synthetic:** the moving foot runs the same five frames (0.34 / 0.81 / 0.96 / 0.81 / 0.34 m/s, 1.4 cm lift) in all three cuts, tuned just under the old thresholds (4 cm, 1 m/s). The planted foot is pinned at 0.000 m/s while the pelvis travels 0.30 m and turns 32°, and the knee pops up to 43°/frame² (main ≤ 22) |
| Sword-arm tearing (raw) | Slash_3 5.5× | Slash_3 **8.2×** | Worse (fixed by §1's weights either way) |
| Slams above the floor | ground 21 / fast 22 / Steel 18, 17 / Sunder 7.7 / arrival 3.2 cm | **1.3–2.2 cm** all | Verified on flat ground. Low points moved (ground 0.967, fast 0.667, arrival 0.233 s) and the tip now lands 1.68–1.77 m ahead, up from 1.39 m |
| Bridges | start 0.467, land 0.167 | start 0.533, land 0.133 | Land exactly; needs the game's timings re-measured |

The footwork criterion was gameable, so `scripts/spellblade-candidate-acceptance.mjs` now adds three asks. Both
models fail them:
- **glide:** a foot within 4 cm of the floor travels ≤ 2 cm;
- **lift:** a moving foot is lifted ≥ 5 cm;
- **knee pop:** ≤ 20°/frame².

**Terrain** (`scripts/spellblade-audit/slam-terrain.mjs`): Castleward's walkable ground is flat apart from raised
floors and steps. Across 662 standable points and 16 headings, the ground under the slam's tip differs from the
ground under the feet by more than 15 cm in 0.8% of cases at main's reach and 1.5% at 8916d5bd's: a step edge, where
the blade floats or buries. Nothing in the game fits the blade to the ground beneath it.

**The Lightning arrival 1H_Alt:** still unused (nothing plays it).

**Sunder doesn't use `Sunder_Strike`:**
- In gameplay it's a 0.6 s brace (Slash_3's opening, `spellbladeAnimationPlan.mjs` `brace`) and then 8 s in which
  the ordinary cuts are the slams while Attack is held. The server drives each slam along the aim, or 0.45 rad below
  level.
- Nothing in the client plays `Sunder_Strike`, so 8916d5bd's 1.3 cm on that clip never reaches the game. Recorded in
  Castleward, Sunder's stills show Slash_3 only.

## 4. The Blender source: asset blocker

- **Argon's `reproduce_spellblade_from_blend.py` doesn't export.** It cuts a complete GLB that was appended to the
  end of the `.blend` (`GLTF_SYNC_V1` trailer) and checks that GLB's own hash: it proves nothing about the scene, its
  rig, its Actions or its F-curves.
- **The `.blend` the manifest names (`65ff5eb7…`) wasn't delivered**, in the audit ZIP or anywhere on this machine.
- **The only source available, `a33f5a94`, doesn't produce this model.** Opened in Blender 4.5.14 with scripts
  disabled (`scripts/spellblade-audit/blend_inspect_export.py`), it has:
  - one armature of **27** bones (no fingers, elbow, knee or ankle cops, or pauldron bones);
  - **15** Actions (Air … Stagger);
  - 18 meshes, whose names and vertex counts match the game's;
  - a README text about locked concept references.

  Natively exported, it **breaks** compatibility: 28 joints against 66, and moved inverse binds.

So neither `de8c8655` nor `8916d5bd` has a source that reproduces it. This blocks accepting any further revision on
its source; requested in `ARGON-REQUEST.md` §1, with the acceptance test stated.

## 5. Model versions

- **Third person:** `d4889a8a` on this branch, which is `de8c8655` plus corrected weights.
- **First person:** `80de8aee`, unchanged. Argon's manifest names a first-person `12c8c9e9`, but no file came, so
  nothing was combined.
- **`manifest.json`:** `sourceRevision` and the URLs now carry `d4889a8a…` (the cache key for both files); the
  first-person hash is unchanged.
- **`.gz`:** rebuilt with `gzip -9 -n`; decompresses to `d4889a8a`.
- **`promotion.json`:** untouched.

## 6. Real-Chrome recordings (`scripts/swordsmanship-capture-browser.mjs`)

Every run was a real Castleward yard on a real game server and a real Chrome (GPU), driven by real input. The
production baseline (`de8c8655`) was served with `--glb`; the corrected model is the one this branch installs. Each
run has a normal-speed and a quarter-speed video, kept in the session notes folder under
`evidence/spellblade-quality-8916d5bd/`; sheets are in `evidence/`.

| Run | Baseline | Corrected | Notes |
|---|---|---|---|
| Held chain, desktop split view (first and third person) | 60.1 fps, no page errors | 60.1 fps, no errors | Slash_1 → Slash_1_to_2 → Slash_2 → Slash_2_to_3 → Slash_3 → rising chain |
| Held chain seen by a **remote second client** (its own arms hidden) | 56.7 fps | 59.9 fps | the viewer sees the whole chain (`chain-remote-corrected-sheet.jpg`) |
| Held chain, **emulated landscape phone**, touch ATTACK | 55.4 fps | 60 fps | first-person chain, hits land; an emulation, not a real phone |
| Rigid Riposte | 58.5 fps | 60 fps | Enter → Interception → Thrust |
| Whirl | 59.8 fps | 60.1 fps | Revolution → Exit |
| Candidate `8916d5bd` chain | — | 60 fps (candidate) | `chain-candidate-sheet.jpg` |

**Not verified:** a real phone, sound, and a sustained match.

### A fix to #502's Half Lightning check

#502's Disaster check bounded a held Half Lightning's commit to 0.1 s after its 0.36 s wind-up. But it commits on
its release, and CI's runner sees a key-up late, so the bound measured the runner's speed: it failed on this PR's CI.
`scripts/one-hit-camera-browser.mjs` now follows the rule: the commit comes no sooner than the wind-up or the release
the page recorded (less a tick), and never after the hold window. 7/7 locally. #502's own branch still has the old
bound; this PR, which contains #502, carries the fix.

## 7. Tests

`npm test` (Node 24): 3,234 tests, 13 failing. Those 13 fail on `main` `3d8300cf` too (CI), by name; `main`'s 14th,
the obsolete PR #457 first-cut test, is the one #502 replaced. No new failures. The new and changed model tests pass:
`spellblade-gauntlet-plates`, `spellbladeArgonIntegration`, `spellblade-runtime-assets` and `spellblade-motion-sidecar`.
