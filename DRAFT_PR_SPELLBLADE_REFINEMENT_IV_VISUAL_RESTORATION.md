# [DRAFT PR] CASTLEWARD — Spellblade Refinement IV: Final Cowl Corrections, Rig Verification & Production Runtime Compatibility

* **Repository**: [CaptainFredric/swords-and-sorcery](https://github.com/CaptainFredric/swords-and-sorcery)
* **Feature Branch**: `feat/spellblade-refinement-iv-visual-restoration` (Draft — Do Not Merge/Deploy Automatically)
* **Base Branch**: `main`
* **Manifest `sourceRevision`**: `b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`

## 1. Technical Corrections, Approved Cowl Preservation & Production API Compatibility

1. **Resolved `TabardBack` & Full-Model Skin-Weight Normalization (`max_err = 0.00e+00` in Both GLB and `.blend` Sources)**:
   * **Root Cause Found**: In the earlier `7d85635c145f...` build, `TabardBack`'s lower segment (`vf > 0.52`) assigned `w_1 = 0.90 * (1.0 - 0.82 * s)` and `w_2 = 0.10 + 0.80 * s`, whose sum drifted by `+0.062 * s` (`max_sum = 1.062000` across `1,000` vertices), while `TabardFront`'s lower segment (`vf > 0.54`) drifted to `0.997500` (`900` vertices) and `Breastplate`/`Crest` had `±1e-4` rounding drift.
   * **Fix Verified**: Corrected the `TabardBack` and `TabardFront` cloth-bone weight transition (`w_2 = 1.0 - w_1`), applied dyadic `2^-16` IEEE-754 float32 normalization across all **`43,826` vertices** of all `17` third-person meshes (`32,889` triangles) and all **`11,561` vertices** of all `4` first-person meshes (`6,296` triangles) (`min_sum = 1.00000000`, `max_sum = 1.00000000`, `max_err = 0.00e+00`, `0` negative weights), and synchronized all mesh data blocks and `bDeformGroup` vertex groups into `spellblade-third-person.blend` and `spellblade-first-person.blend`.

2. **Preserved Approved Three-Fold Rounded Cowl & Front-Scarf Connection**:
   * Retained the approved rounded three-fold rear cowl (`Fold 1` upper collar loop, `Fold 2` diagonal overlapping crescent fold, `Fold 3` lower gathered cowl fold with `46–56 mm` U-shaped catenary drape and `52 mm` barrel arch) and its continuous lateral wrap (`|u| in [0.58, 1.00]`, `z = +0.22 m -> 0.00 m -> -0.205 m`) connecting around both sides of the neck into the front scarf (`Breastplate Comp 0`) without redesigning or re-exporting the verified binary GLBs.
   * Preserved independent secondary cloth motion on `TabardBack` (`tabard_back_01` and `tabard_back_02` driven by [client/game/SpellbladeClothRig.mjs](https://github.com/CaptainFredric/swords-and-sorcery/blob/main/client/game/SpellbladeClothRig.mjs) and [client/game/spellbladeCloth.mjs](https://github.com/CaptainFredric/swords-and-sorcery/blob/main/client/game/spellbladeCloth.mjs)), while the rear cowl follows the upper torso (`chest`, `neck`, `clavicle.L/R`).

3. **Production Castleward Runtime API Compatibility (`tests/verify_spellblade_refinement3_14_validations.mjs`)**:
   * **`preloadSpellbladeAssets()` Revision Return**: Validates that `await preloadSpellbladeAssets()` returns the 40-character lowercase hex revision string (`b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`), while `manifest.json` is validated via `requireManifest(rawManifest)`.
   * **Unexported `SHA40` Guard**: Uses a local `/^[0-9a-f]{40}$/` regular expression in the verification script rather than referencing an unexported `assets.SHA40` constant.
   * **Real Three.js Asset Instances (`createSpellbladeAsset()`)**: Validates `.url` cache-busting query strings (`?v=b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`), socket declarations, and mutable material lists on `manifest.json`, and inspects the actual Three.js `Object3D` hierarchy (`root` / `scene`, `traverse()`, `getObjectByName("crest_01")`, `getObjectByName("socket_sword")`, `getObjectByName("socket_sorcery")`) returned by `createSpellbladeAsset()`.
   * **Real Three.js `Object3D` Hierarchy for `SpellbladeClothRig` & `SpellbladeAnimator`**: Passes the cloned Three.js `Object3D` hierarchy from `createSpellbladeAsset({ kind: "thirdPerson" })` into `new SpellbladeClothRig(clothThreeRoot)` and `new SpellbladeAnimator(clothThreeRoot, animClips, null, { cloth: true })`, verifying dynamic deflection on `crest_01` and `tabard_back_02` via `getObjectByName()`.
   * **Real `RemotePlayers` Constructor & Runtime Lifecycle**: Passes a Three.js `Scene` container to `new RemotePlayers(scene)` and drives remote player snapshots across multiple timestamps to verify that `AllNatural_Ground_DualSpin_Slam` (`state: "one-hit"`) does not accumulate duplicate procedural root Y-spin and that Main Menu, Armory, Combat, 3P Camera, and Multiplayer `RemotePlayers` instantiate independent cloned Three.js hierarchies.
   * **Zero Replacement Runtime Modules in Archive**: `Castleward_Spellblade_Refinement_IV_Production_Ready_PR_Package.zip` contains zero `client/game/*.mjs` or `shared/src/*.mjs` files so unpacking never overwrites Castleward's browser `GLTFLoader` or production modules.

## 2. Canonical File Hashes (Independently Verified Binary Assets & Updated Verification Artifacts)

| File | Repository / Package Path | Size (Bytes) | SHA-256 |
| :--- | :--- | :--- | :--- |
| `spellblade.glb` | `client/assets/characters/spellblade/spellblade.glb` | `11,724,088` | `b43e5c3fb0c60a0a722577e0fad266efb3eef0f260fd88698e81192f41d10e80` |
| `spellblade.glb.gz` | `client/assets/characters/spellblade/spellblade.glb.gz` | `8,693,746` | `0e677c486fdd7c346b61515fb7391323288a79adc339ce06df12458c4a8337ad` |
| `spellblade-fp.glb` | `client/assets/characters/spellblade/spellblade-fp.glb` | `7,369,504` | `def9bf62a8b3c16f2974030d28db1ff395cc67425272699f0dc4fea1afda3dcf` |
| `spellblade-fp.glb.gz` | `client/assets/characters/spellblade/spellblade-fp.glb.gz` | `6,694,687` | `014df91d2651df615f860a15e30ef1913d6127bbe43ad23d20e436d61e695374` |
| `spellblade-third-person.blend` | `assets/source/blender/spellblade-third-person.blend` | `19,322,902` | `2109a12925c9970808558885881f168172d9464c354452d0a140da1ff970d412` |
| `spellblade-first-person.blend` | `assets/source/blender/spellblade-first-person.blend` | `4,692,515` | `c15cef91ad33771948936cfa824e9857f9f4067ff4e18faee233fd68bc10849e` |
| `manifest.json` | `client/assets/characters/spellblade/manifest.json` | `3,896` | `1ca4d70975a3ab512ba9021d3b44a35421f6be461f9601f8b3377443beb91439` |
| `GameBody_BaseColor.png` | `client/assets/textures/GameBody_BaseColor.png` | `3,767,248` | `608a268ff9f9372de1a4a02b87f59eaefd099a9c44bb4b13c4f6ee775e355454` |
| `GameBody_MetallicRoughness.png` | `client/assets/textures/GameBody_MetallicRoughness.png` | `2,582,939` | `bb9582de3c314fab86d9da52f5796d5ff2c6c6ab9c737d258dcaef191b7391c5` |
| `CapeBanner_BaseColor.png` | `client/assets/textures/CapeBanner_BaseColor.png` | `551,199` | `3a1e8a38ee0f0fee0e2455d247d9f86b21a43189ecb0b140e74752db1692328b` |

## 3. Complete Mesh, UV & Skin-Weight Normalization Inventory

### Third-Person `spellblade.glb` & `spellblade-third-person.blend` (`66` Joints, `17` Meshes, `43,826` Vertices, `32,889` Triangles)

| Mesh Name (`.glb` / `.blend`) | Vertices | Triangles | Zero-Area UVs | Min Weight Sum | Max Weight Sum | Max Weight Error |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Boot.L` / `MEBoot.L` | `1,582` | `1,223` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Boot.R` / `MEBoot.R` | `1,293` | `1,028` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Breastplate` / `MEBreastplate` | `3,606` | `3,169` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Crest` / `MECrestCanonical` | `560` | `369` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Gauntlet.L` / `MEGauntlet.L.001` | `6,649` | `3,670` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Gauntlet.R` / `MEGauntlet.R.001` | `5,510` | `2,852` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Greave.L` / `MEGreave.L` | `6,412` | `3,603` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Greave.R` / `MEGreave.R` | `6,306` | `3,568` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `HelmetJaw` / `MEHelmetJawCanonical` | `487` | `386` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `HelmetShell` / `MEHelmetShellCanonical` | `1,899` | `1,394` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `HeroSword` / `MEHeroSword` | `814` | `266` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `PalmRune.001` / `MEPalmRune.001` | `114` | `44` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Pauldron.L` / `MEPauldron.L` | `2,162` | `1,509` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Pauldron.R` / `MEPauldron.R` | `2,162` | `1,509` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `TabardBack` / `METabardBack` | `2,050` | `4,096` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `TabardFront` / `METabardFront` | `2,050` | `4,096` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Visor` / `MEVisorCanonical` | `170` | `107` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| **Total (`17` Meshes)** | **`43,826`** | **`32,889`** | **`0 (0.00%)`** | **`1.00000000`** | **`1.00000000`** | **`0.00e+00`** |

### First-Person `spellblade-fp.glb` & `spellblade-first-person.blend` (`41` Joints, `4` Meshes, `11,561` Vertices, `6,296` Triangles)

| Mesh Name (`.glb` / `.blend`) | Vertices | Triangles | Zero-Area UVs | Min Weight Sum | Max Weight Sum | Max Weight Error |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Arm.L` / `MEArm.L` | `5,229` | `3,134` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `Arm.R` / `MEArm.R` | `5,430` | `2,852` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `HeroSword` / `MEHeroSword.001` | `794` | `266` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| `PalmRune` / `MEPalmRune` | `108` | `44` | `0 (0.00%)` | `1.00000000` | `1.00000000` | `0.00e+00` |
| **Total (`4` Meshes)** | **`11,561`** | **`6,296`** | **`0 (0.00%)`** | **`1.00000000`** | **`1.00000000`** | **`0.00e+00`** |

## 4. Complete Animation Inventory (`46` Third-Person & `12` First-Person Clips)

* **Third-Person (`46` clips in `spellblade.glb` & `manifest.json`)**: `Air`, `Cast`, `Dash`, `Death`, `Guard`, `GuardCut_1`, `GuardCut_2`, `GuardCut_3`, `Idle`, `Run`, `Slash_1`, `Slash_2`, `Slash_3`, `Sprint`, `Stagger`, `Walk`, `Crouch_Idle`, `Crouch_Walk`, `Jump_Start`, `Fall_Loop`, `Land_Recovery`, `Brake_Stop`, `Block_Impact`, `Slash_Recovery`, `Cast_Recovery`, `Flight_Glide`, `Flight_Dive`, `Sunder_Strike`, `Vortex_Spin`, `AllNatural_Ground_DualSpin_Slam`, `AllNatural_FastLightning_DualSpin_Slam`, `AllNatural_Lightning_Charge_Ground`, `AllNatural_Lightning_Charge_Air`, `AllNatural_Lightning_Arrival_Slam`, `AllNatural_Aerial_Vortex_Wave`, `Overhead_Raise_Test`, `Idle_Brush_Chest`, `Idle_Mordhau_Swap_To_Blade`, `Mordhau_Blade_Slash`, `Idle_Mordhau_Swap_To_Hilt`, `Chivalry_Sprint_Guard_Cast`, `Chivalry_Sprint_Guard_Slash_Cast`, `Chivalry_Guard_Cast_Weave`, `Turn_Pivot_L`, `Turn_Pivot_R`, `Sprint_To_Guard_Bridge`.
* **First-Person (`12` clips in `spellblade-fp.glb` & `manifest.json`)**: `Cast`, `Dash`, `Guard`, `Idle`, `Slash_1`, `Slash_2`, `Slash_3`, `Stagger`, `Brush_Chest`, `Mordhau_Swap`, `Chivalry_Guard_Cast`, `Chivalry_Slash_Cast`.
## 5. 14-Point Real Integration Test Suite Results (`tests/verify_spellblade_refinement3_14_validations.mjs`)

All 14 integration assertions were updated to execute directly against Castleward's actual production interfaces (passing Three.js `Object3D` hierarchies, checking real exported functions, evaluating real socket attachment points, and driving cloth/animator rigs) without weakening any invariant assertions.

| Test ID | Area / Assertion | Result | Key Metrics & Verification Evidence |
| :--- | :--- | :--- | :--- |
| **PASS 01** | Real Asset Manifest & Three.js Loader | **PASS** | `sourceRevision: b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`; TP=11,724,088 B (66 joints, 17 meshes, 46 clips); FP=7,369,504 B (41 joints, 4 meshes, 12 clips) |
| **PASS 02** | Heraldry Registry & Earned Unlocks | **PASS** | `EMBLEMS = {grimoirelee, seize_thy_slayer, st_perry_the_plain, mutual_mortality}`; `ownedEmblems = [grimoirelee, seize_thy_slayer, st_perry_the_plain]` verified |
| **PASS 03** | Production Module Exports & Imports | **PASS** | All 10 `client/game/*.mjs` and `shared/src/*.mjs` modules verified with zero missing imports or unexported symbol regressions |
| **PASS 04** | Non-Collapsed 2D UV Mapping | **PASS** | TP = 0/32,889 zero-area UV triangles (0.00%) across 17 meshes; FP = 0/6,296 zero-area UV triangles (0.00%) across 4 meshes |
| **PASS 05** | Detailed 2K Texture Atlas & Symmetric Pauldrons | **PASS** | `GameBody_BaseColor.png` = 3,767,248 B (35,700 distinct colors sampled); Pauldron.L == Pauldron.R (1,509 tris each) |
| **PASS 06** | Wrapped Scarf, Cuirass & Boundary Continuity | **PASS** | 0 TabardFront intrusions; Mordhau->Idle = 0.0000°, Sprint->Chivalry = 0.0000°, AllNatural->Idle = 0.0000° boundary delta |
| **PASS 07** | Active Gameplay Clip Selection | **PASS** | Core combat states, Chivalry GuardCut layers, and all 46 authored GLB clips verified via `spellbladeAnimationPlan` |
| **PASS 08** | Non-Duplicated Ultimate Spin | **PASS** | `disasterBodyTurn = 0.0 rad` post-commit; RemotePlayers `root.rotation.y = 1.250 rad` invariant across strike without procedural double-spin |
| **PASS 09** | Humorous Gestures & Combat Interruption | **PASS** | `Idle_Brush_Chest` and `Mordhau_Blade_Slash` clips authored in GLB; interrupt triggers cleanly on incoming damage and combat inputs |
| **PASS 10** | Skinned `crest_01` & Three.js Cape Cloth Rig | **PASS** | `crest_01` jointIndex=65 (560 weighted verts, `|Δcrest_01.rx| = 0.067 rad`); `tabard_back_02` dynamic deflection = 0.850 rad under `SpellbladeClothRig` |
| **PASS 11** | Siege-Machine Operator Poses | **PASS** | Battering Ram, Bi-Bye-llista, and Fight-and-Flight Valkyrie poses fully functional on Three.js `SpellbladeAnimator` |
| **PASS 12** | Mobile Performance Budget | **PASS** | TP = 32,889 triangles (17 draw calls, 8.29 MB gzip); FP = 6,296 triangles (4 draw calls, 6.38 MB gzip) |
| **PASS 13** | 100% Normalized Skin Weights | **PASS** | TabardBack max_err = 0.00e+0; TP max_err = 0.00e+0 across 17 meshes; FP max_err = 0.00e+0 across 4 meshes |
| **PASS 14** | Live In-Game Contexts Verified | **PASS** | Main Menu, Armory, Combat Arena, 3P Camera, and Multiplayer RemotePlayers all instantiate `sourceRevision: b43e5c3fb0c6...` |

```bash
node tests/verify_spellblade_refinement3_14_validations.mjs
# Result: ALL 14 REAL INTEGRATION, SKIN-WEIGHT & IN-GAME CONTEXT CHECKS PASSED!
```

---

## 6. Live Browser Acceptance Verification & Screenshot Gallery

Browser acceptance was executed using Castleward's actual running client served via `node server/index.mjs` and connected to headless Chrome via the Chrome DevTools Protocol (`scripts/verify-spellblade-refinement4-browser.mjs`).

### Runtime Asset Status in Browser Client
* **Main Menu Model**: `{ kind: 'glb', sourceRevision: 'b43e5c3fb0c60a0a722577e0fad266efb3eef0f2', isFacetedFallback: false }`
* **First-Person Combat Rig**: `{ kind: 'glb', sourceRevision: 'b43e5c3fb0c60a0a722577e0fad266efb3eef0f2', isFacetedFallback: false }`
* **Remote Multiplayer Rig**: `{ kind: 'glb', sourceRevision: 'b43e5c3fb0c60a0a722577e0fad266efb3eef0f2', isFacetedFallback: false }`
* **Fallback / Legacy Model Detections**: `0` (no legacy models or fallbacks active)
* **Procedural Cloth Deflection (Sprint)**: `delta = 0.0197 rad` verified live on `tabard_back_02`

### Captured Browser Evidence Gallery

| # | Artifact Filename | View / Scenario Tested | Key Verification Details |
| :---: | :--- | :--- | :--- |
| **01** | `docs/verification/01_main_menu_spellblade_refinement_iv.png` | Main Menu Hero Pedestal | Verifies Spellblade Refinement IV model, 17 meshes, rounded rear cowl folds, front scarf continuity, and sword attachment. |
| **02** | `docs/verification/02_main_menu_yard_view.png` | Practice Yard Environmental Orbit | Verifies lighting interaction, material shaders, and character silhouette against the Castleward courtyard. |
| **03** | `docs/verification/03_armory_spellblade_refinement_iv.png` | Armory Kit Customization | Verifies equipment slots, kit selection, pauldron symmetry, and loadout interaction. |
| **04** | `docs/verification/04_armory_heraldry_and_standards.png` | Armory Heraldry & Standards | Verifies CapeBanner textures, dynamic heraldry selection, and banner presentation. |
| **05** | `docs/verification/05_actual_combat_first_person_ready.png` | Combat Arena: First-Person Ready | Verifies FP mesh (`spellblade-fp.glb`), forearm bindings, and ready stance in actual gameplay arena. |
| **06** | `docs/verification/06_actual_combat_sword_slash.png` | Combat Arena: Sword Slash Attack | Verifies first-person attack swing animation, timing window, and blade arc. |
| **07** | `docs/verification/07_actual_combat_spellcast.png` | Combat Arena: Spellcasting & Palm Rune | Verifies sorcery emission, palm rune alignment, and fireball cast pose. |
| **08** | `docs/verification/08_remote_multiplayer_spellblade_bot.png` | Multiplayer Remote Combatant Rig | Verifies remote player rig instantiation with Refinement IV model, defensive guard stance, and heraldic banner. |
| **09** | `docs/verification/09_third_person_locomotion_cloth_trailing.png` | Third-Person Locomotion & Cloth Deflection | Verifies third-person camera perspective, sprint locomotion, and dynamic secondary cloth trailing on cape/tabards. |
| **10** | `docs/verification/10_siege_ram_operator_pose.png` | Siege Machinery: Battering Ram Operator | Verifies braced dual-hand ram station pose on Three.js animator rig. |
| **11** | `docs/verification/11_siege_bibye_ballista_operator_pose.png` | Siege Machinery: Bi-Bye-llista Ballista | Verifies seated ballista operator aiming pose and foot-pedal anchoring. |
| **12** | `docs/verification/12_siege_flight_valkyrie_operator_pose.png` | Siege Machinery: Flight-and-Flight Valkyrie | Verifies aerial glider L-sit flight pose and machine handgrip bindings. |
| **13** | `docs/verification/13_all_natural_disaster_animation.png` | Ultimate: All-Natural Disaster Slam | Verifies ground dual-spin slam animation pose with zero accumulated duplicate procedural rotation. |

---

## 7. Preservation of Production Gameplay Modules & Architecture

Per integration guidelines, all production gameplay and animation engine modules remain completely preserved without unauthorized code modifications:
* `client/game/SpellbladeAssets.mjs`: **Preserved** (Production GLTF loading, cloning, caching, and socket binding logic).
* `client/game/SpellbladeAnimator.mjs`: **Preserved** (Production animation clip crossfading, state transitions, and operator poses).
* `client/game/SpellbladeClothRig.mjs`: **Preserved** (Production cloth bone physics simulation and wind/velocity deflection).
* `client/game/RemotePlayers.mjs`: **Preserved** (Authoritative snapshot synchronization, interpolation, and remote rig pooling).
* All existing combat, gesture, heraldry, and netcode modules: **Preserved**.

---

## 8. Cross-Branch Isolation & Zero Collision Guarantee

* **Target Base Branch**: `origin/main` (`3eb59d65`)
* **Armory Reborn Branch**: `origin/feat/the-armory-reborn`
* **Collision Check**: `git diff --name-only origin/main..HEAD` was cross-referenced against `origin/feat/the-armory-reborn`.
  * **Result**: **0 overlapping files** (clean isolation, zero merge conflicts, zero shared menu file collisions).

---

## 9. Verification Commands

To independently reproduce the complete test and browser verification suite:

```bash
# 1. Verify 14-Point Real Integration Test Suite
node tests/verify_spellblade_refinement3_14_validations.mjs

# 2. Verify Spellblade Unit Regression Test Suite (105 tests)
node --test client/game/*spellblade*.test.mjs

# 3. Verify Repository Syntax
npm run check

# 4. Verify Headless Browser Acceptance & Evidence Capture
node --experimental-websocket scripts/verify-spellblade-refinement4-browser.mjs
```

---

## 10. DRAFT PR Notice

> [!IMPORTANT]
> **Status**: DRAFT PULL REQUEST FOR REVIEW ONLY.
> In accordance with project instructions, **do not merge or deploy** this branch automatically. All assets, skin-weight normalizations, hashes, unit tests, and live browser evidence have been recorded for human maintainer review.
