# Right first person gauntlet source candidate

The sword hand now has a tapered armored back, aligned knuckle caps, four separated fingers with three armor scales each, supported dark joints, an opposing thumb and a layered wrist transition. The canonical concept's weapon and hand panel is the primary reference. This source geometry revision awaits creator artistic acceptance.

Open [the matched comparison](comparison.html) and [the live local simulation recording](live-actions.webm). Both sides retain the approved 35 degree sword roll. The forearm, left hand, sword dimensions, rig, sockets, action curves, gameplay timing and third person model remain preserved.

## Baseline and isolation

The Greener Pastures density/choreography branch was pushed and frozen at `37429653fc6869b827b387b85f41bf48941955fa`. PR #160 subsequently merged externally. This separate branch began at main `b43b3fc574b17b9b1573268194013c13e9930200`, with Claude's approved sword roll carried as `fbe1178`. The source revision exported is `1048debe477eef37d2d86bd784c971ec134547c3`.

The primary checkout and local Claude work were left untouched. PR #161 subsequently merged that sword roll and voice work into main. Its voice changes belong to that existing PR.

## Diagnosis and source work

The first person mesh is independent of the third person knight. Its right hand belongs to `Arm.R` in `tools/blender/characters/spellblade/source/spellblade-first-person.blend`, rigidly weighted to `hand.R`. The physical sword handle is a distinct connected component of `HeroSword`.

The primary defect was source construction and grip fit. Two stacked back plates, four raised studs and a broad palm block obscured the fingers from the camera. The baseline contained 240 intersecting hand/handle face pairs. The rig and socket relationship were retained while the mesh was fitted around the actual handle.

Only the hand weighted portion of the editable Blender mesh is replaced. A vaulted faceted hand plate, nested wrist lame, four curved plated fingers, continuous dark joint cores and a two scale thumb with a supported web replace the stacked construction. Existing material slots and the steel, dark joint and brass corner color vocabulary are reused. The preserved brass forearm cuff remains the transition anchor.

## Blender handoff

Open the production first person source and edit `Arm.R`. All new hand vertices have weight 1.0 on `hand.R`. The physical grip center in hand bone coordinates is approximately `(-0.0259135, 0.0591134, -0.0065584)` meters. Its maximum radial handle extent is 0.042373 meters.

The `GauntletPart` face attribute identifies the pieces:

| Value | Piece |
| :--- | :--- |
| 1 | Wrist lame |
| 2 | Main hand protection |
| 100 + 10 × finger + segment | Three armor scales per finger |
| 109 + 10 × finger | Continuous finger core |
| 199 | Thumb web |
| 200, 201 | Thumb armor scales |
| 209 | Thumb core |

Finger indices are 0 through 3; segment indices are 0 through 2. `kit/right_gauntlet.py` reproduces the candidate from the prepass source into a separate output. Its marker prevents applying it twice. Future artist edits should be saved directly in the production source. The historical whole kit builder would reconstruct unrelated geometry and actions.

Export only this source through the established authored pipeline:

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/export-spellblade-first-person.py -- \
  --out output/gauntlet/pipeline \
  --source-revision 1048debe477eef37d2d86bd784c971ec134547c3
python3 scripts/validate-spellblade-glb.py --first-person \
  output/gauntlet/pipeline/spellblade-fp.glb
python3 scripts/validate-spellblade-fp-render.py \
  output/gauntlet/pipeline/spellblade-fp-slash.png
```

The wrapper calls the existing `build_first_person_asset` exporter and source loader. The [build report](build-report.json) records actual source and output hashes. Baseline source for reproduction is available from commit `fbe1178`.

## Visual evidence and limitations

The matched comparison covers idle, close inspection, above/side grip, Guard, Parry, all three strikes, Sprint, Dash, air/landing, Fireball, Frostfire, Gale, Steel and concurrent Chivalry. Standard views are 1440 × 812; constrained idle and Chivalry views are 844 × 390.

These are production `WeaponView` inspection fixtures in the real game renderer. The fixture stops the local clock, creates a temporary view model and samples matching action times. Close, above and side views use an inspection camera solely to expose construction. Ordinary captures retain the existing action driven camera and FOV. The game assets contain the actual revised mesh.

The separate silent video runs production `InputController` commands through real local authority: combo, Guard, Fireball, Sprint, Dash and jump/landing. Its 202 state samples show the actual action and movement states. The helper temporarily enables input because an automated canvas click did not grant physical Pointer Lock, then releases inputs and restores that flag. It proves controller integration; physical mouse/Pointer Lock remains unverified by this recording. Temporary fixture tabs were closed.

The side view exposes substantial separated finger plates with supported joints. The overhead view exposes the thumb and hand web. Ordinary poses show a coherent steel hand and cuff. The third strike's existing two hand pose still allows cuff overlap; choreography remains outside this geometry pass. In very short windows the existing ability HUD overlaps part of the sword hand. That layout is a separate UI concern.

## Validation

The Blender comparison preserves unrelated meshes, the nonhand portion of `Arm.R`, material slot names, weights, rest bones, all eight action curves including tangents, and the packed canonical reference. Handle surface intersection is zero in rest and in 200 evaluated poses across all eight actions. [Source validation](source-validation.txt) records the result. This grip surface test does not establish freedom from every possible armor intersection.

The final GLB has 4,440 triangles against the 16,000 budget and is 645,528 bytes against the 1,000,000 byte budget. Baseline: 4,572 triangles and 705,700 bytes. GLB validation and the slash visibility check pass. Source SHA256: `1b375fc91b4a95c3624a967cc958dbe5cc3f9a5b31a9b18a4367d2652fb30063`. Export SHA256: `f908add3a413024bdeabc38363fcc733287515f277b5b5cb002026e3997b6abd`.

Third person source SHA256 remains `740301e4e9632d71f61861edacd516937deb85abe32e8cc838b39d358c38dc53`. Third person GLB SHA256 remains `cff58f675bce03eb6b34976783a4a1ee2745bd4626df541187b9b81119fcc967`.

Final repository verification is recorded in [verification.txt](verification.txt). An initial full run under concurrent Blender/browser load timed out in the WebSocket flood test. Its focused rerun passed all five integration tests. This transient failure remains disclosed.

[Changed files](changed-files.txt) lists every file in this candidate relative to current main. Both image folders contain 20 matched JPEGs with accurate extensions. The common manifest versions both model URLs; third person bytes remain unchanged. No gameplay balancing, tutorial, voice, music or ultimate systems were authored in this pass.
