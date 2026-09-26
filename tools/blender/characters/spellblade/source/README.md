# Spellblade artistic source

These two Blender 4.5.14 LTS files own the production geometry, rest rigs, skinning, materials, actions and review cameras.

Edit `spellblade-third-person.blend` for the world character and `spellblade-first-person.blend` for the camera presentation. Save edits here, then run `build.py` to export. The exporter reads these files. It never reconstructs armor or reauthors actions.

Export collections are `SpellbladeExport` and `SpellbladeFirstPersonExport`. Keep exactly one armature and the intended meshes in each. Review lights, cameras and floor belong outside those collections. Keep the existing bone and socket names, action names, unit scale and coordinate convention. Third person uses Blender +Z up and +Y forward, converted by glTF to runtime +Y up and -Z forward.

Slash contact frames at 30 fps are 13, 12 and 12; final frames are 23, 23 and 20. Gameplay owns displacement. Local pelvis motion supplies weight while the root remains unkeyed.

The build creates review copies and exports in the chosen output directory. Those copies are evidence; changes intended to persist belong in these source files. The build report records hashes of both inputs.

## Review locally

From the repository root:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/characters/spellblade/build.py -- \
  --mode review --out artifacts/spellblade-assets \
  --source-revision "$(git rev-parse HEAD)"
node scripts/preview-spellblade.mjs artifacts/spellblade-assets
```

Open http://127.0.0.1:3100. This local proxy substitutes candidate assets for review and leaves the tracked manifest and promotion request unchanged.

## Validation

```sh
npm run verify
blender --background --factory-startup --python-exit-code 1 --python scripts/test-spellblade-source.py
python3 scripts/validate-spellblade-glb.py artifacts/spellblade-assets/spellblade.glb
python3 scripts/validate-spellblade-glb.py --first-person artifacts/spellblade-assets/spellblade-fp.glb
```

Inspect four neutral views, the action poses and actual browser composition. Technical validation does not establish artistic acceptance.

Historical `authoritative_*`, `concept_*`, `hero_*`, `reference_match.py`, `locked_blueprint.py` and `blueprint_bounds.py` modules remain as archived modeling history. Production export does not import or execute them. Their obsolete source text assertions were replaced by source preservation and artifact contract checks. Existing runtime, protocol, socket, clip and external GLB validator tests remain active.

## Persistent canonical reference

Both sources include the full canonical PNG as packed image `CANONICAL_SPELLBLADE_KEEP`, retained with a fake user. The `Spellblade Reference` workspace places it beside the model. `CanonicalReferences` is locked against accidental selection and excluded from production export. Keep the reference collection and packed images when editing. The original PNG also lives in `references/canonical-spellblade.png` under version control. The Blender integration check verifies that the packed image and selection lock survive.

Armor bevel and cloth thickness modifiers precede the armature. Export applies non-armature modifiers and checks the resulting topology through a GLB roundtrip, so the runtime retains their geometry.

## September 23 form revision

The saved sources use a fitted convex cuirass, continuous shoulder planes, narrower helmet and boots, shorter crest and blade, and a fuller hanging tabard. The spell hand has three curling finger segments, synchronized to the independent first person rest rig. The relaxed casting arm sits closer to the torso. Neutral action returns match that pose; slash contacts and the gameplay root contract are preserved.

## Hand construction

Both rigs now share tapered glove palms, separate dorsal plates, open flared cuffs and beveled rectangular finger segments. The sword fingers wrap the actual grip axis. Obsolete wrist trim was removed. The Hand Reference workspace retains a packed crop of the canonical weapon and hand detail beside a local review camera; the full reference workspace remains available.

## Fixed reference comparison

The hero reference is packed as `CANONICAL_HERO_KEEP` and shown beside the fixed local hero camera in the Spellblade Reference workspace. The full canonical sheet and hand reference remain packed. This reference pass raises the waist, brings the shoulder assemblies inward, reshapes the crown and shoulder shells, narrows the fitted chest, lowers the relaxed spell hand, and reconstructs the knee and ankle overlaps. The existing rig names, contacts and unkeyed root remain intact. Restrained `ArmorColor` corner colors supply steel variation without extra materials or external textures.

## Shoulder and belt structure pass

The near shoulder is a larger overhanging shield with a lowered outer edge; the far shoulder stays compact. The cuirass and recessed waist widen to carry a substantial leather belt. A larger offset buckle and one diamond closure match the concept's main belt landmarks. Broad leather hangers occupy the spaces beside the tabard and remain parented to the pelvis. The world rig, action names, socket names and first person source are unchanged. This is an authored mesh revision, not a procedural runtime rebuild.

## Helmet, cloth and hand rework

The crown has a lower, broader profile. The scarf uses compressed planar folds, the shoulder lames taper beneath a continuous rim, and the near shoulder carries the reference fastening diamond. The front tabard narrows into a shorter asymmetric hem. Finger armor and cuffs use darker steel; the spell fingers curl more tightly in both sources. The world idle hand presents an upright cup, with matching action entry and return keys. The rigid cuffs follow the forearms, while palms and fingers follow the hands. Contact frames and gameplay displacement remain intact.

## September 24 helmet study

The helmet uses a broad faceted crown, cutback cheek plates, recessed angular cyan visor lines, a continuous beveled brass crown band and a swept red crest. The packed helmet crop opens beside the model for comparison. Body geometry, skin weights, rest bones and animation curves were compared against the prior source and preserved. This source revision is a candidate for visual review; asset promotion remains a separate step.

## September 24 crown squaring

The two largest remaining helmet discrepancies were the domed crown and the thin cheek and rear mass. This pass corrects only the crown. The upper shell rings were broadened and raised slightly, so the sides stay near vertical into a broad chamfered top instead of tapering into a dome. The front brow keeps a readable slope. The brass crown band was reseated on the new surface at half its solidify thickness, which also closes a pre-existing gap between band and brow. Crest and crest mount follow the new crown height. Only vertex positions of `HelmetShell`, `HelmetCrownBand`, `Crest` and `CrestMount` changed; weights, topology, bones, actions and packed references were compared and are identical. Review sheet: `docs/art/helmet-study/crown-pass.png`. The cheek plates, rear block overhang and visor recess remain for the next pass.

## September 24 helmet face and head scale

Cheek plates are rebuilt as blocks flush with the crown, with a lit front-outer chamfer. Following the concept, the long stroke of each cyan bracket now runs down the outer edge beside the cheek, and the strokes end above the jaw. The brass band narrows into a nose tip between them. The rear block drops straight to the scarf in crown steel, which removes the shelf under the crown. Every head-only mesh is scaled by 0.88 about the neck, moving the figure from 5.6 to 6.2 head-heights (the concept reads 6.5 to 7.5); the rest was kept for readability at gameplay distance. Scope: only the thirteen head-weighted meshes changed. Review sheet: `docs/art/helmet-study/face-pass.png`.

## September 24 back banner

The back tabard is regenerated as the concept's straight-sided banner: a slightly wider collar at the shoulders, parallel sides, and a stepped pixel hem in three drops to a centre tip. It hangs progressively further off the back toward the hem, which gives the side and three-quarter views the mass the concept's cape reads with. Cloth thickness comes from a solidify modifier ahead of the armature. The light border strips trace both sides and the steps, and the sigil rides the new surface. Weights follow the same height keys as before across chest, spine and the two back tabard bones, so every action animates the banner as it did. Length and width stay on the concept measurements (hem 0.20 of height, width about 0.19). Scope: TabardBack, both BackBorder strips and BackSigil. Review sheet: `docs/art/helmet-study/banner-pass.png`.

## September 24 front tabard and scarf

The front tabard is regenerated with the same banner construction as the back: straight sides, light border strips, and a stepped hem. It is shorter and narrower than before, on the concept's measurements (hem 0.26 of height against about 0.28; width 0.15 against 0.14), with the sigil re-centred. The scarf roll is pushed outward into a bulkier cowl and its front lowered so it sits under the helmet rim, leaving the full visor visible; its lower ring deepens and the chest drape lengthens into a tail on the far side. Weights follow the previous height keys on the front tabard bones; the scarf stays on the neck. Scope: TabardFront, both front border strips, TabardSigil, CrimsonScarf and ScarfFold. Review sheet: `docs/art/helmet-study/front-pass.png`.

## September 24 crown correction

The earlier squaring overshot into a flat lid. The upper crown rings now pull in (top ring to 74% width), so the crown reads as the concept's pentagon: short walls, broad chamfers and a narrow top. The brass band widens and ends in a beak between the visor brackets, reseated flush on the new surface. The crest is 55% taller above the crown and slightly wider. Scope: HelmetShell, HelmetCrownBand, Crest and CrestMount. Review sheet: `docs/art/helmet-study/crown-v3.png`.

## September 24 limb mass

Silhouette traces showed the model sitting inside the concept outline at every limb. Each limb piece is thickened around its own bone axis, leaving bone lengths, joints and weights untouched: thighs 1.15, shins and knees 1.2, forearms 1.15, upper arms 1.08. Boots widen 1.15 and lengthen 1.06 about the ankle, soles still on the ground. The blade is 12% longer along its own axis and 12% slimmer across it. Hands and shoulders are unchanged. The first-person source is not yet synchronized with the thicker forearms. Scope: 45 limb meshes and HeroSword, positions only. Review sheet: `docs/art/helmet-study/limbs-pass.png`.

## September 24 local concept pass (helmet, proportions, knees and boots)

Worked locally with EEVEE and the game preview. Every dimension was read off the canonical sheet on a pixel grid across the front, side, back, helmet and boots panels, and checked with the registered silhouette trace at the concept's own camera angles.

- Proportions: the shoulders come in 6 cm per side (span 0.49 to 0.42 of height), the legs straighten under the hips, the waist tapers to the belt (buckle, loops and hangers follow), and the head scales by 0.93. Skinned vertices moved with their bone weights and the rest bones moved with them, so actions play unchanged. The soles still meet the ground.
- Helmet: rebuilt as the concept's T-visor great helm. The crown is shallower than it is wide, with a crisp front edge and a V crease. The cheek blocks stand proud. The glowing glyphs run down the inner edges with bars outward and ticks at the ends, and the lit panels are recessed beside the cheeks. The jaw sides and chin rim leave the face open. The brass plate is wide and ends in a point, and the stepped crest meets the concept's crest height. The scarf is pulled in and lowered so it stops covering the visor.
- Knees and boots: rebuilt. The knee plate has brass rims and side lugs, a brass strap under the knee dips into a V at the front, the shin plate is narrow with a front ridge, a brass V guard sits over the instep with a buckle on each side, and the boot slopes down to a squared toe. Widths relative to knee height are within 0.02 of the concept's front view.
- Review cameras: the side view now looks at the front side (azimuth 70, not 112) and the helmet view matches the concept's 18-degree turn from 16 degrees above.

Scope: mesh data of the helmet, scarf, torso, waist, limb and boot pieces, plus the rest positions of the clavicle and leg bones. Bone names, weight groups, sockets, action curves, the unkeyed root and the packed references are unchanged. Contact frames are unaffected. 9,664 third-person triangles.

## September 24 concept fidelity pass 2 (helmet, scarf, sword, boots, gauntlets, clipping)

Measured on the canonical sheet's front, side and detail panels (the weapon and boots close-ups are painted in perspective, so proportions come from the front view and the registered trace).

- Helmet: the crown is short vertical walls with sloped front, side and back planes rising to a smaller flat top, plus a proud brow band. The brass plate is centred, runs from the crest's front face over the top and down the sloped front, and ends in a point between the glyph bars. The glyphs follow row scans of the concept: the inner strokes sit 5 cm apart, the outer ticks rise nearly to the brow, the lit panels are in the lightest steel, and the face is open at the bottom. The crest sits at the back of the crown and steps down the back. The face lengthens 2 cm, giving 6.64 head-heights (concept front 6.75, side 6.52).
- Scarf: a snug upper collar on the neck and a thicker lower roll on the chest that dips into a V at the front. The shoulder plates overlap the roll's sides, and one continuous end hangs down the character's left chest. Every piece is fitted by ray casts against the real breastplate, back and helmet.
- Sword (both sources): 0.85 m from the guard to the tip. The blade is 0.22 m wide with parallel edges, a hexagonal bevelled section and a chisel tip on the outer edge. The brass crossguard runs 0.41 m end to end with cube blocks and pyramid caps, a centre block carries the diamond frame and red pyramid gem on both faces, a collar sits where the blade meets the guard, and the brass pommel is faceted. The grip is unchanged, so the fingers still wrap it. First person uses the same builder scaled to its grip.
- Boots: a taller, forward-projecting toe box and an armoured heel plate behind the ankle.
- Gauntlets: the spell-hand fingers open about their knuckles, from a fist to the concept's cupped hand, and both vambraces gain the brass rim at the wrist end.
- Clipping: the sword arm is held 12 degrees further out in Run (all keys) and in Cast (interior keys only, so its start and end still match Idle). Blade-into-thigh frames fall from 10 to 0 in Run and from 8 to 3 in Cast. Every other action curve is identical to the previous revision, and all contact and final frames are unchanged.

Known remaining: the Slash_1 and Slash_3 follow-through (after contact) sweeps the blade through the right thigh for 4 and 7 frames. The pommel sits inside the wrist cuff because the grip runs parallel to the forearm, which is hidden.

## September 25 concept-generated body and helmet

The procedural armour pieces are replaced by a body and helmet generated from the canonical sheet, painted with the sheet's own colours and fitted to the existing rig. `concept3d/README.md` documents the pipeline, inputs, registration and joint data.

- Shape: Hunyuan3D-2mv from the sheet's front, back and side panels. The helmet was generated separately from the helmet detail panel, symmetric, with the brass plate centred.
- Paint: each concept view is projected onto the surfaces that face and see it, then baked into JPEG textures (body 1536², helmet 1024²). The visor glyphs are split onto `VisorGlow`.
- Rig: the rest joints moved into the new body. Every quaternion key was compensated so each action reproduces the previous world-space poses. Timing, contact frames, end frames, bone names, sockets and the unkeyed root are unchanged.
- Kept: the measured sword, its grip wrap and the palm rune, carried with their hands.
- Sword through body: 9 frames over all actions, all in the Slash_1 and Slash_3 follow-through.
- 24,014 triangles, 1.97 MB GLB.

## September 25 skinning rebuild

The first concept-generated build tore in motion: automatic weights on the fused generated shell reached 1.2 m of edge growth in the slash and guard animations, and its runtime assets were withdrawn (#53).

This revision reskins the same body:
- **Weights:** copied from the old rigid pieces carried onto the new rest, then smoothed.
- **Cuts:** the shell is cut along limb-to-limb contacts that are not real joints, and each side keeps only its own chain's bones.
- **Cloth:** chain weights blend into the body, and the cloth bones keep their own local swing.

Results:
- Worst edge growth over all actions: 13.7 cm.
- The cloth at the runtime spring limits adds nothing.
- The sword is inside the body in 9 frames, all in slash follow-through.
- 23,658 triangles, 1.94 MB.

See `concept3d/README.md`, section 6.

## September 25 armour kit

The concept-generated body is replaced by a crisp low-poly armour kit, built by `kit/build_kit.sh`. It is measured from the sheet's registered front, side and back panels and coloured to match the sheet under the game's menu lighting. `kit/README.md` documents the pieces, the colour calibration and the review tools.

- **Rig:** the arms are symmetric at the concept's proportions (upper arm 0.30 m, forearm 0.28 m, hand 0.15 m). Every quaternion key was compensated, so each action keeps its world-space bone orientations. Timing, contact frames, end frames, bone names, sockets and the unkeyed root are unchanged.
- **Helmet:** the measured helmet, raised 5 cm and enlarged 8% to the front and side panels. The scarf wraps its base in two rolls, with one end hanging down the left chest.
- **Pieces:** gabled pauldrons with proud brass rims and studs, a shield breastplate with brass trims, a belt with a brass diamond and steel buckle, knee cops, greaves, boots, vambraces and gauntlets. Every piece is rigid to its bone.
- **Cloth:** the front tabard and back banner carry a painted border, stepped hem and trident.
- **Surface:** tiling wear textures (scratches, chips, mottling) and baked occlusion.
- **Motion:**
  - Worst edge growth over all actions: 0.56 cm.
  - The cloth at the runtime spring limits adds 0.4 cm.
  - The sword is inside the body in 10 frames, all in the Slash_1 and Slash_3 follow-through.
- **Budget:** 10,308 triangles, 1.73 MB GLB, 17 meshes.

## September 25 scarf cowl

The two stacked scarf rolls are replaced by one draped cowl, matching the concept's front panel:
- a thick rolled top around the helmet base
- a lower edge that flares over the shoulders and drops to a V over the chest top
- soft folds across the front, and one tail hanging down the left chest

Only the scarf geometry changed. Motion checks are unchanged:
- worst edge growth 0.56 cm
- the sword is inside the body in 10 frames, all in slash follow-through

10,024 triangles, 1.69 MB GLB.

## September 26 hands, helmet, shoulders and first-person arms

Measured against the sheet's weapon-and-hand, helmet and shoulder detail panels:

- **Gauntlets:**
  - The sword fist has a raised steel back-of-hand plate with a brass band, four finger caps side by side, and a thumb.
  - The spell hand is palm up, with four steel fingers curling up around the rune.
  - The cuff flares to a brass band at the wrist.
- **Helmet:** the crown slopes back in broad planes to a smaller top over a proud brow band. The face is recessed between raised lit side plates, and the brass plate is wider.
- **Shoulders:** each pauldron is a faceted dome tilted down to the outside. A thick brass border runs along the bottom, tallest across the front, and up the inner front edge, with the stud on the border's corner. Two dark lames hang below.
- **First person:** the arms use the same builders, materials and wear as the third-person arms, on the authored first-person rig and actions. It has 4 meshes instead of 56 and 2,504 triangles.
- **Motion:** worst stretch is still 0.56 cm. The sword clips in 11 frames: 10 in the slash follow-through, plus 1 where the Slash_2 windup brushes the brow band.
- **Budget:** third person is 10,666 triangles and 1.79 MB.

## September 26 helmet, pauldron, gauntlet and first-person refinement

Registered overlays on the concept's front, side and back panels showed two problems:
- **Idle pose:** it lowers the head 4.4 cm and the shoulders 5.7 cm from where they were modelled.
- **Off-centre helmet:** the helmet sat 3 cm off-centre. It was built centred in generation space but shifted like the off-centre generated body.

Changes:
- **Helmet:** centred on the head bone and raised 3.5 cm, with a shallow ridge up the crown front. The scarf's rolled top now wraps up to meet it, so the helmet rises clear of the shoulders as in the concept.
- **Pauldrons:** raised 5 cm and 2 cm narrower on the outside. The front face now leans back as one broad plane, framed in brass along its bottom, up its inner side and along its top, with the stud in the frame's lower inner corner.
- **Gauntlets:**
  - Each finger is now three segments with steel scales, below overlapping back plates and a knuckle guard.
  - The sword fist is posed around the sword's real grip.
  - The vambrace flares to the wrist, with a chevron rim at the elbow and raised panels that follow the flare.
- **First person:** the same builders, with forearms 20% slimmer (the usual view-model scale) and the raised panel on the face the eye sees.

Checks:
- **Motion:** worst stretch is still 0.56 cm. The sword clips in 10 frames, all in the known follow-through; the Slash_2 brow graze is gone. The helmet and pauldrons never touch.
- **Cloth:** verified in motion with the runtime cloth code.
- **Budget:** third person is 11,033 triangles and 1.84 MB; first person is 2,604 triangles and 0.41 MB.

## September 26 slash follow-through

In the Slash_1 and Slash_3 follow-through, the interpolation from the follow-through key to the end pose swung the blade low across the front of the legs and below the floor, for 10 frames.

`kit/followthrough.py` now adds one arm key inside each follow-through: the upper arm raised forward 18° at Slash_1 frame 21 and 42° at Slash_3 frame 15. The action's own curves carry the blade in front of the legs.

It is the smallest correction the search found that clears the body and floor without moving the blade tip faster than the original motion. A per-frame fix was tried and rejected, because it moved the tip up to 1.7 m in one frame.

Checks:
- **Unchanged:** contact frames, end frames, every other bone and every other action.
- **Clipping:** the sword never enters the body in any frame of any action.
- **Stretch:** worst stretch is still 0.56 cm.
