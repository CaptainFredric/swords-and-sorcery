# Argon delivery and rollback

This directory preserves Argon's actual v2.9, v3.0 and v3.1 character GLBs, editable Blender sources, the reproducible source archive, original 49 clip flight export and the two previous runtime assets. None of these files enters the playable HTML5 archive.

The human handoff requested v3.0 and explicitly allowed the newer Argon tab delivery where useful. That tab delivered v3.1 plus a simulation aligned flight asset with 54 clips. Both runtime GLBs were installed byte for byte. `manifest.json` records the actual hashes, including the script archive hash where the provider report disagreed with the downloaded bytes. Provider scripts are preserved and have not been executed. The source archive contains the provider's build inputs and export scripts; verify them before running.

The v3.1 character is a separate review candidate. The game continues loading its approved production third person and first person models. Only small, rest basis retargeted posture rotation data is extracted for the existing production rider by `python3 tools/assets/extract-flight-rider.py`, run from the repository root. This uses the Python standard library, reads the exact v3.1 GLB and writes `client/game/flightRiderPosture.mjs`; it does not install a character or execute the provider's scripts.

Runtime flight uses `fight-and-flight-v30-sim19p5-dash.glb`; the previous `fight-and-flight-v2.7.glb` is preserved here with the `rollback` prefix. Runtime ram uses `so-fist-ication-v2_7.glb`; its previous v2.5 is preserved here. Restore the matching renderer and animation code from the base commit together with either rollback asset. Earlier v2.6 flight remains in its original directory as well.

See `docs/argon-assets/README.md` for channel ownership, evidence and character review limitations. No new generation or paid service was used.
