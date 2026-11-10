# SO-FIST-ICATION elevating assets — integration gate

The original three binaries from `Castleward_SO_FIST_ICATION_Exact_Asset_Stage.zip` are staged at the paths below. The existing `server/tests/so-fist-asset-contract.test.mjs` verifies their exact bytes and hierarchy.

- `client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb` (6,502,480 bytes, SHA-256 `bab81d9861a80e8339bd7bb479e5f41770c6acdbec22d36eb94e262d986b0efd`)
- `client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb` (214,728 bytes, SHA-256 `5e7802eacdb8ff252a0f575a3ba002287a51e73fccbd6e2a22f89a1c957597e4`)
- `assets/source/so-fist-ication/SoFist-elevating-ram-source.blend` (4,006,788 bytes, SHA-256 `f8481439b5429ed0aa00c0b53c8dbc869a7c0781e7e92160f7bd221aab5c2d9e`)

The main GLB was inspected: 45 nodes, 23 meshes, 40,232 triangles, ten v2.7 animation clips, four lift barrels, lower and raised stages, independent pitch joint, piston and fist sockets.

**Source discrepancy**: Argon's markdown claims an eight-node detached-fist GLB with 6,296 triangles and a -0.145 m ground contact anchor. The delivered binary actually has **six nodes, 2,996 triangles, COM locator [0, .015, .215], ground-contact locator [0, -.199469, .205]**. The renderer and projectile code follow measured mesh bounds, not the erroneous documentation.

## Runtime findings

The rollback used a fitted lift and pitch transform on `Ram_Assembly`. Its stator remained on `BattleRam_Root`, and its model had no extending supports. At full lift and pitch the two collars were over three metres apart perpendicular to the piston axis. The recovered rig gives the stator and piston a common `Upper_Elevation_Pivot`. The stator remains at the tube mouth, and the wrist collar travels with the stroke. Both remain visible at full extension. The standalone fist carries neither collar.

The recovered GLB uses four fixed lift barrels, an intermediate stage and a raised saddle. Two pitch cylinders telescope between the saddle and the pitched frame. The renderer uses the authored joints and the server lift and pitch. The existing v2.7 file remains available as the rollback visual if the primary file fails to load.

The bare piston impact face now meets `piston_exposed_striker_tip`. The shared shaft box follows the authored shaft bounds, and its stroke still uses the original timing. Gameplay damage, cooldowns, health and movement tuning remain unchanged.

Lift and pitch are interpolated on the same clock as the carriage. The authored rider sight moves toward the shoulder as the trunnion rises, with the low position retaining the centered sight. A ray through the center reticle cleared the raised carriage in desktop and emulated landscape touch captures.

The browser pose matrix samples 96 combinations of lift, pitch, stroke, fist state and occupancy using the recovered meshes. The smallest measured overlap was 0.288 m from the fixed lift barrels into the intermediate stage, 0.328 m from that stage into the saddle, and 0.300 m along the pitch cylinders. In a separate live Castleward run, the gatepost stopped the piston at the server's 0.588 m stroke limit.

Two independent Chrome sessions on a shared Practice room confirmed mounting, lift and pitch replication, standalone fist flight and landing, a bare piston strike, and reattachment at the same 481 HP with the existing 24-second cooldown. A subsequent piston hit dealt 110 HP to the Bi-Bye-llista hull. Fist and chassis destruction replicated and the operator was ejected. The harness parks the vehicles for repeatable contacts and stages damage through the existing server function. Drivers still use gameplay input for the operating sequence.

To reverify or stage the handoff, run `python3 scripts/release/stage-sofist-assets.py /path/to/Castleward_SO_FIST_ICATION_Exact_Asset_Stage.zip`. For Chrome evidence, run `node scripts/so-fist-authored-recovery-browser.mjs` with Playwright and its FFmpeg video binary installed. The script writes rendered views, gameplay state and the pose matrix to `output/playwright/so-fist-asset-recovery`. The work remains a draft for review.
