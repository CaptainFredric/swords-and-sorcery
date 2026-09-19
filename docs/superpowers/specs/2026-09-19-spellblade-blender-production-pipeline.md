# Spellblade Blender Production Pipeline

**Status:** Design approved in chat; written specification for review before implementation planning.

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
8. Validate required bones, sockets, clips, materials, scale/orientation, file size, and basic render output automatically.
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
- a machine-readable validation/provenance report.

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
  "revision": "<source-commit-or-content-id>",
  "thirdPerson": "/client/assets/characters/spellblade/spellblade.glb",
  "firstPerson": "/client/assets/characters/spellblade/spellblade-fp.glb",
  "clips": ["Idle", "Run", "Air", "Guard", "Slash_1", "Slash_2", "Slash_3", "Cast", "Dash", "Stagger", "Death"],
  "sockets": ["socket_sword", "socket_sorcery"],
  "mutableMaterials": ["VisorGlow", "SorceryAccent"]
}
```

The exact schema is implementation-plan work, but required clip/socket/material names should come from one neutral contract consumed by validators and runtime tests rather than duplicated string lists.

The revision/provenance identifier must let the runtime and public verifier distinguish a freshly promoted asset from a browser-cached older GLB. A simple fixed URL may be retained if the loader appends the manifest revision as a cache-busting query parameter; content-hashed filenames are also acceptable if they remain manageable.

Modeling-only dimensions may stay in Blender Python because JavaScript should not need to know pauldron bevel widths or helmet cheek-plate vertices.

## Coordinate, scale, and origin contract

The game already defines yaw-zero forward as world `-Z`. The production asset must make that explicit instead of relying on an accidental Blender/export orientation.

Runtime contract after glTF import into Three.js:

- `+Y` is up;
- yaw `0` faces `-Z`;
- `+X` is the character's right;
- the GLB root origin is centered on the ground between the feet;
- one Blender meter corresponds to one game world unit after export/import;
- the normal root transform at runtime is identity scale with no negative scale or hidden correction hierarchy;
- nominal armored visual height remains approximately the current 2.04-game-unit design target, with small crest/ornament overrun allowed when it improves the concept silhouette;
- the current sword study remains a proportion reference, including roughly 1.30 units of blade length, unless visual review justifies a measured adjustment.

The Blender builder may use Blender-native Z-up internally, but the exported GLB must satisfy the runtime contract after the official glTF coordinate conversion. Any unavoidable one-time axis correction belongs in one asset-loader/manifest location and must be tested; it must not be repeated independently in menu, remote-player, and first-person code.

All action clips preserve root translation for gameplay purposes. Pelvis/chest/limb bones may animate normally, but animation must not walk the outer world transform away from the authoritative server position.

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
- expose required named clips/sockets/materials through validated handles rather than freeform tree searches scattered across the game;
- expose which asset revision/source is currently active so automated browser evidence can prove it is rendering the production GLB rather than a fallback.

### Stable wrapper objects

Remote players and menu preview should receive a stable outer `THREE.Group`. The group can initially contain the procedural fallback. When the GLB is ready, its visual child is replaced without changing the network/interpolation object identity.

The replacement must immediately initialize the new animation controller to the fighter's current authoritative state/server-time phase; it must not visibly flash a T-pose or restart a combo merely because the asset finished loading.

This avoids making asynchronous asset loading infect the room/snapshot architecture.

### SpellbladeAnimator

Animation-selection logic should be separated from asset loading. A per-instance controller owns an `AnimationMixer`, clip actions, current visual state, and state transition/crossfade rules.

It consumes the same resolved gameplay state/server timing already used by the extracted pose logic; it does not own gameplay rules.

### Lifecycle and disposal

Remote-player churn must not leak GPU/animation resources.

When an instance is removed:

- stop/uncache its mixer/actions;
- dispose only per-instance cloned mutable materials or instance-owned resources;
- do not dispose shared source geometry/base materials while other clones still use them;
- remove runtime VFX attached to sockets;
- clear controller references.

The menu preview and first-person view need equivalent deterministic disposal when their owning scene/runtime is torn down.

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

A future Astra/MCP bridge should call these same scripts. It should not require us to maintain a second asset implementation.

## Validation

Validation occurs at multiple levels.

### Blender-scene validation

Before export, fail if:

- required bones/sockets are missing or duplicated;
- required animation actions are missing;
- mesh bounds are wildly outside expected character scale;
- exported orientation/origin violates the coordinate contract;
- unassigned materials exist;
- nonzero unintended root motion exists in action clips;
- negative/unapplied transforms would produce mirrored or unexpectedly scaled output;
- hidden/debug/camera-only geometry would be exported unintentionally.

### GLB structural validation

Parse the binary GLB outside Blender and fail if:

- JSON chunk is malformed;
- no skin exists for the third-person model;
- required joint/socket node names are absent;
- required animation names are absent;
- required material names are absent;
- triangle/file-size budgets exceed their hard review ceilings;
- runtime asset file is empty/truncated;
- provenance/revision data does not match the model-source build being reviewed.

### Runtime source tests

Node tests should verify:

- correct asset URLs and manifest contract;
- revision/cache-busting behavior;
- `.glb` MIME serving;
- matching Three.js addon version/import path;
- loader caching rather than fetching one GLB per remote player;
- instance-local mutable emissive materials;
- instance disposal does not dispose shared source geometry;
- fallback path remains available until intentionally removed.

### Browser verification

Automated Chrome review must capture at minimum:

- menu front view;
- menu rotated back view;
- Practice remote/dummy at combat distance;
- Bot Duel active first-person view;
- zero unexpected browser and HTTP errors;
- a report field proving the production Spellblade GLB revision is active in the relevant captures, not merely the procedural fallback.

Where reliable, action-specific screenshots should include Guard and one Slash/Cast pose. Do not make visual CI flaky merely to capture a millisecond-perfect frame; structural action validation and deterministic Blender review renders cover the exact clip poses.

Public/deployed verification should also confirm the promoted manifest/GLB is reachable with the expected revision and `model/gltf-binary` MIME type, so a green screenshot cannot be produced from a stale cached asset by accident.

## Visual acceptance criteria

Before replacing the procedural character as the normal production path:

1. Front, side, back, and 3/4 Blender review renders visibly belong to the supplied concept's design family.
2. Helmet/visor, layered pauldrons, tapered torso, red cloth, heavy boots, sword, and sorcery hand are recognizable without labels.
3. The fighter reads as modeled faceted armor rather than stacked rectangular primitives.
4. Back view is intentionally designed, not an unfinished reverse side of the front model.
5. Idle, Guard, Slash, Cast, and Dash are distinguishable from silhouette/action renders.
6. The sword has a readable blade/guard/pommel silhouette in third- and first-person views.
7. First-person arms match the same character without blocking the crosshair or excessive central screen area.
8. The remote character remains readable at ordinary arena combat distance.
9. No obvious skin-weight collapse, rubber armor, clipping catastrophe, detached sword, or exploding tabard appears in the required clips.
10. Browser evidence explicitly confirms the production GLB is active rather than fallback.
11. Browser evidence is reviewed visually; passing structural tests alone does not constitute character acceptance.

The concept image is the primary art-direction reference. Feasibility simplifications are allowed where they preserve silhouette and combat readability; adding detail that does not improve either is not required.

## Promotion/release flow

1. Edit repository-owned Blender source scripts.
2. Push model-source change to the character branch.
3. GitHub Action builds preview/review artifacts.
4. Inspect Blender renders and validation report.
5. Iterate until the model passes visual review.
6. Promote the reviewed third-person and first-person GLBs into `client/assets/characters/spellblade/` together with a manifest revision tied to their model-source build.
7. Run Node/runtime/browser verification against those exact promoted binaries.
8. Only then make the GLB path the normal character path on the branch.
9. Keep procedural fallback until deployed verification succeeds.
10. Merge only after source diff, generated asset provenance, full CI, and browser evidence are reviewed.

Generated binaries must correspond to a known model-source commit; record source commit/hash information in the generated manifest/report so stale artifacts cannot be promoted accidentally.

## PR #44 migration strategy

PR #44 stays open and becomes the integration branch for this production asset work rather than merging the procedural model first.

Salvage from #44:

- design/proportion knowledge;
- palette and sword studies;
- extracted state/pose timing logic;
- menu framing/turntable behavior;
- first-person framing lessons;
- visual-review workflow and browser capture improvements;
- source-level tests that remain relevant to state/readability contracts.

Replace or retire within #44 before merge:

- the procedural `SpellbladeModel` as the normal third-person renderer;
- procedural first-person arm construction as the normal renderer;
- source tests whose only purpose is enforcing interim procedural geometry implementation details.

The final PR diff should tell a coherent story: a real asset pipeline plus a production character, not two competing character implementations permanently retained.

## Failure behavior

- Blender build failure: no asset promotion; existing runtime branch remains usable.
- GLB validation failure: fail CI before browser tests.
- Browser asset load failure: record browser/HTTP error and use procedural fallback for playability; CI remains failed because the primary production asset path is broken.
- Missing animation clip at runtime: treat as validation/programming error, not silently substitute a random clip; fallback to a safe pose only to avoid a crash.
- Aesthetic shortfall: iterate the Blender model even when CI is green. Visual quality is a product requirement, not optional polish.

## Explicit “duh check” checklist

Before spending substantial effort in this phase, continually verify:

- Are we using Blender for mesh/rig/animation work rather than rebuilding those tools in Three.js?
- Are we keeping server collision/gameplay separate from visible art geometry?
- Are we avoiding duplicated source-of-truth between Python, `.blend`, GLB, and JS?
- Are coordinate system, origin, scale, and facing direction explicit rather than assumed?
- Are async asset loads hidden behind stable runtime wrappers rather than spreading promises through gameplay code?
- Are per-player mutable materials actually per-player?
- Are removed player/menu instances releasing their own animation/material resources without destroying shared assets?
- Are authoritative attack timings still authoritative after animation blending?
- Are we producing both third-person and first-person assets instead of forcing one camera model to serve both?
- Are authoring-object counts being collapsed into reasonable runtime draw calls?
- Are generated binaries traceable to their source commit and cache-busted by revision?
- Does browser evidence prove the GLB is active rather than merely showing a fallback?
- Are we reviewing rendered/in-game evidence rather than congratulating ourselves for successful export?
- Is there an existing specialist tool or format that solves the next problem better before we write custom infrastructure?

## Future extensions deliberately deferred

Once this pipeline proves itself with the Spellblade, later independent projects may use the same Blender worker for:

- modular Castleward/Shattered Keep visible environment art while retaining simple server collision;
- additional character classes sharing a compatible base skeleton where useful;
- weapon variants;
- baked texture/normal workflows if geometry/material-only art direction stops being sufficient;
- an Astra MCP bridge for interactive Blender editing and inspection.

Those are not part of this implementation unless a dependency becomes unavoidable.
