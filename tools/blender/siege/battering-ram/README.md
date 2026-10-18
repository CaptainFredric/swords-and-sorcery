# Castleward Battering Ram v2 Rebuild

## Portable Rebuild Entry Point
`python3 tools/blender/siege/battering-ram/source/export_v2_all.py --input-dir tools/blender/siege/battering-ram/source/input_assets --output-dir ./rebuilt_glbs`

## Requirements
- `numpy>=1.24.0`
- `Pillow>=9.5.0`
- `opencv-python-headless>=4.7.0`

## Input Asset Checksums
- `base_basic_pbr.glb` (SHA-256: `368d16cdf1abd8c40768f9d60df6e409bd94a3f154c19bf5548b2ef2f2400863`)
- `base_basic_shaded.glb` (SHA-256: `62b2332d3c9247b8c04714bdca6776c749e131fffa03fd7b4ef1dc6e6761b12b`)
- `texture_emissive.png` (SHA-256: `2f5fff89f126ec16e29c17787e8553ee339fb7c504556dc0932eb8f7ca1461eb`)

## Output GLB Checksums
- `BattleRam_Spellblade_GameReady_PBR.glb` (6,141,788 bytes, SHA-256: `64cdc7b09e88e31f4b4ff7cb65631fd036e12ba71c0c3f9466cc52b8416419c6`)
- `BattleRam_Spellblade_Improved_PBR.glb` (14,811,472 bytes, SHA-256: `16d097e46dd157ab3551cd01a831179625891d680f1154623708243f7ad2e7ec`)
- `BattleRam_Spellblade_Improved_Shaded.glb` (8,758,056 bytes, SHA-256: `77693757680335c518dac864445d122458558763f4aa86d6489da74154f4f0e1`)

## Bastion Breach Integration Contract
- World scale: `2.65x`
- Stroke length: `0.550 m` local / `1.4575 m` world
- Hierarchy / Rig: 20 nodes, 17 meshes, 4 animation clips
- Packaging: static single-LOD packaging
- Performance: `0.0180 ms` measured Chromium V8 AnimationMixer CPU vs `~0.89 ms` desktop / `~2.93 ms` mobile analytic isolated GPU
