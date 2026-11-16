# For Argon: one revision request after 8916d5bd (2026-11-16)

`8916d5bd` stays a candidate. It isn't going into the game as it is. The game now ships `de8c8655` with corrected
gauntlet weights (`d4889a8a`): every clip, mesh, bind and joint byte is yours, and only the weights changed (§2). Make
the changes below in **one new revision**, starting from `8916d5bd`.

Clips are 30 fps, frames 0-based (`time × 30`). "Grip" means the sword hand's relation to the forearm in `Idle` f0, the
hold every cut starts from. Every number here is measured on the GLB, and the tools are named so you can re-measure.

## 1. The Blender source (blocking)

Send the `.blend` your manifest names (`65ff5eb7…`). The game will open it in Blender, run Blender's own glTF exporter,
and compare the result with your GLB: skeleton, binds, meshes, weights, and every clip's bone trajectories, which must
agree within 1 mm and 0.5° (`scripts/spellblade-audit/blend_inspect_export.py`). A clip that agrees is accepted even if
the bytes differ.

- **`reproduce_spellblade_from_blend.py` doesn't count:** it cuts a GLB appended to the end of the `.blend`
  (`GLTF_SYNC_V1`), so it proves nothing about the scene.
- **The only source we have, `a33f5a94`, isn't this model's source.** It has a 27-bone rig and 15 Actions, and
  natively exported it breaks compatibility (28 joints against 66).

## 2. Keep the corrected gauntlet weights

The torn, jagged sword arm was the gauntlets' weights. Every plate of `Gauntlet.L/.R` was skinned with a soft
forearm-to-hand gradient, so each one sheared whenever the wrist bent: edges reached 5.2× their length in `Slash_1` f8,
8.6× in `Guard` f12 and 9.5× in `Rigid_Riposte_Air_Dash_Thrust` f8. The game's file now has:

- the vambrace and its band 100% `forearm`;
- the back of the hand and the knuckle plates 100% `hand`;
- the wrist cuff (648 vertices) and the wrist band (200 / 204) each one uniform blend across the whole piece (cuff
  0.17 hand, band 0.51 / 0.52 hand);
- the palm's forearm share moved to the hand, the finger lames unchanged.

The script is `scripts/spellblade-reweight-gauntlet.mjs`. Put the same weights in the source. The test
`server/tests/spellblade-gauntlet-plates.test.mjs` fails any revision that brings the gradients back.

## 3. The sword wrist: rig and clips

The weights stop the tearing, but the wrist can't look right while these two problems remain.

**The pivot.** `hand.R` sits on the grip, about 15 cm past the anatomical wrist. Along the forearm from elbow (0) to
the `hand.R` joint (1): the cuff spans 0.53–0.78 and the fist 0.60–1.10. So every wrist bend swings the whole fist
round the grip. Either:

- add a wrist bone at the anatomical wrist, with `hand.R` as its child. That's a deliberate 67th joint, and the game
  will take it with its seat poses and compat check updated; or
- re-pose the gauntlet in bind with the wrist bent as in the Idle grip, so the grip is the cuff's neutral pose.

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
| Sunder | 0.45 s | 0.433 s |

The tip now lands 1.68–1.77 m ahead of his feet, up from 1.39 m. That's fine if intended: the game re-times its impact
effects to whatever the next revision delivers. Over a step edge, 1.5% of Castleward's standable directions, the blade
floats or buries by more than 15 cm whatever you do; the game, not the clip, owns that.

## 7. The bridges

`8916d5bd` moved the bridges to start at 0.533 s and land at 0.133 s; the game uses 0.467 and 0.167. They land
exactly (0 m), so keep them; the game will re-measure. After `Slash_3`, the rising chain shows `Slash_2` frame 0 for
three ticks (0.1 s), a still pose. A `Slash_3_to_2` bridge would remove it.

## 8. The shoulder and first person

- **The shoulder plate:** `Pauldron.R` is skinned 0.72 pauldron / 0.28 clavicle across the plate, and stretches
  1.9–2.4× in `Slash_2_to_3` and `Slash_3`. Weight the plate wholly to `pauldron.R`; the game turns that bone itself.
- **First person:** keep `80de8aee` until a new first-person file arrives with the third-person one. Your manifest
  names `12c8c9e9`, but no file came. Its `Arm.R` has the same gradients (1.8× in `FP_Whirl_Wind` f16, 1.4× in
  `Slash_1` f12), so give its plates the same treatment.

## 9. Questions

- **`AllNatural_Lightning_Arrival_Slam_1H_Alt`:** should it alternate with the two-handed arrival, or is it an archive?
  The game doesn't play it.
- **`AllNatural_Forceful_Strike_Recovery`:** it still ends 0.22 m from where its pelvis began. Is that intended?

## Don't change

The skeleton (except a wrist bone, if you choose it in §3), the sockets, the sword's skin and point, the material
names, and every clip name. Keep the root unanimated. `scripts/spellblade-compat-check.mjs` has to print `compatible`.
