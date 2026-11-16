# Spellblade audit tools

Measurement tools from the 8916d5bd quality pass (`docs/verification/spellblade-quality-8916d5bd/`). Each reads a GLB
directly, or real Blender in the case of the `.py` files, and changes nothing.

| Tool | What it measures |
|---|---|
| `skin-identity.mjs a.glb b.glb` | Byte identity of two models' geometry, skin weights, joints, inverse binds and rest skeleton |
| `gauntlet-anatomy.mjs model.glb [R\|L]` | A gauntlet's connected pieces, where each lies along the forearm, and how each is weighted |
| `plate-folds.mjs model.glb [lo hi]` | Clips that fold or stretch the sword arm's gauntlet plates outside [lo, hi] |
| `wrist-anatomy.mjs model.glb [clips] [R\|L]` | The sword hand against the forearm: twist about the forearm's own axis and the remaining bend, per frame (`REF_CLIP=Idle` for the grip) |
| `arm-resolve-probe.mjs model.glb` | How far the wrist could be straightened by moving the elbow alone, with the hand and sword kept |
| `slam-lowpoints.mjs model.glb` | Each slam's blade low point above the soles, its time and its reach |
| `slam-terrain.mjs` | Castleward's ground under a slam's tip against the ground under the feet, from every standable point |
| `gauntlet-integrity.mjs model.glb [--all]` | Both gauntlets, every frame of the played clips (sidecar techniques composed) and the crossfades: plate stretch and fold, how far neighbouring pieces part, plates inside the blade |
| `gauntlet-exposure.mjs reference.glb model.glb …` | How often, pose for pose against a reference, a gauntlet stretches, folds or parts (what a player keeps seeing, not the worst frame) |
| `arm-regions.mjs model.glb …` | The sword arm by region (shoulder, elbow, cuff and band, hand plates, vambrace): how often each stretches or folds |
| `played-clips.mjs` | Which clips the client names (played) and which it never does (archive) |
| `wrist-pivot-experiment.mjs` | Where the sword hand should pivot: with the sword held exactly, the wrist bend left with the elbow moved, or with the pivot at the anatomical wrist, and whether the arm can reach |
| `grip-axis.mjs model.glb` | How much of the hand's turn into each grip is about the sword's grip axis |
| `blend_bind_and_export.py` | Exports every Action of a `.blend` with Blender's own glTF exporter through the NLA (one track per Action), which also catches legacy, unslotted Actions |
| `source-equivalence.mjs delivered.glb export.glb` | Whether a native export reproduces a delivered GLB: one rigid fit at bind, then every joint in every frame of every clip (byte identity not required) |
| `render_blend_pose.py` | Renders a `.blend`'s own armature as Blender evaluates one Action |
| `blend_bone_audit.py` | A `.blend`'s armature bones, the bones its Actions animate (empty Actions included), and its weighted vertex groups |
| `blend_inspect_export.py` | Opens a `.blend` in real Blender (scripts disabled), reports its rig, meshes, weights and Actions, and exports it with Blender's own glTF exporter |
| `render_gauntlet_parts.py` | Renders a gauntlet in Blender with each piece coloured, at bind and at a clip frame |

The repository-level tools these work with:

- `scripts/spellblade-arm-strain.mjs` (arm surface strain per clip; `--meshes Arm.R` for first person);
- `scripts/spellblade-footwork.mjs`;
- `scripts/spellblade-reweight-gauntlet.mjs` (the weight correction);
- `scripts/spellblade-pose-gallery-browser.mjs` (tick-stepped stills in real Castleward);
- `scripts/swordsmanship-capture-browser.mjs --glb` (recordings).
