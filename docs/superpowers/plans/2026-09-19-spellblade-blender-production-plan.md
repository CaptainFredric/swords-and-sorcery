# Spellblade Blender Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the interim runtime-constructed Spellblade with reviewed, rigged, animated Blender GLBs for third-person and first-person presentation while preserving the existing server-authoritative combat/gameplay model and keeping the procedural character only as a temporary fallback.

**Architecture:** Repository-owned Blender Python remains the Stage-1 source of truth. A pinned Blender 4.5 LTS GitHub Actions worker builds/validates/renders assets as review artifacts; an explicit promotion request later commits the reviewed GLBs and revision manifest. The browser loads production assets through cached `GLTFLoader` sources, clones skinned instances with `SkeletonUtils.clone`, drives them from pure server-time animation plans, and falls back to the existing procedural rig if loading fails.

**Tech Stack:** Blender 4.5 LTS + Python, glTF 2.0/GLB, Three.js 0.169.0 (`GLTFLoader`, `SkeletonUtils`, `AnimationMixer`), Node 22 test runner, GitHub Actions, Chrome/CDP visual verification.

**Spec:** `docs/superpowers/specs/2026-09-19-spellblade-blender-production-pipeline.md`

## Global Constraints

- Do not change combat damage, cooldowns, movement, hit detection, server authority, room behavior, or bot behavior.
- Stage-1 canonical source is repository-owned Blender Python under `tools/blender/characters/spellblade/`; generated `.blend` files are artifacts, not editable canonical source.
- Blender version is pinned to `4.5.14 LTS`; checksum the official archive before use.
- GitHub Ubuntu workers must install `libegl1` before Eevee rendering.
- Runtime character origin is ground level centered between the feet; world scale is meters; exported yaw-zero must visually face game forward (`-Z`); `+Y` is up in the runtime.
- No gameplay root motion. Server/client interpolation owns world translation/yaw.
- Required third-person clips: `Idle`, `Run`, `Air`, `Guard`, `Slash_1`, `Slash_2`, `Slash_3`, `Cast`, `Dash`, `Stagger`, `Death`.
- Required sockets: `socket_sword`, `socket_sorcery`.
- Target third-person export: ~20k-25k triangles, review ceiling ~35k, <=6 normal renderable primitives, <2 MB uncompressed GLB target.
- Target first-person export: ~8k-12k triangles, <1 MB uncompressed GLB target.
- The first production pass is geometry/material driven; do not add a large texture pipeline.
- Runtime mutable glow materials must be per-instance; one player must never change another player's emissive state.
- Procedural fallback stays available until deployed GLB loading and animation are proven.
- Asset preview/review builds must not silently modify promoted runtime GLBs.
- Browser acceptance must prove the production GLB revision is active; fallback rendering is not sufficient evidence.

## Review Focus

1. **Stale browser cache:** a promoted GLB revision must produce a revisioned URL/report value, and the browser must not silently reuse the previous binary. Task 7 adds URL/revision tests; Task 11 verifies the browser report.
2. **Per-player mutation leakage:** changing visor/sorcery emissive intensity for one clone must not mutate another clone or the cached source. Task 7 adds isolated-material instance tests at the pure-contract layer and Task 8 verifies runtime ownership/disposal.
3. **Async asset arrival during live snapshots:** replacing fallback with a GLB must preserve the stable outer group's world transform and current state rather than teleporting/resetting a remote player. Task 8 adds an upgrade-state regression.
4. **Animation timing drift:** attack/cast/dash/stagger visuals must derive clip selection/time from server-authoritative timestamps rather than snapshot arrival time. Task 8 adds pure animation-plan tests for late snapshots and combo progression.
5. **Export-axis/scale mistakes:** GLB validation must reject missing sockets, wrong approximate height/origin, negative root scale, and root-motion translation tracks. Tasks 3 and 5 add validator failures before accepting the model.

---

## File map

### Canonical asset source

- `tools/blender/common/render.py` — narrow Eevee camera/render helper.
- `tools/blender/common/export.py` — narrow GLB export helper and transform normalization checks.
- `tools/blender/characters/spellblade/contract.json` — names, budgets, clip/socket/material contract consumed by Python validation and runtime-manifest generation.
- `tools/blender/characters/spellblade/design.py` — concept proportions, palette/material roles, authoring dimensions.
- `tools/blender/characters/spellblade/rig.py` — custom armature and socket construction.
- `tools/blender/characters/spellblade/model.py` — third-person armor/body/sword geometry.
- `tools/blender/characters/spellblade/animations.py` — named third-person actions.
- `tools/blender/characters/spellblade/first_person.py` — camera-optimized arms/weapon mesh + minimal rig/actions.
- `tools/blender/characters/spellblade/build.py` — deterministic build entry point; writes `.blend`, GLBs, renders, report.
- `tools/blender/characters/spellblade/validate.py` — Blender-side scene/armature/material validation.
- `tools/blender/characters/spellblade/promotion.json` — explicit reviewed source SHA to promote; changing this file is the promotion request.

### External validation and workflow

- `scripts/validate-spellblade-glb.py` — parses GLB JSON chunk without Blender and validates skins, clips, sockets, root motion, bounds, counts and provenance.
- `.github/workflows/spellblade-assets.yml` — preview/review artifact worker; read-only repository permission.
- `.github/workflows/promote-spellblade-assets.yml` — triggered only by promotion-request changes; builds the requested reviewed source and commits generated runtime binaries/manifest with `contents: write`.

### Promoted runtime assets

- `client/assets/characters/spellblade/spellblade.glb` — promoted third-person binary.
- `client/assets/characters/spellblade/spellblade-fp.glb` — promoted first-person binary.
- `client/assets/characters/spellblade/manifest.json` — generated runtime URLs + source revision + contract names.

### Runtime

- `client/game/SpellbladeAssets.mjs` — loader/cache/clone/material isolation/revision API.
- `client/game/spellbladeAnimationPlan.mjs` — pure gameplay-state -> clip/time/weight plan.
- `client/game/spellbladeAnimationPlan.test.mjs` — Node timing tests.
- `client/game/SpellbladeAnimator.mjs` — Three.js `AnimationMixer` adapter.
- `client/game/SpellbladeFallback.mjs` — renamed current procedural `SpellbladeModel` implementation.
- `client/game/RemotePlayers.mjs` — stable wrapper + fallback-to-GLB upgrade + animator ownership.
- `client/game/WeaponView.mjs` — stable camera-space wrapper + FP fallback-to-GLB upgrade.
- `client/menu/MenuScene.mjs` — same third-person production GLB + Idle action.
- `client/index.html` — matching Three.js addons import map entries.
- `server/src/server.mjs` — `.glb`/optional `.gltf` MIME mapping only.

### Verification

- `server/tests/client-shell.test.mjs` — static MIME/import/fallback/asset wiring contracts.
- `server/tests/deployment-config.test.mjs` — production worker/promotion/browser-evidence workflow contracts.
- `scripts/capture-public-arena.mjs` — report active asset kind + source revision and preserve current screenshots.
- `.github/workflows/visual-review.yml` — require promoted GLB fingerprint for character review once migration is active.
- `.github/workflows/public-render-check.yml` — fingerprint deployed manifest/GLB revision before Chrome evidence.

---

### Task 1: Create one neutral Spellblade asset contract and static MIME support

**Files:**
- Create: `tools/blender/characters/spellblade/contract.json`
- Create: `client/game/spellbladeAssetContract.mjs`
- Create: `client/game/spellbladeAssetContract.test.mjs`
- Modify: `server/src/server.mjs`
- Modify: `server/tests/client-shell.test.mjs`

**Interfaces:**
- Consumes: existing Three.js version `0.169.0`, existing game forward convention (`yaw=0 -> -Z`).
- Produces: `loadSpellbladeContract(raw) -> frozen normalized contract`; checked-in canonical contract names/budgets; `model/gltf-binary` static response for `.glb`.

- [ ] **Step 1: Write the failing contract tests**

Create `client/game/spellbladeAssetContract.test.mjs` with explicit expectations:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSpellbladeContract } from './spellbladeAssetContract.mjs';

const VALID = {
  version: 1,
  facing: '-Z',
  up: '+Y',
  unitMeters: 1,
  clips: ['Idle','Run','Air','Guard','Slash_1','Slash_2','Slash_3','Cast','Dash','Stagger','Death'],
  sockets: ['socket_sword','socket_sorcery'],
  mutableMaterials: ['VisorGlow','SorceryAccent'],
  thirdPerson: { maxTriangles: 35000, targetBytes: 2000000 },
  firstPerson: { maxTriangles: 16000, targetBytes: 1000000 },
};

test('normalizes and freezes the Spellblade asset contract', () => {
  const value = loadSpellbladeContract(VALID);
  assert.equal(value.facing, '-Z');
  assert.equal(value.unitMeters, 1);
  assert.deepEqual(value.sockets, ['socket_sword', 'socket_sorcery']);
  assert.ok(Object.isFrozen(value));
});

test('rejects a contract that drops a timing-critical clip', () => {
  assert.throws(() => loadSpellbladeContract({ ...VALID, clips: VALID.clips.filter((name) => name !== 'Slash_3') }), /Slash_3/);
});

test('rejects wrong runtime axis conventions', () => {
  assert.throws(() => loadSpellbladeContract({ ...VALID, facing: '+Z' }), /-Z/);
});
```

Extend `server/tests/client-shell.test.mjs` to assert `server/src/server.mjs` maps `.glb` to `model/gltf-binary`.

- [ ] **Step 2: Run the focused tests and record RED**

Run in CI via the normal repository workflow after committing test-only changes.

Expected: asset-contract import/module missing and/or `.glb` MIME assertion fails; unrelated tests remain green.

- [ ] **Step 3: Add the canonical JSON and minimal normalizer**

`contract.json` must contain exactly one authoritative list of required clip/socket/material names and budgets. `spellbladeAssetContract.mjs` validates the JSON shape and exports only neutral data utilities; it must not import Three.js.

Add MIME cases:

```js
'.glb': 'model/gltf-binary',
'.gltf': 'model/gltf+json',
```

- [ ] **Step 4: Re-run focused tests and full `npm run verify`**

Expected: all contract/MIME tests pass and no gameplay test changes.

- [ ] **Step 5: Commit**

Commit message: `feat: define Spellblade asset contract`

---

### Task 2: Turn the successful spike into a production Blender worker

**Files:**
- Create: `tools/blender/common/render.py`
- Create: `tools/blender/common/export.py`
- Create: `tools/blender/characters/spellblade/build.py`
- Create: `tools/blender/characters/spellblade/validate.py`
- Create: `scripts/validate-spellblade-glb.py`
- Create: `.github/workflows/spellblade-assets.yml`
- Modify: `server/tests/deployment-config.test.mjs`

**Interfaces:**
- Consumes: `contract.json` from Task 1.
- Produces: `python tools/blender/characters/spellblade/build.py --mode preview|review --out <dir> --source-revision <sha>`; artifact report `spellblade-build-report.json`; external validator CLI.

- [ ] **Step 1: Add a failing deployment/workflow contract**

Extend `deployment-config.test.mjs` to require:

```js
assert.match(workflow, /4\.5\.14/);
assert.match(workflow, /download\.blender\.org/);
assert.match(workflow, /sha256sum -c/);
assert.match(workflow, /libegl1/);
assert.match(workflow, /--background/);
assert.match(workflow, /build\.py/);
assert.match(workflow, /validate-spellblade-glb\.py/);
assert.match(workflow, /spellblade-build-report\.json/);
```

- [ ] **Step 2: Commit test-only and verify RED**

Expected: only the new worker-contract assertions fail because the production workflow is absent.

- [ ] **Step 3: Implement narrow common helpers and worker shell**

Port only proven pieces from `spike/headless-blender-worker`; do not copy the proof character. `render.py` owns camera/render settings; `export.py` owns transform normalization + `bpy.ops.export_scene.gltf`; `build.py` orchestrates model/rig/actions supplied by later tasks.

Until Task 3 supplies a production model, `build.py` should fail clearly with `SPELLBLADE_MODEL_NOT_IMPLEMENTED` rather than generating a misleading placeholder.

- [ ] **Step 4: Implement external GLB parser/validator foundation**

`validate-spellblade-glb.py` must parse the GLB header/chunks using Python stdlib (`struct`, `json`) and expose:

```python
def read_glb_json(path: Path) -> dict: ...
def validate_glb(path: Path, contract: dict, *, first_person: bool) -> list[str]: ...
```

At this task, validate header/version and readable JSON only; later tasks add semantic rules.

- [ ] **Step 5: Add the read-only artifact workflow**

Workflow requirements:

```yaml
permissions:
  contents: read
```

Trigger on PR/push paths under `tools/blender/**`, asset contract/validator/workflow changes. Install `libegl1`; download+verify Blender 4.5.14; run review or preview mode based on event/input; upload all outputs. Do not commit generated files.

- [ ] **Step 6: Run repository CI**

Expected: source/deployment tests green. The Blender workflow is allowed to fail with `SPELLBLADE_MODEL_NOT_IMPLEMENTED` until Task 3 on the feature branch; do not call it production-green yet.

- [ ] **Step 7: Commit**

Commit message: `build: add production Blender asset worker`

---

### Task 3: Build the production skeleton, coordinate contract, and validation gate

**Files:**
- Create: `tools/blender/characters/spellblade/design.py`
- Create: `tools/blender/characters/spellblade/rig.py`
- Modify: `tools/blender/characters/spellblade/build.py`
- Modify: `tools/blender/characters/spellblade/validate.py`
- Modify: `scripts/validate-spellblade-glb.py`

**Interfaces:**
- Produces: `build_armature() -> bpy.types.Object`; `add_socket_bones(armature)`; exact required hierarchy/names; production root origin/scale.

- [ ] **Step 1: Make the external validator require the production rig before it exists**

Add validation failures for missing skin, missing required named joints/sockets, negative/non-unit root scales, approximate character height outside `1.85..2.25m`, and root translation animation tracks.

Required joint names include:

```text
root pelvis spine chest neck head
clavicle.L upper_arm.L forearm.L hand.L
clavicle.R upper_arm.R forearm.R hand.R
thigh.L shin.L foot.L thigh.R shin.R foot.R
tabard_root tabard_front_01 tabard_front_02 tabard_back_01 tabard_back_02
socket_sword socket_sorcery
```

- [ ] **Step 2: Run the Blender worker and verify RED**

Expected: production build/validation fails because the armature/model is not implemented.

- [ ] **Step 3: Implement the compact armature**

Use meters and ground origin. Build with explicit edit-bone head/tail coordinates from `design.py`; avoid Rigify. Right/left naming must match the contract exactly. Socket bones are non-deforming children of the relevant hand bones.

- [ ] **Step 4: Add a minimal hidden proxy mesh only for rig/export validation**

This is not the visual model. Use one low-poly under-armor proxy bound to the skeleton so the worker can produce a skinned GLB and exercise the contract. Tag the report `visualStage: "rig-proxy"` so it cannot be mistaken for acceptance art.

- [ ] **Step 5: Render a diagnostic front/side skeleton/proxy view and validate**

Expected: external validator reports one skin, required joints/sockets present, no root-motion translations, bounds in meter scale.

- [ ] **Step 6: Commit**

Commit message: `feat: add production Spellblade skeleton`

---

### Task 4: Model the concept-faithful third-person Spellblade

**Files:**
- Modify: `tools/blender/characters/spellblade/design.py`
- Create: `tools/blender/characters/spellblade/model.py`
- Modify: `tools/blender/characters/spellblade/build.py`
- Modify: `tools/blender/characters/spellblade/validate.py`

**Interfaces:**
- Consumes: armature/sockets from Task 3.
- Produces: `build_third_person_model(rig, materials) -> ModelParts`; named `VisorGlow` and `SorceryAccent` materials; shared sword source used again by Task 6.

- [ ] **Step 1: Tighten validator expectations before replacing the proxy**

Require production material names, a non-proxy report stage, triangle/primitive budgets, and presence of concept hero pieces by object/tag name during Blender-side validation:

```text
HelmetShell, HelmetJaw, Visor, Crest,
Breastplate, Pauldron.L, Pauldron.R,
Gauntlet.L, Gauntlet.R, Greave.L, Greave.R,
Boot.L, Boot.R, TabardFront, TabardBack,
HeroSword
```

- [ ] **Step 2: Run worker and verify RED against the proxy**

Expected: validation fails specifically because required production pieces/materials are absent.

- [ ] **Step 3: Implement reusable low-poly authoring primitives only as needed**

Inside `model.py`, use small local helpers such as `beveled_box`, `wedge_mesh`, `tapered_prism`, `mirror_part`; do not create a generic modeling DSL. Apply transforms before export.

- [ ] **Step 4: Build large silhouette forms first**

In order: helmet/jaw/visor/crest; tapered chest/waist; layered pauldrons; upper/lower limbs; gauntlets; heavy greaves/boots; scarf/tabard; hero sword. Keep asymmetry limited to pose/design details supported by the concept.

- [ ] **Step 5: Rigid-bind armor and smoothly weight only flexible regions**

Armor shells should use 100% or near-100% weights to intended bones. Under-armor shoulder/hip geometry may blend. Tabard is weighted to its dedicated chain. Sword is attached through `socket_sword`, not deformed with the hand.

- [ ] **Step 6: Generate fast neutral front/back/side/quarter previews**

Use low sample/resolution preview mode. Inspect silhouette against the concept sheet. Do not advance if front/back do not clearly show enclosed visor helmet, broad shoulders, narrow waist, large boots, red cloth, and oversized sword.

- [ ] **Step 7: Iterate geometry based on screenshots, rerunning validator each time**

Stop adding detail when it no longer improves combat-distance silhouette. Stay inside the triangle/material/primitive budgets.

- [ ] **Step 8: Commit the accepted neutral model source**

Commit message: `feat: model production Spellblade armor`

---

### Task 5: Author all third-person animation clips with authoritative timing

**Files:**
- Create: `tools/blender/characters/spellblade/animations.py`
- Modify: `tools/blender/characters/spellblade/build.py`
- Modify: `scripts/validate-spellblade-glb.py`
- Modify: `tools/blender/characters/spellblade/validate.py`

**Interfaces:**
- Produces all 11 required named Blender actions with no gameplay root translation.

- [ ] **Step 1: Extend GLB validator to require all clips and reject root translation channels**

Validator must compare animation names to `contract.json` and inspect animation channel targets. Any translation channel targeting `root` fails.

- [ ] **Step 2: Run review build and verify RED**

Expected: required clip-name failures.

- [ ] **Step 3: Implement timing constants derived from existing game presentation**

Read `shared/src/combat.mjs`, `client/game/remoteSpellbladePose.mjs`, and `client/game/weaponPose.mjs`; encode visual frame durations that align with existing attack/cast/dash/stagger windows. Do not alter gameplay constants.

- [ ] **Step 4: Author `Idle`, `Run`, `Air`, `Guard`**

Prioritize silhouette readability at combat distance. Idle stays restrained; Run has strong arm/leg opposition; Air compresses lower body; Guard visibly interposes sword/body.

- [ ] **Step 5: Author `Slash_1`, `Slash_2`, `Slash_3`**

Each strike must have a distinct windup/contact/recovery silhouette and line up its contact pose with the existing strike timing model. Do not use root motion.

- [ ] **Step 6: Author `Cast`, `Dash`, `Stagger`, `Death`**

Cast presents left sorcery hand; Dash compresses body toward movement direction without translating root; Stagger clearly loses offensive posture; Death exits normal fighting silhouette and is compatible with the current ~1.05s remote visibility rule.

- [ ] **Step 7: Render review frames for all key actions**

At minimum: Guard, each Slash near contact, Cast, Dash, Stagger, Death plus neutral turntable views.

- [ ] **Step 8: Run full Blender scene validation + external GLB validation**

Expected: all 11 clips present, no root-motion translation, budgets green.

- [ ] **Step 9: Commit**

Commit message: `feat: animate production Spellblade`

---

### Task 6: Build a separate first-person arms/weapon asset

**Files:**
- Create: `tools/blender/characters/spellblade/first_person.py`
- Modify: `tools/blender/characters/spellblade/build.py`
- Modify: `scripts/validate-spellblade-glb.py`

**Interfaces:**
- Consumes shared material/sword construction from `model.py`.
- Produces `spellblade-fp.glb` with minimal camera-space rig and named visible-action clips.

- [ ] **Step 1: Add first-person validation that fails without an FP export**

Require a skin, right/left hand chains, sword, mutable sorcery material/socket as needed, file-size/triangle budget, and a subset of visible actions: `Idle`, `Guard`, `Slash_1`, `Slash_2`, `Slash_3`, `Cast`, `Dash`, `Stagger`.

- [ ] **Step 2: Run worker and verify RED for missing FP asset**

- [ ] **Step 3: Build camera-optimized arms/gauntlets from the same design dimensions/materials**

Do not include torso/legs/helmet. Allow proportion offsets that improve 78° FOV readability while keeping armor design consistent.

- [ ] **Step 4: Reuse the hero sword source**

No separate sword design. Camera-specific attachment transform is allowed; blade/guard/pommel geometry source remains shared.

- [ ] **Step 5: Author first-person clips and neutral framing**

Keep the crosshair/center clear. Guard can occupy more center temporarily; Idle must leave opponent-reading space open.

- [ ] **Step 6: Render FP neutral/guard/slash/cast review images**

- [ ] **Step 7: Validate and commit**

Commit message: `feat: build first-person Spellblade asset`

---

### Task 7: Add explicit reviewed-asset promotion and revisioned runtime manifest

**Files:**
- Create: `tools/blender/characters/spellblade/promotion.json`
- Create: `.github/workflows/promote-spellblade-assets.yml`
- Create: `client/assets/characters/spellblade/manifest.json` (generated/promoted)
- Modify: `server/tests/deployment-config.test.mjs`
- Modify: `client/game/spellbladeAssetContract.mjs`
- Modify: `client/game/spellbladeAssetContract.test.mjs`

**Interfaces:**
- Promotion request shape: `{ "sourceCommit": "<40-hex-sha>" }`.
- Runtime manifest produces revisioned URLs: `/client/assets/characters/spellblade/spellblade.glb?v=<sourceCommit>` and FP equivalent.

- [ ] **Step 1: Add RED tests for revisioned URLs and explicit promotion workflow**

Pure JS helper test:

```js
const runtime = runtimeSpellbladeManifest(contract, { sourceRevision: 'a'.repeat(40) });
assert.match(runtime.thirdPerson.url, /spellblade\.glb\?v=a{40}$/);
assert.equal(runtime.sourceRevision, 'a'.repeat(40));
```

Deployment test requires promotion workflow to have `contents: write`, trigger only on `promotion.json`, validate a 40-hex SHA, build the requested source, validate both GLBs, and commit only `client/assets/characters/spellblade/**` plus generated manifest.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Implement promotion workflow**

Workflow algorithm:

1. checkout promotion commit with full enough history;
2. parse `sourceCommit`;
3. verify source is an ancestor of promotion commit;
4. create a detached worktree at source SHA;
5. run the pinned Blender review build in that source worktree;
6. validate GLBs;
7. copy reviewed GLBs into current checkout;
8. generate runtime `manifest.json` with `sourceRevision` set to requested SHA;
9. commit only runtime asset files with message `assets: promote Spellblade <shortsha>`;
10. push to the same branch.

The generated-asset commit must not touch `promotion.json`, preventing a workflow loop.

- [ ] **Step 4: Run CI**

Expected: promotion structure tests green. Do not request promotion until Task 11 visual review accepts an artifact.

- [ ] **Step 5: Commit**

Commit message: `build: add reviewed Spellblade asset promotion`

---

### Task 8: Implement cached GLB loading, cloning, lifecycle, and pure animation planning

**Files:**
- Modify: `client/index.html`
- Create: `client/game/SpellbladeAssets.mjs`
- Create: `client/game/spellbladeAnimationPlan.mjs`
- Create: `client/game/spellbladeAnimationPlan.test.mjs`
- Create: `client/game/SpellbladeAnimator.mjs`
- Create: `client/game/SpellbladeFallback.mjs`
- Modify/Delete: migrate existing `client/game/SpellbladeModel.mjs`
- Modify: `server/tests/client-shell.test.mjs`

**Interfaces:**
- `SpellbladeAssets.preload()`
- `SpellbladeAssets.createThirdPersonInstance() -> Promise<SpellbladeInstance>`
- `SpellbladeAssets.createFirstPersonInstance() -> Promise<SpellbladeInstance>`
- `SpellbladeInstance = { root, mixer?, clips, sockets, mutableMaterials, sourceRevision, dispose() }`
- `resolveSpellbladeAnimationPlan({ state, player, serverNow, localTime }) -> { clip, time, loop, weight }`
- `SpellbladeAnimator.apply(plan, dt)` and `dispose()`.

- [ ] **Step 1: Add matching Three.js addon import-map entries**

Use exactly version `0.169.0` for `GLTFLoader` and `SkeletonUtils` paths. Add source test assertions preventing version mismatch.

- [ ] **Step 2: Write pure animation-plan RED tests**

Cover: late attack snapshot chooses correct Slash clip/time; slash progression follows authoritative attack start; cast window maps to `Cast`; dash/stagger derive remaining time from server timestamps; dead selects `Death`; run/idle loop locally.

Example:

```js
const plan = resolveSpellbladeAnimationPlan({
  state: 'attack',
  player: { attackStartedAt: 10, attackNextStrike: 2 },
  serverNow: 10.72,
  localTime: 100,
});
assert.equal(plan.clip, 'Slash_2');
assert.ok(plan.time > 0);
```

- [ ] **Step 3: Commit tests and verify RED**

- [ ] **Step 4: Implement pure animation planner**

Reuse the timing semantics already extracted in `remoteSpellbladePose.mjs`; do not make `AnimationMixer` decide gameplay state.

- [ ] **Step 5: Move the current procedural model to fallback ownership**

Create `SpellbladeFallback.mjs` from the current model and update fallback imports. Do not duplicate it indefinitely. Preserve its existing public creation function for migration.

- [ ] **Step 6: Implement `SpellbladeAssets`**

Use cached `GLTFLoader` promises, `SkeletonUtils.clone` for each skinned instance, lookup validation against runtime manifest, and clone only mutable glow materials. Expose source revision on each instance/root `userData`.

- [ ] **Step 7: Implement explicit disposal**

Per-instance disposal stops/uncaches mixer actions and disposes cloned mutable materials. Do **not** dispose shared cached geometry/base materials when one player leaves.

- [ ] **Step 8: Implement `SpellbladeAnimator`**

Own one mixer per instance, pre-resolve named actions, crossfade only where safe, set action time from pure plan for timing-critical states, and expose `dispose()`.

- [ ] **Step 9: Run full Node verification**

Expected: pure timing tests and source contracts green.

- [ ] **Step 10: Commit**

Commit message: `feat: load and animate Spellblade GLB assets`

---

### Task 9: Upgrade remote players asynchronously without breaking network state

**Files:**
- Modify: `client/game/RemotePlayers.mjs`
- Create: `client/game/remoteVisualState.mjs`
- Create: `client/game/remoteVisualState.test.mjs`

**Interfaces:**
- `createRemoteVisualShell(fallback) -> { root, visual, generation, ... }`
- `upgradeRemoteVisual(shell, instance)` preserves outer transform/state and ignores stale async completion after player removal/recreation.

- [ ] **Step 1: Write RED tests for generation-safe asynchronous upgrade**

Pure tests must cover:

- fallback shell position/yaw stays on outer root after visual replacement;
- an asset promise resolving after player removal is ignored/disposed;
- remove/re-add same player id cannot let the old promise replace the new generation;
- latest gameplay state can be immediately applied when GLB arrives.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Refactor `RemotePlayers` to stable outer groups**

Each player map entry owns `{ root, visualKind, visual, animator, generation, ... }`. Snapshot interpolation updates `root` only. Start with procedural fallback synchronously; request GLB asynchronously.

- [ ] **Step 4: Upgrade to GLB on resolution**

Attach production root under stable wrapper, remove fallback visual, initialize animator at the current authoritative plan, set runtime VFX socket handle/materials, and mark `visualKind='glb'` + revision.

- [ ] **Step 5: Preserve runtime sorcery VFX boundary**

Move existing magic particles/halo/light to attach under `socket_sorcery` for GLB instances; fallback continues using its existing anchor.

- [ ] **Step 6: Dispose safely on player removal/runtime teardown**

Stop mixer + mutable materials + runtime VFX; leave cached source untouched.

- [ ] **Step 7: Run Node verification and browser local visual review**

Use Practice dummy/Bot Duel to prove remote GLB is active and stable while snapshots continue.

- [ ] **Step 8: Commit**

Commit message: `feat: use production Spellblade for remote players`

---

### Task 10: Migrate menu and first-person presentation to production assets

**Files:**
- Modify: `client/menu/MenuScene.mjs`
- Modify: `client/game/WeaponView.mjs`
- Modify: `client/game/GameRuntime.mjs`
- Modify: `server/tests/client-shell.test.mjs`

**Interfaces:**
- Menu retains drag/reset API and stable stage group.
- WeaponView retains existing public methods: `setAttack`, `setGuard`, `cast`, `dash`, `wallImpact`, `parry`, `update`.

- [ ] **Step 1: Add source-level RED contracts for asset use while preserving public APIs**

Require MenuScene/WeaponView to reference `SpellbladeAssets`, production/fallback state markers, and current public method names. Explicitly forbid direct production dependence on `createSpellbladeRig` outside fallback module.

- [ ] **Step 2: Verify RED**

- [ ] **Step 3: Migrate MenuScene**

Create a stable character wrapper with fallback immediately. Call asset preload, replace with third-person GLB on success, play `Idle` through animator, retain drag-to-turn and current stage lighting. Runtime sorcery effect attaches to production socket.

- [ ] **Step 4: Migrate WeaponView**

Keep `this.group` as stable camera-space outer transform. Start with procedural fallback; replace visual with FP GLB when loaded. Existing method calls update a local state model; `update()` resolves the corresponding FP animation clip/time and continues camera-space sway/outer-group motion.

- [ ] **Step 5: Keep wall-impact/parry behavior deliberate**

If the FP asset lacks dedicated `WallImpact`/`Parry` clips, preserve them as short code-level outer offsets layered over the GLB rather than inventing new gameplay actions.

- [ ] **Step 6: Add lifecycle cleanup**

`WeaponView.dispose()` and MenuScene disposal must release per-instance mixer/material resources. Update `GameRuntime.dispose()` to call `weapon.dispose()`.

- [ ] **Step 7: Run Node verification and Chrome screenshots**

Inspect menu front/back and first-person idle/guard/combat. Do not accept if sword/gauntlets obscure the crosshair or GLB loads cause visible pose pops.

- [ ] **Step 8: Commit**

Commit message: `feat: use production Spellblade in menu and first person`

---

### Task 11: Prove the production GLB visually, promote it, and verify deployment

**Files:**
- Modify: `scripts/capture-public-arena.mjs`
- Modify: `.github/workflows/visual-review.yml`
- Modify: `.github/workflows/public-render-check.yml`
- Modify: `server/tests/deployment-config.test.mjs`
- Modify: `tools/blender/characters/spellblade/promotion.json`

**Interfaces:**
- Browser report includes `spellbladeAsset: { kind, sourceRevision, thirdPersonLoaded, firstPersonLoaded }`.

- [ ] **Step 1: Add RED browser/deployment contracts**

Deployment test requires browser capture to report `kind: 'glb'` and a 40-hex revision for menu, remote fighter, and first-person asset. Public workflow must fetch/fingerprint runtime manifest and verify the source revision expected from deployment.

- [ ] **Step 2: Verify RED before browser instrumentation exists**

- [ ] **Step 3: Add runtime evidence markers**

Set non-sensitive DOM/global debug state such as `globalThis.__SPELLBLADE_ASSET_STATUS__` from the asset store. Browser capture reads it after each relevant mode; no gameplay behavior depends on this marker.

- [ ] **Step 4: Run the Blender review workflow on the exact modeling head**

Download artifact and inspect:

- front/back/side/quarter neutral renders;
- Guard;
- Slash 1/2/3 contact poses;
- Cast;
- Dash;
- Stagger;
- Death;
- first-person neutral/guard/slash/cast;
- validation report and GLB sizes/counts.

If the model is visually wrong, iterate Blender source and repeat review. Do not promote a merely structurally valid model.

- [ ] **Step 5: Explicitly request promotion of the reviewed source SHA**

Update `promotion.json` to that exact reviewed modeling SHA. Let the promotion workflow build/validate/commit the GLBs and generated runtime manifest.

- [ ] **Step 6: Verify promotion commit contents**

Diff must contain only runtime GLBs/manifest produced from the requested reviewed source. Confirm manifest `sourceRevision` equals the reviewed SHA.

- [ ] **Step 7: Run full repository CI on the promoted head**

Required: `npm run verify` green on exact head.

- [ ] **Step 8: Run PR Chrome visual review on promoted assets**

Required evidence:

- menu front + back show production model;
- Practice/Bot Duel remote fighter reports GLB active;
- first-person reports FP GLB active;
- no browser/HTTP errors;
- current gameplay modes still function.

- [ ] **Step 9: Compare against the supplied concept sheet manually**

Acceptance focuses on silhouette/design, not pixel identity. Required visual identity: enclosed cyan-visored helmet, broad layered pauldrons, tapered torso, heavy gauntlets/boots, crimson cloth front/back, oversized faceted sword, cyan sorcery hand, readable Guard/Slash/Cast/Dash silhouettes.

- [ ] **Step 10: Whole-branch review**

Compare PR #44 to current `main`. Confirm no server gameplay/combat behavior changes, no duplicate canonical source, no unreviewed binary assets, fallback remains temporary/isolated, and superseded procedural-only planning is clearly historical.

- [ ] **Step 11: Mark PR ready only after review evidence is attached**

Update PR body with exact CI, Blender review, visual review, asset source SHA, promoted manifest revision, and any known visual limitations.

- [ ] **Step 12: Merge only against the exact verified head**

Use expected-head SHA protection. After merge, wait for Render to serve the promoted manifest revision.

- [ ] **Step 13: Run the public deployed browser verifier**

Required: deployed manifest revision matches merge, menu/remote/first-person all report `kind='glb'`, current Bot Duel readiness behavior still works, screenshots are visually coherent, and browser/HTTP error arrays are empty.

- [ ] **Step 14: Only then schedule removal of the procedural fallback as a separate cleanup**

Do not delete fallback in this PR unless deployed evidence proves it is never needed and a separate reviewed cleanup is explicitly approved.

---

## Self-review results

### Spec coverage

- Stage-1 Python source of truth: Tasks 2-6.
- Explicit reviewed promotion rather than silent binary mutation: Task 7 and Task 11.
- Custom skeleton/sockets/rigid armor: Tasks 3-4.
- Full named third-person animation set/no root motion: Task 5.
- Separate first-person asset: Task 6 and Task 10.
- GLTFLoader/SkeletonUtils matching Three version: Task 8.
- Cached source + independent skeleton/material instances + lifecycle: Task 8 and Task 9.
- Server-time animation sync: Task 8 and Task 9.
- Runtime sorcery VFX socket boundary: Task 9 and Task 10.
- Procedural fallback/migration safety: Tasks 8-10.
- `.glb` MIME: Task 1.
- revision/cache/provenance: Task 7 and Task 11.
- fast preview + review renders and external GLB validation: Tasks 2-6 and Task 11.
- browser proof that fallback is not masking failure: Task 11.
- deployed verification: Task 11.

No approved spec requirement is intentionally omitted.

### Placeholder scan

No `TBD`, `TODO`, “similar to Task N”, or unspecified “add validation/error handling” steps remain. Visual iteration steps explicitly name the required renders and acceptance characteristics.

### Type/name consistency

- Canonical contract names flow from `contract.json` to Python validation/export and generated runtime manifest.
- Runtime source revision is `sourceRevision` everywhere.
- Production sockets are `socket_sword` / `socket_sorcery` everywhere.
- Required clip names are identical across contract, validation and runtime plan.
- Asset instance disposal is per-instance; cached source lifecycle remains owned by `SpellbladeAssets`.

### Scope check

This remains one coherent sub-project: producing and integrating the base Spellblade production asset. Castleward environment art, broader VFX replacement, fallback deletion, and future Astra interactive-source transition stay separate.

### Promotion gate

Preview/review builds are read-only and can never rewrite promoted runtime assets. Promotion occurs only after a human-visible Blender review artifact has been inspected and the exact accepted modeling SHA is written to `promotion.json`. The promotion workflow rebuilds that reviewed source SHA from scratch before committing binaries, so promoted GLBs cannot silently come from an unreviewed newer model state.
