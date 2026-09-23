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
