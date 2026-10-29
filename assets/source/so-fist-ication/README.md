# Editable ram sources and rollback

`SoFist-crafted.blend` remains the previous canonical source, unchanged.

`SoFist-crafted-v2_2.blend` preserves Argon's supplied v2.2 Blender file byte for byte. Direct inspection found it exports only twenty nodes, lacking the thirteen rider locators present in the delivered GLB. It also produces an unwelded larger export. It remains an upstream reference.

`SoFist-v2_2-runtime-source.blend` is the separate editable integration source reconstructed in Blender from the verified delivered GLB, with the stretched frame/platform timber region corrected. It retains the actual thirty three nodes, seventeen meshes and four authored animation clips. Packed images, original dimensions, original wheel pivots and fractional animation key times are preserved.

In Blender's Python console, set `RAM_REPO` to the repository path and execute `tools/assets/export-so-fist.py`. It exports the runtime matching source into the versioned runtime GLB. Optional `RAM_SOURCE` and `RAM_OUTPUT` select another source or a safe comparison destination. Force sampling is disabled deliberately: the author uses fractional frame times for the 0.68 second release and 0.88 second peak. Sampling them at 24 Hz moves the visible collision surface off its shared stroke curve.

`rollback-crafted.glb` preserves the prior integrated 5,356,608 byte GLB with SHA256 `903b8cc349e7831d7a6a21e9a6ed7e9f1acca45d9745b1f79504bad3d30c7472`. It stays outside the HTML5 archive. The still earlier original binary remains at commit `6249095`, SHA256 `64cdc7b09e88e31f4b4ff7cb65631fd036e12ba71c0c3f9466cc52b8416419c6`.

The manifest records provenance, source hashes, scale and exact export identity. The integration uses the real repository simulation and renderer; Argon's proxy simulator and replacement runtime modules were rejected.
