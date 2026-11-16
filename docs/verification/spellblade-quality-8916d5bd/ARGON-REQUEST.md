# For Argon: one revision request after 8916d5bd (2026-11-16)

`8916d5bd` stays a candidate. It isn't going into the game as it is. Draft PR #503 (not merged, not shipping)
proposes `de8c8655` with corrected gauntlet and shoulder weights (`d0e390b7`): every clip, mesh, bind and joint byte
is yours, and only the weights change (§2, §8). Make the changes below in **one new revision**, starting from `8916d5bd`.

Clips are 30 fps, frames 0-based (`time × 30`). "Grip" means the sword hand's relation to the forearm in `Idle` f0, the
hold every cut starts from. Every number here is measured on the GLB, and the tools are named so you can re-measure.

## 1. The Blender source (blocking)

The two eight-part `.blend`s in the Drive folder were received. They assemble to exactly your manifest's hashes:
`65ff5eb7…` for 8916d5bd and `96440694…` for de8c8655. Opened in Blender 4.5.14, though, **neither is the source of its
model.** Each holds:

- **an armature of 27 bones**, not the model's 66 (no fingers, elbow, knee or ankle cops, pauldrons or tabard
  chain);
- **meshes weighted to 22 groups**, and different helmet, crest and gauntlet objects from the ones exported;
- **90 Actions, 75 of them empty:** no slot, no F-curves, no users. Walk, the bridges, the Disaster slams, the
  techniques and 1H_Alt are names only;
- **15 keyed Actions** on the 27-bone rig, which don't match your clips of the same names: the sword point is
  0.6–3.1 m away.

Blender's own exporter turns it into a 27-joint, 15-clip model that breaks compatibility in 163 places. The real model
exists only as the GLB appended to the file, which `reproduce_spellblade_from_blend.py` cuts out.

**Wanted:** the `.blend` you actually animate in, with:
- the 66-joint rig and its weights;
- the 90 keyed Actions;
- the corrected gauntlet weights (§2);
- no appended GLB.

The game will export it with Blender's own exporter (`scripts/spellblade-audit/blend_inspect_export.py`) and compare
skeleton, binds, meshes, weights and every clip's bone trajectories, which must agree within 1 mm and 0.5°. Byte
identity isn't required.

## 2. Keep the corrected gauntlet weights

The torn, jagged sword arm was the gauntlets' weights. Every hard plate of `Gauntlet.L/.R` was skinned with a gradient
across itself, so each one sheared whenever the wrist bent. Edges reached 5.2× their length in `Slash_1` f8 and 9×
over the clips the game plays: stretched past 2× in 96.7% of played poses.

The proposed file gives **each hard plate its own mean weights, the same on every vertex.** For example:
- the cuff forearm 0.83 / hand 0.17;
- the wrist band 0.49 / 0.51;
- the palm 0.43 / 0.40 / finger 0.17;
- the back-of-hand plates hand 0.88–0.93.

Each plate keeps the average motion you gave it but can't shear inside itself. The finger lames and the elbow pieces
are unchanged. Over the played poses: no stretching, folding down from 96% to 12.5%.

The script is `scripts/spellblade-reweight-gauntlet.mjs`. Put the same weights in the source. The test
`server/tests/spellblade-gauntlet-plates.test.mjs` fails any revision that brings the gradients back.

## 3. The sword wrist: rig and clips

The weights stop the tearing, but the wrist can't look right yet: neighbouring gauntlet pieces still part, a median
3.9 cm further than they used to sit.

**The pivot stays.** `hand.R` sits on the grip, about 15 cm past the anatomical wrist (cuff at 0.53–0.78 of the
forearm, fist 0.60–1.10), so a wrist bend swings the fist round the grip. We tested moving it
(`scripts/spellblade-audit/wrist-pivot-experiment.mjs`), with the sword held exactly where every clip and the server put
it. With the pivot at the anatomical wrist, the arm can reach only 11 of 392 played frames: the clips use the grip
pivot's lever as reach. So **don't add a wrist bone and don't relocate `hand.R`.** Keep the 66 joints.

**Re-model the sword gauntlet's wrist in the grip pose instead.** Every grip holds the hand about 64° from bind, but the
gauntlet is modelled straight. Model the cuff and wrist band to bridge the wrist as it's bent in `Idle` f0, and bind
the gauntlet there, so the grip is the cuff's neutral pose. The cuts then deviate only 12–43° from it.

**The clips.** Against the grip, the sword hand is anatomically impossible here (`REF_CLIP=Idle node scripts/spellblade-audit/wrist-anatomy.mjs <glb>`):

| Clip | Wrist bend from the grip | Forearm twist from the grip |
|---|---|---|
| `Walk` | 111–123° on every frame (worst f6) | 29° |
| `Run` | 106–111° (f4) | 37° |
| `Sprint` | 89–99° (f3) | 34° |
| `Brake_Stop` | 87–120° (f3) | 77° (f4) |
| `Guard` | 19–43° | **−127° (f32)** |
| `Block_Impact` | 43° | **−126° (f6)** |
| `Rigid_Riposte_Deflect_Thrust` | 58° (f4) | **−130° (f4)** |

**Wanted:** within 45° of bend and 60° of twist from the grip. Move the elbow and forearm to carry the sword, not the
wrist. Keep the sword's own path (`socket_sword`) within 2 cm and 3° wherever gameplay reads it: the cuts, the bridges,
the Riposte thrust. In locomotion the sword may change its carry.

The cuts are already fine: 12–35° of bend.

## 4. 8916d5bd's cuts: keep the gains, fix the follow-throughs

**Keep:**

- the chop crossing the aim within 6° of it (it was 37° to the side);
- the backhand's reach of 82°;
- the forehand's own cut;
- the slams reaching 1.3–2.2 cm above the floor.

**`Slash_2` stops dead.** From f13 to f16 (0.43–0.53 s), and on into `Slash_2_to_3`, the elbow holds at 30.2–31.3°
and the blade-to-forearm angle at 75.4–76.1°. The arm locks straight out sideways at shoulder height with the blade
level, and it reads mechanical. **Wanted:** the follow-through decelerates over those frames, with the elbow folding
back toward the body (≥ 15° of elbow change between f12 and f18) and the blade dropping as it slows.

**`Slash_3`:** within 0.12 s of contact the blade only reaches −24° below the aim. **Wanted:** −40° to −50°, with the
torso leaning into the cut (the chest pitching forward ≥ 10° from f9 to f13).

**`Slash_1`:** the hips turn 8° while the shoulders turn 44°. **Wanted:** hips ≥ 15°.

## 5. Footwork

`8916d5bd` doesn't step; it glides. In `Slash_1` (right foot), `Slash_2` (left) and `Slash_3` (right), the moving foot
runs the same five frames at 0.34 / 0.81 / 0.96 / 0.81 / 0.34 m/s, 1.4 cm off the floor, and travels 21.6 cm. The
other foot is pinned at exactly 0.000 m/s while the pelvis travels 0.30 m and turns up to 32°. The knee takes the
difference as a pop of up to 43°/frame² (`Slash_1` right).

`de8c8655` glides too, 43–93 cm per cut.

**Wanted** (`scripts/spellblade-candidate-acceptance.mjs` now checks these):

- **A planted foot stays planted:** a foot within 4 cm of the floor travels ≤ 2 cm.
- **A foot that moves is lifted:** at least 5 cm, over at least 4 frames.
- **The knee bends smoothly:** ≤ 20°/frame².
- **Varied steps:** each cut its own step, not one curve shared by all three.

## 6. The slams' new timing

`8916d5bd` moved the low points and the reach:

| Clip | Low point (`de8c8655`) | Low point (`8916d5bd`) |
|---|---|---|
| Ground slam | 0.983 s | 0.967 s |
| Fast slam | 0.6 s | 0.667 s |
| Lightning arrival | 0.167 s | 0.233 s |
| `Sunder_Strike` | 0.45 s | 0.433 s (the game doesn't play this clip: Sunder's slams are the ordinary cuts) |

The tip now lands 1.68–1.77 m ahead of his feet, up from 1.39 m. That's fine if intended: the game re-times its impact
effects to whatever the next revision delivers. Over a step edge, 1.5% of Castleward's standable directions, the blade
floats or buries by more than 15 cm whatever you do; the game, not the clip, owns that.

## 7. The bridges

`8916d5bd` moved the bridges to start at 0.533 s and land at 0.133 s; the game uses 0.467 and 0.167. They land
exactly (0 m), so keep them; the game will re-measure. After `Slash_3`, the rising chain shows `Slash_2` frame 0 for
three ticks (0.1 s), a still pose. A `Slash_3_to_2` bridge would remove it.

## 8. The shoulder, the elbow and first person

- **The shoulder:** in de8c8655 both shoulders stretched past 1.5× in 79% of played poses and folded under 0.6× in
  73% (worst 3.2× and 0.08×). The proposed file now gives the six shoulder plates their own mean weights, as in §2: both
  pauldrons' plates and pads, and the Breastplate's two shoulder yokes. With that, no shoulder plate stretches or folds
  in any played pose. Put the same weights in the source. What remains is the right yoke parting from the chest shell
  by up to 5.8 cm (`GuardCut_1`); a yoke modelled to tuck under the shell's edge would hide it.
- **The elbow:** the pieces the elbow cop holds fold under 0.6× in 69% of played frames (offline, before the game's
  cop drive). In Castleward they are most of what still tears on the arm. Worst at `Technique_RigidRiposte_Thrust`
  0.03 s. Make the elbow's plates whole, with only the padding between them blended.
- **First person:** keep `80de8aee` until a new first-person file arrives with the third-person one. Your manifest
  names `12c8c9e9`, but no file came. Its `Arm.R` has the same gradients (1.8× in `FP_Whirl_Wind` f16, 1.4× in
  `Slash_1` f12), so give its plates the same treatment.

## 9. Questions

- **`AllNatural_Lightning_Arrival_Slam_1H_Alt`:** should it alternate with the two-handed arrival, or is it an archive?
  The game doesn't play it.
- **`AllNatural_Forceful_Strike_Recovery`:** it still ends 0.22 m from where its pelvis began. Is that intended?

## Don't change

The skeleton (66 joints, `hand.R` where it is: §3), the sockets, the sword's skin and point, the material
names, and every clip name. Keep the root unanimated. `scripts/spellblade-compat-check.mjs` has to print `compatible`.
