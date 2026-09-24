# Spellblade Blender Production Pipeline

**Status:** Approved design. Implementation plan: `docs/superpowers/plans/2026-09-19-spellblade-blender-production-plan.md`.

The production design has completed its implementation-planning pass. Runtime/modeling implementation starts after explicit approval of that written plan.

## Purpose

Replace the interim runtime-constructed Spellblade with a real Blender-authored, rigged, animated character asset while preserving the existing authoritative gameplay, networking, interpolation, input, combat timings, and browser-first deployment model.

The target remains the supplied Spellblade concept sheet: a faceted low-poly armored fighter with a strong enclosed helmet and cyan visor, red crest/scarf/tabard, layered broad pauldrons, tapered steel torso, heavy gauntlets and boots, an oversized faceted sword, and a cyan sorcery hand. The finished character must read as intentionally modeled armor, not an accumulation of runtime boxes or wedges.

This project is also the first production use of a reusable headless Blender asset worker. The worker must be narrow enough to avoid becoming a generic modeling framework, but structured so a later Castleward environment build or Astra Blender bridge can execute the same repository-owned scripts.

## Evidence behind this design

A separate feasibility spike proved that GitHub Actions can run Blender 4.5 LTS headlessly on the repository, create an armature, bind meshes to bones, create an animation, save an editable `.blend`, export an animated `.glb`, render multiple views, validate the GLB, and return all outputs as workflow artifacts.

The first spike run successfully produced the `.blend` and `.glb` but failed at Eevee rendering because the Ubuntu runner lacked `libEGL.so.1`. Installing `libegl1` addressed that specific runtime dependency; the second run completed model generation, GLB validation, four renders, and artifact upload. That spike remains disposable proof, not production character code.

PR #44 already contains useful visual groundwork: concept proportions and palette, a shared sword study, extracted remote pose/state logic, first-person framing work, menu turntable behavior, and Chrome screenshot review. This specification deliberately salvages those results while replacing the procedural character-construction architecture.

## Goals

1. Produce a concept-faithful third-person Spellblade as a skinned Blender/glTF asset.
2. Produce a camera-optimized first-person Spellblade arms/weapon asset from the same design language.
3. Use a compact custom skeleton designed around this armored character rather than a general humanoid rig package.
4. Provide named animation clips for the existing gameplay states without changing gameplay timing or authority.
5. Keep movement/root position server-authoritative; character animations never provide gameplay root motion.
6. Load and clone the GLB assets safely in Three.js, including independent skeletons and mutable per-player emissive materials.
7. Retain the current procedural Spellblade as a temporary runtime fallback during migration.
8. Validate required bones, sockets, clips, materials, file size, and basic render output automatically.
9. Generate fast preview renders during modeling and higher-quality review renders before acceptance.
10. Make the asset build executable by GitHub Actions now and by a future Astra/MCP Blender bridge later without creating two separate modeling systems.

## Non-goals

This work does **not**:

- change combat damage, cooldowns, movement, hit detection, server authority, room behavior, or bot behavior;
- add classes, abilities, inventory, progression, or customization systems;
- rebuild Castleward environment art in the same change;
- add full cloth simulation or physics-driven armor;
- introduce Rigify or another large general character-rig framework;
- build a generic visual modeling DSL;
- require Draco/Meshopt compression before an uncompressed baseline proves it is necessary;
- create a texture-heavy PBR pipeline merely because Blender supports one;
- delete the procedural fallback before deployed GLB loading is proven reliable.

## Source-of-truth strategy

### Stage 1: repository-owned Blender Python is canonical

Until direct interactive Blender control is available, the canonical production source is the repository's Blender Python/model-definition code under:

```text
tools/blender/characters/spellblade/
```

The build deterministically creates:

- an editable `.blend` build artifact;
- a third-person `.glb`;
- a first-person `.glb`;
- review PNGs;
- a machine-readable validation report.

The `.blend` is generated and retained as a workflow artifact for inspection/debugging. It is **not** the canonical source during Stage 1, preventing silent divergence between a hand-edited `.blend` and the build scripts.

Reviewed runtime GLBs are promoted into the branch/repository under `client/assets/characters/spellblade/`. Promotion happens only after visual and structural review; preview generation itself does not silently modify production assets.

### Stage 2: optional Astra/MCP interactive source transition

If Astra later provides a Blender bridge that makes interactive `.blend` editing materially better, the project may deliberately switch the canonical source to an authored `.blend`. That transition must be explicit. At no point may both script geometry and a hand-edited `.blend` claim to be authoritative.

The future bridge should execute the same repository-owned validation/export/render scripts rather than inventing a parallel pipeline.

## Proposed repository layout

```text
tools/blender/
  common/
    render.py              # narrow render/export helpers only
    gltf_contract.py        # names/budgets shared by validation
  characters/
    spellblade/
      build.py              # production model/rig/animation entry point
      design.py             # Blender-side authored dimensions/material roles
      rig.py                # skeleton + sockets
      model.py              # armor/body/sword construction
      animations.py         # named action construction
      render_review.py      # review camera/action setup
      validate.py           # Blender-side scene validation

scripts/
  validate-spellblade-glb.py  # GLB binary/JSON structural validation outside Blender

client/assets/characters/spellblade/
  spellblade.glb
  spellblade-fp.glb
  manifest.json

client/game/
  SpellbladeAssets.mjs
  SpellbladeAnimator.mjs
  SpellbladeFallback.mjs      # existing procedural rig retained temporarily
```

Names may change during planning if the current module boundaries suggest a smaller arrangement; the architectural separation should remain.

## Neutral runtime manifest

Avoid duplicating the runtime contract independently in Python and JavaScript. A checked-in JSON manifest should define the public asset contract, for example:

```json
{
  "thirdPerson": "/client/assets/characters/spellblade/spellblade.glb",
  "firstPerson": "/client/assets/characters/spellblade/spellblade-fp.glb",
  "clips": ["Idle", "Run", "Air", "Guard", "Slash_1", "Slash_2", "Slash_3", "Cast", "Dash", "Stagger", "Death"],
  "sockets": ["socket_sword", "socket_sorcery"],
  "mutableMaterials": ["VisorGlow", "SorceryAccent"]
}
```

The exact schema is implementation-plan work, but required clip/socket/material names should come from one neutral contract consumed by validators and runtime tests rather than duplicated string lists.

Modeling-only dimensions may stay in Blender Python because JavaScript should not need to know pauldron bevel widths or helmet cheek-plate vertices.

## Character modeling strategy

### Shape language

The Blender model must prioritize the concept's large visual decisions before surface detail:

1. enclosed angular helmet with narrow cyan visor and visible jaw/chin structure;
2. broad layered pauldrons that establish the upper-body silhouette;
3. armored chest tapering into a narrower waist;
4. substantial gauntlets and lower legs/boots that keep the fighter grounded;
5. red scarf/tabard shapes that break up the steel mass from front and back;
6. oversized clean sword silhouette with faceted blade, recognizable guard, pommel, and accent detail;
7. left gauntlet designed to receive runtime cyan sorcery VFX.

The model should use explicit low-poly planes, bevels, wedges, inset armor surfaces, ridges, and layered plates. Polygon count is not the measure of quality; controlled silhouette and plane changes are.

### Runtime draw-call discipline

Blender may use many authoring objects for convenience, but export must not become one draw call per armor plate. Rigid armor pieces can be joined into a small number of skinned meshes while preserving 100% bone weights per rigid region.

Target third-person export:

- approximately 20k-25k triangles;
- hard review ceiling around 35k triangles unless visual evidence justifies more;
- no more than roughly 6 renderable material/mesh primitives in the normal character;
- no large textures in the first production pass;
- file size target below 2 MB for the third-person GLB before compression.

Target first-person export:

- approximately 8k-12k triangles;
- file size target below 1 MB before compression;
- only geometry that can actually enter the first-person camera volume.

These are review budgets, not reasons to damage the design for a few triangles.

## Materials

Initial production materials should remain simple and readable:

- dark under-armor;
- base steel;
- steel highlight/edge plate;
- brass/gold trim;
- crimson cloth;
- cyan visor/sorcery accent.

Use material parameters and geometry before adding large texture maps. Small baked masks or future textures remain possible if later evidence demonstrates they materially improve the character.

The cyan visor and sorcery accent are runtime-mutable. Their material instances must not be shared in a way that lets one remote player's cast/protection state change every other player's emissive intensity.

Immutable geometry and immutable base materials should be shared where Three.js permits; only materials that vary per instance should be cloned.

## Skeleton

Use a compact purpose-built armature. Proposed bone hierarchy:

```text
root
└── pelvis
    ├── spine
    │   └── chest
    │       ├── neck
    │       │   └── head
    │       ├── clavicle.L
    │       │   └── upper_arm.L
    │       │       └── forearm.L
    │       │           └── hand.L
    │       │               └── socket_sorcery
    │       └── clavicle.R
    │           └── upper_arm.R
    │               └── forearm.R
    │                   └── hand.R
    │                       └── socket_sword
    ├── thigh.L
    │   └── shin.L
    │       └── foot.L
    ├── thigh.R
    │   └── shin.R
    │       └── foot.R
    └── tabard_root
        ├── tabard_front_01
        │   └── tabard_front_02
        └── tabard_back_01
            └── tabard_back_02
```

A scarf/crest helper bone may be added only if review shows it produces meaningful secondary motion.

### Skinning policy

Armor should mostly behave rigidly:

- helmet, pauldrons, gauntlets, greaves and boot shells: 100% or near-100% weighting to appropriate bones;
- torso plates: rigid or very limited chest/spine blending;
- under-armor at shoulders/hips: smooth weights where deformation is visible;
- tabard: simple weighted bone chain, no cloth simulation;
- sword: separate geometry attached to `socket_sword` or a dedicated weapon bone, never baked into hand deformation.

This character's armor should feel constructed, not rubbery.

## Animation contract

Third-person GLB must export these clips:

- `Idle`
- `Run`
- `Air`
- `Guard`
- `Slash_1`
- `Slash_2`
- `Slash_3`
- `Cast`
- `Dash`
- `Stagger`
- `Death`

The exact clip duration must be derived from existing gameplay timing where an action is timing-sensitive. Visual clips do not redefine combat windows.

### No gameplay root motion

All clips animate around the character origin. Position/yaw continue to come from server snapshots and existing client interpolation. Dash/run animations imply movement visually but do not translate the authoritative root.

### Network synchronization

Remote animation cannot simply begin when a snapshot happens to arrive. `SpellbladeAnimator` must use existing server-time/state data so timing-sensitive clips line up with the authoritative action.

Examples:

- slash selection and clip time derive from `attackStartedAt`, `attackNextStrike`, and the existing combo timing model;
- cast pose derives from the existing cast event/window;
- dash/stagger phases derive from authoritative `dashUntil`/`staggerUntil` timing;
- death begins from the existing alive-to-dead transition;
- idle/run can loop locally after state selection because they do not define hit windows.

Small animation crossfades are allowed where they improve readability, but they must not smear timing-critical attack silhouettes past their gameplay events.

## First-person asset

Do not force the complete third-person body to serve as a first-person weapon model.

The Blender build produces a separate `spellblade-fp.glb` containing only camera-relevant arms/gauntlets/sword and a minimal armature. It shares the visual design, material roles, and sword geometry source with the third-person character but can use camera-specific proportions/framing.

First-person state clips should cover the actions actually visible from the camera. Camera/head bob and subtle view sway remain code-level motion on an outer group; arm/sword combat motion belongs to the animated asset.

The first-person sword must remain visible in neutral play without obscuring the crosshair or central opponent-reading area.

## Runtime Three.js architecture

### Loader imports

The project currently pins Three.js through an import map. `GLTFLoader` and `SkeletonUtils` must be imported from the matching pinned Three.js version/addons path; do not mix loader versions with the core module.

### SpellbladeAssets

A small cached asset store should:

- begin preloading the third-person asset during menu/application startup;
- begin or lazily load the first-person asset before entering gameplay;
- keep one loaded source scene/animation collection per asset;
- create independent skinned instances using `SkeletonUtils.clone`;
- clone only runtime-mutable materials per character instance;
- expose required named clips/sockets/materials through validated handles rather than freeform tree searches scattered across the game.

### Stable wrapper objects

Remote players and menu preview should receive a stable outer `THREE.Group`. The group can initially contain the procedural fallback. When the GLB is ready, its visual child is replaced without changing the network/interpolation object identity.

This avoids making asynchronous asset loading infect the room/snapshot architecture.

### SpellbladeAnimator

Animation-selection logic should be separated from asset loading. A per-instance controller owns an `AnimationMixer`, clip actions, current visual state, and state transition/crossfade rules.

It consumes the same resolved gameplay state/server timing already used by the extracted pose logic; it does not own gameplay rules.

### Menu

The menu uses the same third-person production GLB, normally playing `Idle`, inside the existing drag-to-turn presentation. No second menu-only character model.

### First person

`WeaponView` (or its successor) owns a stable camera-space group and upgrades its procedural visual to `spellblade-fp.glb` when loaded. Existing weapon-state timing remains authoritative until equivalent clip timing is verified.

## Runtime VFX boundary

Blender provides geometry and sockets, not gameplay particles.

- `socket_sorcery` anchors the cyan magical hand effect;
- runtime Three.js creates particles, wisps, lights, projectiles, impact effects, and state-dependent intensity;
- the model may contain a modest emissive cyan material in the visor/gauntlet, but not a baked fake particle cloud;
- Fireball and other spell behavior remain entirely code-driven.

This keeps VFX responsive to gameplay and prevents the character GLB from becoming a spell-effect container.

## Fallback and migration

The current procedural Spellblade from PR #44 remains available during migration as `SpellbladeFallback` (final module name may differ).

Fallback behavior:

- if GLB loading is pending, menu/remote/first-person views may show the procedural version;
- if GLB loading fails, log the error and continue with the fallback rather than creating invisible fighters;
- switching from fallback to GLB must preserve the outer group's world position/yaw and current gameplay state;
- browser error monitoring should treat unexpected asset-load errors as failures even though fallback keeps the game playable.

The fallback is temporary. It can be deleted in a later cleanup only after deployed verification proves normal clients reliably load and animate the production assets.

## Static serving

The current Node server serves `/client/**` assets but does not explicitly map `.glb`. Add the correct glTF binary MIME type:

```text
.glb -> model/gltf-binary
.gltf -> model/gltf+json   # only if `.gltf` is ever used
```

Production assets live beneath `/client/assets/` so no new public filesystem namespace is required.

## Blender worker

The permanent workflow is based on the successful spike but separated into a production asset job.

### Modes

**Preview mode**

- lower resolution and/or Eevee samples;
- front, back, side, 3/4 neutral views;
- selected action poses such as Guard, Slash, Cast, Dash;
- optimized for iteration turnaround.

**Review mode**

- higher-quality Eevee render settings;
- same canonical cameras and action samples;
- GLB export and full structural validation;
- uploaded `.blend`, `.glb`, manifest/report, and PNG evidence.

The workflow installs the required Linux EGL runtime before rendering and checksum-verifies the pinned Blender download.

### Backend neutrality

The canonical invocation should remain ordinary Blender CLI, conceptually:

```text
blender --background --factory-startup --python tools/blender/characters/spellblade/build.py -- --mode review
```

A future Astra/MCP bridge should call this project-owned entry point (or narrowly factored functions behind it) rather than requiring a new asset definition.

## Coordinate, unit, orientation, and transform contract

This contract is mandatory because Blender and Three.js can both use right-handed coordinates while still disagreeing at export time about which local axis should face forward.

### Runtime convention

- One game world unit is one meter.
- Character origin is at ground level, centered horizontally between the feet in the neutral stance.
- `+Y` is world up in the runtime.
- At runtime yaw `0`, gameplay forward is `(0, 0, -1)`; the exported character must therefore visually face `-Z` when its outer Three.js group has identity rotation.
- The third-person Spellblade neutral head/visor should be approximately `2.0m` above the ground, matching the existing gameplay silhouette rather than redefining collision height.
- Character and armature object transforms must be applied/normalized before export; do not use negative object scale for mirroring in the exported hierarchy.
- `root` bone and character visual origin must remain stationary in X/Z across gameplay clips. No animation clip may provide gameplay root motion.

### Validator requirements

The Blender-side/export validator should fail if:

- the production armature/root object has non-unit or negative scale;
- required bones or sockets are missing;
- the exported neutral bounds are wildly outside expected human scale;
- a gameplay clip animates root translation in X/Z;
- the front review camera sees the character's back because export orientation has inverted;
- sword or sorcery sockets resolve to missing/degenerate transforms.

Browser review remains the final authority for visually confirming facing/orientation after Three.js loading.

## Asset identity, caching, and provenance

A correct binary that the browser never refreshes is still a broken deployment.

The promoted runtime manifest must include a build/source revision derived from the reviewed asset source commit, for example:

```json
{
  "sourceRevision": "<git-sha>",
  "thirdPerson": {
    "url": "/client/assets/characters/spellblade/spellblade.glb?v=<git-sha>"
  }
}
```

Exact schema is plan-level work. The important rules are:

- promoted GLB URLs are revisioned/cache-busted;
- review artifacts record the source commit that produced them;
- generated `.blend`, `.glb`, render report and screenshots identify the same source revision;
- public/browser verification can report which revision actually loaded;
- deployment fingerprinting must not claim a new character is live merely because JavaScript source changed while an old GLB remained cached.

## Runtime lifecycle and failure semantics

Each loaded player instance owns mutable runtime resources such as its animation mixer/actions and cloned emissive materials. Removing a player or disposing a runtime must stop/uncache those actions and dispose instance-owned mutable materials without disposing cached shared geometry/materials still used by other characters.

The loader should deduplicate concurrent requests for the same source asset. A failed load should not create an unhandled rejection storm; the fallback remains active and the error is surfaced once for browser diagnostics.

If a player disappears before an asynchronous GLB instance finishes cloning/loading, that late result must be disposed/ignored rather than reattaching a ghost fighter.

## Testing and validation

### Pure/source tests

Use Node tests for:

- runtime manifest parsing and required contract names;
- revisioned asset URL construction;
- state -> clip selection/timing calculations where they can remain Three-free;
- import-map/addon-version alignment where source assertions are the practical option;
- `.glb` MIME mapping;
- fallback availability and disposal/lifecycle source contracts.

### Blender/GLB validation

The asset worker validates:

- required bones/sockets;
- required clip names;
- material names/roles;
- skins/animation presence;
- no gameplay root motion;
- normalized transforms/scale;
- bounding dimensions/orientation sanity;
- triangle/primitive count budgets;
- file-size budgets;
- non-empty review images;
- production source revision/provenance.

A small Python validator may inspect the GLB JSON chunk outside Blender as an independent export check.

### Browser integration evidence

The current Chrome capture must be extended so the report records enough data to prove production assets are active, for example:

- menu character source: `glb` vs `fallback`;
- active source revision;
- remote fighter source/clip state;
- first-person source/clip state;
- browser/HTTP errors.

The exact debug exposure should be minimally scoped (e.g. non-sensitive `userData` or a dedicated runtime status snapshot), but acceptance may **not** infer success solely from “a character was visible.” The fallback is intentionally visible during failures.

Required screenshots remain:

- menu front;
- menu rotated back/side;
- Practice/Bot Duel remote fighter at combat distance;
- first-person idle/combat view.

Add action-specific evidence where automation can drive it reliably.

## Visual acceptance

The production GLB pass is acceptable only if fresh review evidence shows:

1. Front, side and back silhouettes visibly belong to the supplied concept family.
2. Helmet reads as enclosed faceted armor with cyan visor and jaw structure, not a decorated box.
3. Pauldrons are layered and broad enough to define the upper silhouette.
4. Torso visibly tapers from chest toward waist.
5. Boots/greaves have enough mass to ground the lower silhouette.
6. Crimson cloth breaks the metal mass from front and back.
7. Sword silhouette reads clearly at menu and combat distance.
8. Sorcery hand has an intentional armored receiver/socket and runtime cyan VFX reads from it.
9. Guard/Slash/Cast/Dash poses are recognizable without relying on HUD labels.
10. First-person sword/gauntlets belong to the same character while preserving the central play area.
11. No browser errors, HTTP asset failures, obvious bind-pose flashes, or visible animation snapping under ordinary transitions.
12. Browser evidence explicitly reports the reviewed production GLB revision as active rather than fallback.

## Migration sequence

1. Establish production worker and validators from the proven spike.
2. Build neutral skeleton and concept-faithful third-person model.
3. Add named clips and review animation silhouettes.
4. Build the separate first-person asset.
5. Add correct static MIME and matching Three.js addon imports.
6. Implement asset store, skeleton cloning, material isolation and animator.
7. Upgrade MenuScene to production GLB while retaining fallback.
8. Upgrade RemotePlayers to production GLB + server-time animation selection while retaining stable outer transform and fallback.
9. Upgrade WeaponView to first-person GLB while preserving public action methods.
10. Extend Chrome report to prove GLB source/revision/animation state.
11. Produce review-quality Blender and browser evidence.
12. Promote reviewed GLBs into branch/repository with matching source revision.
13. Run full repository CI + Chrome review.
14. Merge only after user-visible character review.
15. Verify deployed public revision and live Chrome evidence.

## Explicit deferred work

After this project, separate approved work may cover:

- removal of the fallback once proven unnecessary;
- richer character shaders/textures;
- improved general spell VFX;
- Blender-built Castleward modular environment art while preserving simple gameplay collision geometry;
- an Astra/MCP bridge and deliberate Stage-2 source-of-truth transition;
- additional playable classes/skins.

None of those should expand this character-production implementation unless required to make the approved base Spellblade work correctly.