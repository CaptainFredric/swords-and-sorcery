# Rodin Spellblade delivery

The creator's Hyper3D Rodin image-to-3D generation of the Spellblade, made from the canonical concept's front view
(`tools/blender/characters/spellblade/source/references/canonical-spellblade.png`). Archived untouched, with the
SHA-256 of both uploaded ZIPs and every file in them in `manifest.json`. None of these files enters the playable build.

- `rodin-spellblade-unrigged.glb`: the mesh (30,000 triangles, one watertight shell once its UV-seam splits are welded),
  2048 px base colour, normal and metallic/roughness maps. It faces glTF +Z and stands 1.90 m to the crest.
- `rodin-spellblade-autorigged.glb`: the same mesh and vertex order with Rodin's automatic 52-joint skeleton and weights.
  No animations.
- `rodin-spellblade-emissive.png`: the emissive map supplied with both (identical in each ZIP).

Rodin's shaded exports (lighting baked into an unlit texture) are recorded in the manifest but not archived.

The game character is built from these files by `tools/blender/characters/spellblade/rodin/`.
