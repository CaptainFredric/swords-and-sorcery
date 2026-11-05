# SO-FIST-ICATION elevating assets — integration gate

The source-to-runtime integration code is in PR #366, but do not mark art integration complete until these **actual GLBs** exist on the branch:

- `client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb` (6,502,480 bytes, SHA-256 `bab81d9861a80e8339bd7bb479e5f41770c6acdbec22d36eb94e262d986b0efd`)
- `client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb` (214,728 bytes, SHA-256 `5e7802eacdb8ff252a0f575a3ba002287a51e73fccbd6e2a22f89a1c957597e4`)
- `assets/source/so-fist-ication/SoFist-elevating-ram-source.blend` (SHA-256 `f8481439b5429ed0aa00c0b53c8dbc869a7c0781e7e92160f7bd221aab5c2d9e`)

The main GLB was inspected: 45 nodes, 23 meshes, 40,232 triangles, ten v2.7 animation clips, four lift barrels, lower and raised stages, independent pitch joint, piston and fist sockets.

**Source discrepancy**: Argon's markdown claims an eight-node detached-fist GLB with 6,296 triangles and a -0.145 m ground contact anchor. The delivered binary actually has **six nodes, 2,996 triangles, COM locator [0, .015, .215], ground-contact locator [0, -.199469, .205]**. The renderer and projectile code follow measured mesh bounds, not the erroneous documentation.

Installation: extract the user-provided SO_FIST_ICATION_PR366_Ready_to_Stage.zip at the *repository root* while checked out to `fix/so-fist-fist-projectile-physics-20261104`, keeping folder paths. Do not delete the existing `so-fist-ication-v2_7.glb` rollback.

**Do not merge/deploy** until the actual binaries are committed and in-game browser/physics validation is green. Without them, the renderer intentionally loads v2.7 as a visual fallback.
