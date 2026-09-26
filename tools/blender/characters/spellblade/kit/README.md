# Spellblade armour kit

This pipeline builds the third-person Spellblade as a crisp low-poly armour kit: one clean shell per piece, measured from the canonical sheet and coloured to match it under the game's own lighting.

It replaces the concept-generated body from `../concept3d`. That body had the right silhouette but lumpy surfaces, and its projected paint smeared across them, so up close it read as murky camouflage. The helmet built from measurements was the part that matched the concept best, so every other piece is now built the same way.

## Run it

From the repository root:

```sh
KIT_PYTHON=/path/to/python-with-numpy-and-pillow tools/blender/characters/spellblade/kit/build_kit.sh
```

It rewrites both sources (`source/spellblade-third-person.blend` and `source/spellblade-first-person.blend`) and works in `artifacts/kit/` (git-ignored). The steps are:

1. **Base:** it extracts the last hand-built source from git (`bcc16ef`), which supplies the rig, the eleven actions, the sword, the palm rune, the accent materials and the packed references.
2. **Joints** (`joints_concept.py`):
   - Torso, legs and cloth chains keep the live rig's joints.
   - The arms become symmetric at the concept's proportions: upper arm 0.30 m, forearm 0.28 m, hand 0.15 m, shoulders at ±0.28 m. They were 0.39/0.31/0.16 m and asymmetric.
   - The cloth bones follow the new tabard and back banner.
3. **Rig** (`rig2.py`): moves the rest joints and pre-multiplies every quaternion key. Each non-cloth action therefore keeps its world-space bone orientations, timing, contact frames and unkeyed root. The sword and palm rune ride with their hands.
4. **Helmet** (`helmet3.py`): the measured helmet, 0.33 m tall from z 1.745. That is 5 cm higher and 8% larger than the previous helmet, matching the front and side panels.
5. **Textures:**
   - `banner_tex.py` draws the front tabard and back banner: red field, cream border, stepped hem and trident, at physical scale.
   - `wear_tex.py` draws two small tileable wear textures (scratches, chips, mottling).
6. **Kit** (`kit.py`, `kit_pieces.py`, `kit_finish.py`): builds every piece, then merges pieces into the validator's named parts.
7. **Stance and living holds** (`stance.py`):
   - **Ready stance:** every standing action (Idle, Guard, Cast, Stagger, the slashes) gets the same ready stance: hips flexed 13°, knees bent and 6° out. The feet keep their orientation, and the pelvis is re-planted per key so the lower foot stays exactly on the ground. Inside attacks and reactions the bend is eased off, so lunges keep their height.
   - **Shared hold:** the start and end keys take Idle's ready hold (elbow bent, blade angled forward-down in front of the feet, as in the concept's side view), so actions leave and return to the idle pose.
   - **Idle:** a 2 s breathing loop.
   - **Guard:** its hold (frames 8–56) is a breathing 1.6 s loop that the runtime plays instead of freezing one frame.
   - **Quaternion signs:** every bone's quaternion keys are kept in one hemisphere.
   - **First person:** gets the same guard loop.
8. **Slash follow-through** (`followthrough.py`): interpolating from a slash's follow-through key to its end pose swung the blade low across the front of the legs and below the floor. For each slash this adds one arm key inside the follow-through and lets the action's own curves interpolate it, so the blade's path bends around the legs. The search tries swinging the arm out, raising it forward, swinging it back, turning it outward and tipping the blade forward, over one or two key frames and increasing angles. It keeps the smallest correction that clears the body and floor without moving the blade tip faster than the original motion. The windup (start to contact) is checked the same way. The corrections are chosen by the search, so the key frames and angles can change from one build to the next. Contact frames, end frames and every other bone are unchanged.
9. **First person** (`KIT_MODE=fp`, `fp_pieces.py`, then `stance.py`): on the authored first-person source it replaces the old arm pieces with the same builders (`arms.py`), materials and wear textures. As is usual for view models, the hands are drawn 15% larger and the forearms 20% slimmer than in third person. At arm's length from the eye the arms otherwise fill the frame and hide the hands. The forearms carry their raised panel on the top face, the one the eye sees.

## First person and third person

The two views share their look, not their rig:

- **Shared:** the first-person arms come from the same builders, materials and wear textures as the third-person arms. Changing a gauntlet in `arms.py` changes both views.
- **Separate:** first person keeps its own arm rig, camera and camera-tuned actions. Seen from the eye, the full third-person body would drift out of frame and clip into the camera, and every swing would have to be retuned.

## Pieces

Each piece is rigid to one bone, except the torso undersuit (pelvis–spine–chest blend) and the cloth panels (tabard chains).

| Part | Bone(s) | Built from |
| --- | --- | --- |
| Boots | foot | Heel-to-toe loft 0.26 m wide with sole, instep strap and buckle, brass ankle band |
| Greaves | shin | Octagonal shin plate 0.21 m wide, a brass band under the knee and a faceted knee cop about 0.25 m wide with a brass rim. The thigh (undersuit, dark cuisse lames, leather straps and the hip tasset, about 0.26 m across) is merged in. Sizes are measured on the concept's front and back views. |
| Breastplate | chest / pelvis | Broad plate from under the scarf to the belt: about 0.47 m across, 0.27 m at the belt, two planes meeting at a central ridge, thick brass trims down both sides. Dark back plate, abdomen lame and undersuit. The scarf is a rolled collar round the helmet base over a draped cloth: its edge sits high on the right shoulder and drops across the chest to the left, where a creased loose end hangs. It has seven angular folds with dark valleys, and a back collar that drops into the banner. The belt (pelvis) carries a brass diamond and steel buckle. |
| Pauldrons | clavicle | Faceted dome tilted down to the outside, its front face one broad plane leaning back about 19°. A brass frame runs around that face: the bottom border (tallest at the front), a broad strip up its inner side and a strip along its top, with the pyramid stud in the frame's lower inner corner (concept shoulder detail). Built 5 cm above the clavicle, because the idle pose lowers the shoulders 5.7 cm. About 0.27 m wide, with the outer edge at x 0.46 as in the concept's back view; the frame's top slopes from the neck down to the outer side. |
| Gauntlets | upper arm, forearm, hand | `arms.py`, from the concept's weapon-and-hand detail. Upper arm: two dark lames, undersuit and a dark band. Vambrace: flares from the elbow to the wrist, with a brass chevron rim that rises over the outer elbow, a brass cuff band, and raised panels that follow the flare. Hands are articulated plate gauntlets: overlapping back plates, a knuckle guard, and fingers of three segments, each a glove core with a steel scale on its back. The sword fist is posed around the sword's real grip, so the fingers wrap it. The spell hand is palm up, with its fingers curling around the rune. |
| Tabards | tabard chains | Double-sided stepped panels with the banner texture. The front panel is 0.29 m wide. The back banner is 0.36 m wide down to z 0.45 and stands 6–13 cm off the back, flaring toward the hem, with its edges curled forward so it reads as a cape from the side (concept side and back views). |
| Helmet, visor, crest | head | `helmet3.py`, from the concept's helmet detail. Over a proud brow band, the crown rises in broad planes to a top 58% as wide, with the front sloping back 8.5 cm. The cheeks taper toward the chin, the brass plate is raised 11 mm, and the crest is a taller block running back from the plate. The face is recessed between raised lit side plates, and a wide brass plate runs to a point. The helmet is centred on the head bone and built 3.5 cm high, because the idle pose tilts the head 7.8° down; in idle it then lands where the concept shows it. |
| Sword | hand.R | The measured sword from the base source, recoloured |

## Colour

The runtime has no environment map. Its menu light is a 0x353127→0xdce7d2 hemisphere at 2.25, a warm key and a cool rim.

`calib_light.py` measures how much of each albedo that light returns on a front face. It returns (0.727, 0.671, 0.474) linear per channel. Piece colours are then the concept's sampled front-face colours divided by that factor:

| Material | Concept front-face colour (sRGB) |
| --- | --- |
| Steel | 108, 100, 110 |
| Brass | 186, 146, 118 |
| Undersuit | 26, 28, 40 |
| Leather | 86, 61, 49 |
| Cloth | 104, 44, 48 |

In the menu, rendered front faces land within about 12 sRGB levels of the concept. The steel reads as a cool lavender grey, as it does in the concept.

Colours live in the `ArmorColor` corner attribute, with a few finishing steps:
- Bevel faces are lighter, like the concept's lit plate edges.
- The legs darken slightly toward the ground.
- Occlusion is baked per face corner, with 20 rays out to 7.5 cm. Only pieces that move together shade each other, so an arm never leaves a shadow on the torso.

Everything uses three materials:
- `KitMetal` and `KitMatte`: `ArmorColor × wear texture`.
- `KitBanner`: `banner texture × ArmorColor`.
- `VisorGlow` and `SorceryAccent` stay the runtime's mutable accents.

## Review tools

These use `../concept3d/data/register.json` and `../concept3d/inputs/clean_*.png`:

- `ov.py`: orthographic renders registered to the concept's front, side and back panels, with the model's piece outlines drawn over the concept.
- `ruler.py`: a concept panel with a rig-space grid, for reading positions and sizes in metres.
- `gamelook.py`: the model under the menu lighting beside concept crops.
- `posesheet.py`: key poses of every action, front and back.

`client/assets/_lookdev/` (git-ignored) holds a local viewer that loads the candidate GLB through the game's own asset loader and animator.

## Checks on this source

- **Stretch:** worst edge growth over every frame of every action is 0.56 cm. The rigid pieces don't stretch; the concept-generated body reached 13.7 cm.
- **Cloth:** the cloth panels at the runtime spring limits stretch 0.4 cm. In motion, measured with the game's own cloth code, the back banner trails 24 cm further back at a 6 m/s run, and the tabard swings 18 cm forward on a sudden stop.
- **Clipping:** the sword never enters the body in any frame of any action; it had been 9 to 12 frames of slash follow-through since the first procedural model. The helmet and pauldrons never touch.
- **Third person:** 11,033 triangles (limit 35,000), 1.84 MB GLB (limit 2 MB).
- **First person:** 2,604 triangles (limit 16,000), 0.41 MB GLB (limit 1 MB), 4 meshes.

Small parts, such as finger segments, skip the edge bevel, which keeps the GLB inside its byte budget.
