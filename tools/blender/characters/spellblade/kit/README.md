# Spellblade armour kit

This pipeline builds the third-person Spellblade as a crisp low-poly armour kit: one clean shell per piece, measured from the canonical sheet and coloured to match it under the game's own lighting.

It replaces the concept-generated body from `../concept3d`. That body had the right silhouette but lumpy surfaces, and its projected paint smeared across them, so up close it read as murky camouflage. The helmet built from measurements was the part that matched the concept best, so every other piece is now built the same way.

## Run it

From the repository root:

```sh
KIT_PYTHON=/path/to/python-with-numpy-and-pillow tools/blender/characters/spellblade/kit/build_kit.sh
```

It rewrites `source/spellblade-third-person.blend` and works in `artifacts/kit/` (git-ignored). The steps are:

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

## Pieces

Each piece is rigid to one bone, except the torso undersuit (pelvis–spine–chest blend) and the cloth panels (tabard chains).

| Part | Bone(s) | Built from |
| --- | --- | --- |
| Boots | foot | Heel-to-toe loft with sole, instep strap and buckle, brass ankle band |
| Greaves | shin | Octagonal shin plate, brass band under the knee, faceted knee cop with brass rim; thigh undersuit, dark cuisse lames, leather straps and hip tasset merged in (thigh) |
| Breastplate | chest / pelvis | Shield plate with brass side trims, dark back plate, draped scarf cowl that drops to a V over the chest with a hanging tail, abdomen lame, undersuit; belt with brass diamond and steel buckle (pelvis) |
| Pauldrons | clavicle | Octagonal walls under a gabled roof: a pentagon from the front, a peaked hexagon from the side. Proud brass rim, brass inner edge strip, brass stud |
| Gauntlets | upper arm, forearm, hand | Lame with brass rim, undersuit and dark band; vambrace with brass rims; flared cuff, back plate, knuckles and thumb |
| Tabards | tabard chains | Double-sided stepped panels with the banner texture |
| Helmet, visor, crest | head | `helmet3.py` |
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

- Worst edge growth over every frame of every action: 0.56 cm. The rigid pieces don't stretch; the concept-generated body reached 13.7 cm.
- The cloth panels at the runtime spring limits: 0.4 cm.
- The sword is inside the body in 10 frames, all in the Slash_1 and Slash_3 follow-through. The previous body had 9.
- 10,024 third-person triangles (limit 35,000); 1.69 MB GLB (limit 2 MB).
