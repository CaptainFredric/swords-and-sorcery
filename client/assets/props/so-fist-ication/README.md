Current runtime: so-fist-ication-v2_5.glb, exact upstream SHA b1ea92edc3310114c4c5ec08ce68ecb4768a2fed9ee816a25040b1d2281819d1. Rear axle Z is minus .820 native, wheelbase 1.145 at scale 2.85. Prior runtimes and source bundles are outside HTML5 in assets/source. The previous v2.2 notes below are historical.

# SO FIST v2.2 integration candidate

Runtime: `so-fist-ication-v2_2.glb`, exported from the separate editable `assets/source/so-fist-ication/SoFist-v2_2-runtime-source.blend`. Current SHA and exact bytes are in the source manifest. Scale remains 2.85. No extra baked scale is applied.

This retains Argon's authored v2.2 carriage, fist, wheels, four clips and thirteen station locators. Stretched frame/platform timber texture regions use the existing clean walnut material. The 0.68 second release and 0.88 second maximum extension share their exact linear keys with authority; the full cycle remains four seconds. Whole-model recoil tracks are excluded by the renderer so wheels and the physical carriage stay registered. Piston, chains, springs, lever and the braced operator provide the visible action.

The operator boards from the rear ground entry and rides the elevated rear station. The actual production character uses geometry based boot contact and fitted control hands. Carriage pitch, roll and interpolation attach the whole rider. Sight and third person cameras use the shared station fit. Movement, damage, durability, pressure and controls remain Castleward's existing implementation.

The prior integrated GLB is preserved as `assets/source/so-fist-ication/rollback-crafted.glb`, outside the playable package. The canonical earlier `SoFist-crafted.blend` is unchanged. Supplied upstream Blender source is separately preserved, but lacks the GLB's thirteen locators; export from the runtime matching source above. See `docs/so-fist-v22/README.md` for actual game evidence and limitations.
