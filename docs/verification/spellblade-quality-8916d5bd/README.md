# Spellblade quality pass: the sword arm's gauntlet weights, and Argon's 8916d5bd (2026-11-16)

Draft PR #503, stacked on draft #502. No merge, no deploy.

**What this PR changes in the game:** only the third-person model's gauntlet skin weights. The proposed file,
`6df6c4db`, is `de8c8655` byte for byte apart from four accessors: `Gauntlet.L/.R` `JOINTS_0` and `WEIGHTS_0`
(`scripts/spellblade-audit/skin-identity.mjs`). Every clip, vertex, bind and joint is unchanged, and so is the first
person (`80de8aee`). Argon's `8916d5bd` stays a candidate (`CANDIDATE-8916D5BD.md`).

This is a targeted improvement to one defect. It doesn't fix the character: §3 lists what still looks wrong.

## 1. The sword arm that tears into a jagged mass

### Reproduced on main, and its cause

In real Castleward (`scripts/spellblade-pose-gallery-browser.mjs`: the inspection yard, real input, one 30 Hz tick at
a time), the sword gauntlet stretches to 5.5× in the chain, 9.5× in Guard and 8.4× when running. The cuff tears into
slivers folded over the hilt.

The raw clips alone, with no game layers, give the same numbers (`scripts/spellblade-arm-strain.mjs`: Slash_1 f8,
5.24×), so it isn't the game's composition. Three layers produce it:

1. **Weights (the tearing).** Every hard plate of `Gauntlet.R` is skinned with a gradient across itself: the cuff
   forearm 0.83 → hand 0.17, the wrist band 0.49/0.51, the palm 0.43/0.40/0.17 finger, the back-of-hand plates 7–12%
   forearm.
2. **Articulation.** `hand.R` pivots on the grip, about 15 cm past the anatomical wrist (cuff at 0.53–0.78 of the
   forearm, fist 0.60–1.10, `hand.R` at 1). A wrist bend swings the whole fist round the grip.
3. **Authored poses.** Every played clip holds the sword hand at least 60° from bind (Idle 63°). Run and Sprint
   fold it about 125° and Guard twists it 142° (`scripts/spellblade-audit/wrist-anatomy.mjs`).

The left gauntlet has the same weights, but its wrist bends only 16–25°.

### The correction

`scripts/spellblade-reweight-gauntlet.mjs` (default `--plates mean`) gives each hard plate its own mean weights, the
same on every vertex:
- **plates** still follow the average motion they were delivered with, but can no longer shear inside themselves;
- **finger lames** keep their articulated blend;
- **elbow pieces** are untouched.

**Choosing it.** Over everything the game plays, pose for pose against production
(`scripts/spellblade-audit/gauntlet-exposure.mjs`; the 48 played clips including the sidecar's techniques, every
frame, plus 31 crossfades: 1,610 poses):

| Sword hand | Plates stretched past 2× | Plates folded under ½ | Neighbouring pieces further apart than production |
|---|---|---|---|
| Production `de8c8655` | 96.7% of poses (median 4.6×) | 96.4% | — |
| **Mean plates (proposed, `6df6c4db`)** | **0%** | **12.5%** | median **3.9 cm**, p90 4.9 |
| Rigid plates (the earlier `d4889a8a`) | 0% | 12.5% | median 8.8 cm, p90 11.0: the fist parts from the cuff |
| Rigid, with the cuff as a ramp | 96.5% (median 2.8×) | — | median 4.7 cm |

No weighting can close the wrist, because of layers 2 and 3. Mean plates tear nothing and part the least. That's why
this replaces the rigid `d4889a8a` this PR first proposed. The left gauntlet: no stretch, 0.7% folded, 0.9% parted.

**By region** (`scripts/spellblade-audit/arm-regions.mjs`, 1,349 played frames):

| Sword-arm region | Production: stretched >1.5× / folded <0.6× | Proposed |
|---|---|---|
| Cuff and wrist band | 100% / 91% (worst 9.0×) | **0% / 0%** |
| Hand plates | 18% / 96% | **0% / 15%** |
| Vambrace | 0% / 0% | 0% / 0% |
| Elbow | 11% / 69% | unchanged (§3) |
| Shoulder | 26% / 30% | unchanged (§3) |

**Sword and crossfades.**
- No plate of the sword hand enters the blade in any played frame.
- The magic hand rests on the blade only while falling asleep (the Restless slump and sleep loop), identically on
  production.
- Both gauntlets hold through every crossfade the game makes: the four bridges, the rising chain, idle into guard and
  cut, guard into cut, run and sprint into cut, the techniques, cast, dash and stagger.

**In Castleward** (frozen stills from the game's cameras, production served with `--glb`):

| Scenario | Production | Proposed |
|---|---|---|
| Chain | 5.5× | 2.3× |
| Guard | 9.5× | 4.1× |
| Running chain | 8.2× | 2.3× |

The remainder is the elbow and shoulder. Side by side (`evidence/three-way-arm.jpg`; rows: production, rigid, mean):
- **production** folds the gauntlet into a wedge;
- **rigid** opens a gap under the fist;
- **mean** keeps the cuff against the fist.

Normal-speed recordings are in §5.

**The regression guard:** `server/tests/spellblade-gauntlet-plates.test.mjs`, every frame, both hands, the played clips
with the sidecar's techniques and the crossfades:
- no plate stretched past 1.05×, in played or archive clips;
- folds under ½ in ≤ 15% of sword-hand poses (production: 96%);
- no sword-hand plate in the blade;
- neighbouring pieces part no further than today (sword hand ≤ 21 cm, magic hand ≤ 15.5 cm, against bind);
- re-applying the correction changes nothing.

Production fails the stretch and fold checks.

## 2. Argon's Blender source: received, and an asset blocker

The eight-part sets in Argon's Drive folder assemble to exactly the hashes his manifest names:
- `65ff5eb7…` (`spellblade-third-person-8916d5bd.blend`, 47,364,839 B);
- `96440694…` (`…de8c8655.blend`, 47,162,843 B).

Both end in the appended `GLTF_SYNC` GLB.

Opened in Blender 4.5.14 with scripts disabled (`scripts/spellblade-audit/blend_inspect_export.py`, `blend_bone_audit.py`),
both contain:
- **an armature of 27 bones**, not 66: no fingers, elbow, knee or ankle cops, pauldron bones or tabard chain;
- **meshes weighted to 22 groups**, none of the shipped model's finger, cop or pauldron weights, and different helmet,
  crest and gauntlet objects;
- **90 Actions, of which 75 are empty**: no slot, no F-curves, no users, a name and a frame range only. Walk, the bridges,
  the Disaster slams, the techniques and 1H_Alt among them.
- **15 keyed Actions on the 27-bone rig** (the old kit set: Air … Stagger). They don't match the shipped clips of the
  same names: the sword point is 0.6–3.1 m away.

Blender's own glTF exporter therefore produces a 27-joint model with 15 clips
(`artifacts`: `73dd2f12…`). `scripts/spellblade-compat-check.mjs` reports 163 breaks.

**Verdict.** Neither `8916d5bd` nor `de8c8655` is reproducible from its `.blend`. Each model exists only as the GLB
appended to its source, and Argon's `reproduce_spellblade_from_blend.py` only cuts that GLB out. This stays an asset
blocker (`ARGON-REQUEST.md` §1).

## 3. What still looks wrong, and the wrist recommendation

**Still wrong (measured):**
- **The wrist parts.** Neighbouring gauntlet pieces sit a median 3.9 cm further apart than production holds them,
  because the sword hand pivots on the grip and every pose bends it 60°+.
- **Folding.** The hand plates fold in 15% of played frames, mostly Rigid Riposte's thrust and the interrupted Whirl.
- **The elbow** folds in 69% of played frames offline. The game drives its cop at runtime, but in the in-game stills
  the remaining torn edges are mostly the elbow pieces.
- **The shoulder** (`Pauldron.R` and the Breastplate's shoulder): stretched in 26% of frames, folded in 30%.
- **First person** (`80de8aee`, unchanged): same gradient pattern, milder (1.8× worst).
- **Animation, separate from this patch:** the backhand's thrown-back follow-through, the sideways chop, square
  forehand hips, gliding feet.

**The wrist: where the pivot should be** (`scripts/spellblade-audit/wrist-pivot-experiment.mjs`, on the GLB, with the
sword's world transform held exactly so the server's blade and every contact frame are untouched):

| Approach | Wrist bend left (played frames, median / p90) | Elbow moved (p90) | Arm can still reach |
|---|---|---|---|
| As authored | 71° / 94° | — | — |
| A. Current pivot, elbow re-placed | 60° / 90° | 18 cm | always |
| B. Pivot moved to the anatomical wrist (66 joints, `hand.R` relocated) | 27° / 81° where reachable | 39 cm | **11 of 392 frames** |

B is infeasible: the clips use the grip pivot's 15 cm lever as reach, so with the pivot at the wrist the arm can't
put the sword where the clip, and the server, have it. A 67th wrist bone has the same geometry problem, plus the first
person, siege seating and socket costs.

A alone isn't enough either. The bend is 60° because the gauntlet is modelled straight while every grip holds the
hand about 64° from it. The fist's turn into the grip is mostly off the grip axis (62° off, 16° about it;
`grip-axis.mjs`), so re-posing the fist would pull it off the sword.

**Recommendation:**
- Keep the 66-joint skeleton and the pivot.
- **Re-model the sword gauntlet's wrist in the grip pose** (Idle f0, a 64° bend from bind): the cuff modelled to bridge
  that bent wrist, then bound there.
- Re-author the forearm and hand of the clips that leave the grip by more than 45°: Run, Sprint, Guard, Block_Impact,
  the Riposte thrust.

The cuts already stay within 12–43° of the grip. That's Blender work, for Argon (§3 of the request).

## 4. Argon's 8916d5bd

Kept as a candidate, not installed and not combined with this correction. See `CANDIDATE-8916D5BD.md` for:
- **what to carry:** the chop, the slams' 2 cm contact, the bridges;
- **what not to:** the locked backhand and the synthetic footwork;
- the rules for the next candidate.

`scripts/spellblade-candidate-acceptance.mjs` now also asks for no glide, lifted steps and no knee pops, which both
models fail. Sunder never plays `Sunder_Strike` (its slams are the cuts), so 8916d5bd's Sunder contact doesn't reach the
game.

## 5. Real Chrome at normal speed

`scripts/swordsmanship-capture-browser.mjs` records:
- a real game server, real Chrome (GPU) and real input, at normal speed with a quarter-speed copy;
- `--close` puts the camera 1.6 m off the sword side;
- `--glb` serves production for the comparison.

| Run | Production | Proposed | Notes |
|---|---|---|---|
| Held chain, camera close on the sword side | 59.8 fps, no page errors | 60 fps, no page errors | `evidence/close-chain-production-vs-proposed.jpg`, frames paired by time into the chain |
| Whirl, close | 60.1 fps, no page errors | 60 fps, no page errors | `evidence/close-whirl-production-vs-proposed.jpg` |
| Held chain, desktop split view; remote second client; emulated phone; Riposte; Whirl | 55–60 fps, no page errors | recorded on the rigid `d4889a8a`, same composition | sheets in `evidence/` |

**What a player sees:** at ordinary speed and play distance, production and the proposed model are hard to tell apart.
The tearing is clear only close up: the forearm in the forehand's wind-up, the gauntlet folded round the grip in
Guard, and the arm camera. So this patch removes a real defect, but its visible gain in normal play is modest.

**Not verified:** a real phone, sound.

## 6. CI and tests

- **CI:** the 13 failing unit tests on this PR are exactly `main` `3d8300cf`'s CI failures, by name, less the obsolete
  PR #457 first-cut test, which #502 replaced. Nothing new fails.
- **#502's Half Lightning browser check:** it bounded the commit to 0.1 s after the wind-up, but a held Half Lightning
  commits on its release, and CI sees the key-up late. This PR fixes it (`scripts/one-hit-camera-browser.mjs`);
  `chrome-disaster` passes on CI.
- **Stacking:** #503 is stacked on #502's branch, so its diff shows only its own commits. Merge #502 first.
