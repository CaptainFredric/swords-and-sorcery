# Rodin Spellblade

This pipeline makes the Spellblade from the creator's Hyper3D Rodin model of the canonical concept
(`assets/source/rodin/`). It keeps everything the game relies on from the armour kit: the 27-bone rig, all fifteen
third-person actions and eight first-person actions, the sockets, the review cameras and the part names. Only the body
changes, and the actions are refitted to its proportions.

It replaces the armour kit (`../kit/`). The kit matched the concept's parts one by one but stayed blocky; Rodin's model
reads as the concept itself: the helmet's T visor and crest, the scarf, the long banner with its trident, the heavy
sword with its red gem.

## Run it

From the repository root, with a Blender 4.5 binary:

```sh
BLENDER=/path/to/blender tools/blender/characters/spellblade/rodin/build.sh
```

It writes both sources in `../source/` and the emblem cape textures in `client/assets/heraldry/`, working in
`artifacts/rodin/` (git-ignored). The kit sources it starts from are read from git at a fixed commit, so the build does
not depend on the current sources. Then build and validate as the source README describes (`../build.py`, the GLB
validators, `scripts/test-spellblade-*.py`).

## Third person (`build_source.py`)

1. **Fit** (`fit.py`). Rodin's mesh is turned to face +Y and scaled so its hips sit at the pelvis height (×1.064, 2.05 m
   tall). Every bone keeps its production rest orientation and moves its rest head onto Rodin's joint; a pose turns each
   bone onto Rodin's limb, and the mesh is unposed from that pose into the rest (inverse linear blend skinning). The
   actions store rotations about the same orientations, so they play the new body as they played the kit.
   - **Weights** come from Rodin's autorigged file by vertex index (both files hold one mesh), mapped onto the 27 bones.
     Around the shoulders (within 24 cm of a shoulder joint, fading out by 40 cm) Blender's bone heat replaces them:
     Rodin's tore the armpits open whenever an arm rose.
   - **The sword** is rigid on `hand.R`. It is found by growing from the blade's core through connected vertices inside
     a cylinder about the blade's centreline and a slab in the blade's plane, which takes in the guard's quillons; the
     knee the sword passes in Rodin's pose lies off that plane and stays with the leg, and the fill never climbs into
     the gauntlet's cuff (vertices Rodin weighted to the forearm). The centreline runs through the midpoints of the
     blade's cross-sections: the blade is 22 cm wide, and an axis fitted to its clipped core leaned 7° toward one edge.
   - **The hand.** Its pose lays the kit sword's axis, measured in the hand, onto that centreline, so every action
     points Rodin's sword where it pointed the kit's. Its spin about that axis stays nearest Rodin's own wrist (9.9°
     away): laying the kit blade's width as well had twisted the wrist 36° and pinched it in every action. The sword
     turns in the fist instead, 35° about its centreline (`parts.turn_sword`, once it is its own part), so its flat
     lies where the kit's lay: the edge leads every cut, and first person sees the flat as the kit framed it.
   - **Rest lift.** Rodin's sword reaches 1.36 m from the wrist (the kit's 1.04 m), so at the kit's rest its tip sank
     below the floor, which the validators reject. The hand's rest is turned up 13° and every `hand.R` key is turned
     back by the same rotation (a fixed quaternion product: exact for keys and handles), so no pose changes.
   - **Sockets.** `socket_sword` moves onto Rodin's grip, `socket_sorcery` onto the open left palm; the kit's palm rune
     (`SorceryAccent`) rides with it.
2. **Parts** (`parts.py`). The game finds parts by name (the sword's finish and stowed copy, cloth dye, the banner's
   emblem, the cockpit hiding all but the gauntlets), so each face goes to one part:
   - `HeroSword`: the sword alone. Rodin fused the fist onto the guard over a stub of leather grip; the fist, that stub
     and the fingers lying over the guard (dark leather: the sword's brass and steel are never that dark) stay with
     `Gauntlet.R`. Rodin's own blade, a flat slab 22 cm across with a pale tan guard, is then replaced by the forged
     sword (`forge.py`) on the same grip axis, guard, flat and reach (1.30 m from the guard): a ridged blade with
     bevelled edges, a short ricasso and a long chisel point; a straight brass guard with blocked, pyramid-capped ends;
     a diamond frame over the blade's root holding a red gem proud on both faces; dark leather between brass collars,
     and a faceted brass pommel below the fist. Its colours are nine swatches painted into the atlas's one free square
     (`SWATCH_REGION`, checked free at build time; painted by `look.py` after the lift), so it stays in `GameBody`, with
     its sky reflection and Steel sheen, at no extra draw call. 139 faces in place of Rodin's 2,112.
   - `TabardBack`: the cape. Below 1.35 m it hangs free of the body as one surface, found by cutting the mesh there and
     keeping the red component behind the body.
   - `TabardFront`: the front tabard, found the same way below the belt (1.0 m).
   - The helmet: everything above 1.63 m, plus the visor and rim below that inside the helmet's footprint. `Visor` is the
     glass Rodin's emissive map marks, `Crest` the red plume, `HelmetJaw` the guard below the eyes, `HelmetShell` the rest.
   - Everything else by the bone that carries most of it: `Breastplate`, `Pauldron`, `Gauntlet`, `Greave`, `Boot`.

   Weight fixes come with the split:
   - **Rigid armour** (`rigid.py`). Rodin spread each limb's weights in long gradients (a vambrace a third on the upper
     arm, a cuirass half on the hips), so plates sheared and stretched like cloth when anything bent. Now each plate
     rides the bone that carries it, bending only in a band at each joint, where the dark underlayer is: at the waist,
     chest, elbows, wrists, knees and ankles a plane through the joint, halving the angle between its bones, divides the weight a
     vertex has on that joint's two sides (bands 5 to 10 cm: Rodin's triangles run to 4 cm, and a narrower band became
     one hard step). Weight on any other bone is left alone, so the waist never takes an armpit off its arm.
   - **Pauldrons.** Each pauldron is one plate on a bone of its own (`pauldron.L/R`: its upper arm's rest, on the
     clavicle) that follows its arm part of the way, as `client/game/pauldronFollow.mjs` turns it in game (0.6, rising
     to 0.95 for an arm raised overhead); `bake_pauldrons` keys the same into every action after the motion fixes.
     Rodin had the left plate half on the arm and the right a fifth, so the two moved differently and an arm raised
     overhead slid out from under its plate. The plate is the shoulder's faces from 12 cm inside the joint down to its
     rim (where the arm is wholly the arm's: 24 and 20 cm down the arm), easing onto the body's weights over 9 cm at
     its edge with the collar; both halves of a vertex Rodin split along a UV seam move as one.
   - **The helmet** is wholly the head's, to its very edge (Rodin had its lower half on the chest, so a turned head
     sheared the visor, dragged the collar and shoulders with it, and read as stuck to the neck). Nothing else rides the
     head: the body's head and neck weights go to the chest. It turns over the collar on its own, up to 47 degrees in
     Dash, and a dark gorget (`add_neck`: from inside the collar up into the helmet, following its opening and closed at
     the top) rides chest, neck and head and fills whatever opens between them. In game the head also takes part of the
     knight's aim pitch (`lookTurns`).
   - The cape and tabard move onto the tabard chains that the runtime's spring cloth drives (Rodin had the cape on the
     chest, so leaning into a dash swung it out like a plank): the anchor bone above, blending onto the first cloth bone
     just below the cut and onto the second around the middle.
   - The cape's chain hangs from the chest, where its top is (`hang_from`). The kit hung it from the waist, so a lean
     carried the cape's top away from the chain's swing and tore the band between them (15.8 cm in Dash). Each action's
     keys for it are re-taken on every frame, so it turns in the world as authored; the spring cloth turns it about
     its parent's axes, whichever bone that is.

   Split edges keep one set of weights and Rodin's own normals, so no seam opens.
3. **Motion** (`motion.py`).
   - **Rest:** the rest skeleton and mesh are lifted 2.7 cm so the rest model stands on the floor.
   - **Feet:** each pelvis height key of every standing action (and Death, which falls back pivoting on its feet) is
     re-planted so the lower sole touches the floor. The key and its handles move together, so loop seams keep their
     values and slopes. At mid-swing in Run the knee bends a little more (20°), so the returning boot clears 7 cm: Rodin's
     thigh is shorter and his shin longer than the kit's.
   - **Sword and floor:** with the longer sword and a forearm 39 % longer than the kit's, the kit's poses put the blade
     through the floor (up to 48 cm in Cast). Each hand key whose pose sinks it turns the grip by the least angle that
     clears it, about the axis that raises the blade's lowest point, and a key is added wherever it still dips between
     keys. Keys that clear are left as authored. The largest turns are in Stagger (33°), Dash (31°) and Death's first
     key (30°).
   - **Sword and body:** any frame where the blade still passes through the body or off hand gets the kit's
     follow-through search (one smoothing arm key, the smallest that clears it without speeding the blade up). One span
     remains: `GuardCut_1` frames 16.5 to 19, where the blade grazes the side of the helmet and its crest (the kit's
     own blade cut through its breastplate and right pauldron there).
4. **Look** (`look.py`). Rodin's one material becomes the materials the runtime looks for:
   - `GameBody`: every armour part and the sword. `plateEnvironment.mjs` gives this material a soft sky to reflect and
     raises its metalness by 1.25, so its metalness is cut to a sixth here; `steelSheen.mjs` hardens it in game.
   - `CapeBanner`: the cape, on the same atlas (no extra bytes); `emblemBanner.mjs` swaps its map for an emblem's.
   - `VisorGlow`: the visor glass, glowing with its own painted colour; `SorceryAccent` stays on the palm rune.

   The diffuse is lifted for the game's light (`rgb^0.8 × 1.12`): Rodin painted shading into it, which read muddy and
   dark under a hemisphere and sun. Textures are WebP (`EXT_texture_webp`), the diffuse at 1024 px, metal-roughness at
   256 px. Rodin's normal map is dropped: nine texels in ten tilted the surface by under 2.6°.

## First person (`fp_arms.py`)

First person keeps its own rig, camera and camera-tuned actions; only the meshes change, so both views share one look:
the gauntlets and sword are the third-person ones, drawn at one scale. Each vertex is carried from the third-person rest
into the first-person rest through its bones. The sword hand and sword go by the transform that carries the kit's own
third-person sword onto its first-person one (fitted on the kit's two meshes: the grip turned 31° and the sword drawn at
83 %); the left hand goes bone to bone at that same 83 %, so the two hands match; the upper arm and forearm at 83 %
across the bone and stretched along it to the first-person rig's lengths. The sockets and palm rune move with their
hands. Rodin's blade is longer and broader than the kit's, so in two swings it crossed the open off hand: there the
left arm drops out of its path by the least turn that clears it, eased in and out (`clear_off_hand`: 35° over frames
12.5 to 17.6 of `Slash_1`, 5° over the first frames of `Slash_2`).

## Emblems (`emblems.py`)

An earned emblem replaces the trident on the back banner. Each emblem texture is the atlas with only the cape kept:
the trident found on the cape's outer face (each texel placed back on the cloth, across and down), painted out by
diffusing the surrounding cloth into it, and the emblem drawn where it was, in the trident's colour for a one-colour
mark. Everything outside the cape's islands is flat grey, so each texture is about 35 KB. Rodin modelled the trident in relief (up to 3 cm off the cloth), so under an emblem its outline still
shows faintly in the light. Laying the relief flat was tried and smeared the default trident's paint, which every
knight wears, so the relief stays. Marks: Seize Thy Slayer from
`client/assets/heraldry/seize-thy-slayer.png`, St. Perry's shield from `emblem-st-perry-the-plain.png` (keyed from its
earlier cape texture).

## Checks on this source

- **Validators:** rig and model (`build.py`), both GLB validators, the first-person sword visibility check, and
  `scripts/test-spellblade-source.py`, `test-spellblade-motion.py` and `test-spellblade-combat-presentation.py` pass.
- **Budgets:** third person 30,074 triangles (target 35,000), 1.66 MB GLB (2.5 MB), 0.75 MB gzipped (the static
  server test allows 0.8 MB); first person 9,378 triangles and 0.52 MB.
- **Bytes:** `tools/blender/common/gltf_quantize.py` stores normals, texture coordinates and skin weights as normalized
  integers (`KHR_mesh_quantization`, read natively by three.js). Positions stay floats.
