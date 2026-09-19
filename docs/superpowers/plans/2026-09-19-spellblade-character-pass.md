# Spellblade Character Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the base Spellblade's prototype-like box geometry with a concept-faithful faceted low-poly fighter while preserving the current multiplayer, combat, animation-state, and menu-preview behavior.

**Architecture:** Keep the existing `SpellbladeModel` / `RemotePlayers` / `WeaponView` / `MenuScene` responsibilities. Add a small pure geometry-data layer that Node can test, a thin Three.js adapter, shared design constants, and one shared sword builder. Extract remote pose targets into a pure module so silhouette changes can be regression-tested without importing Three.js. Do not create a generic modeling framework or change server/network protocol.

**Tech Stack:** JavaScript ES modules, Three.js 0.169 in-browser import map, Node 22 native tests, GitHub Actions CI, headless Chrome/CDP screenshot verification.

**Spec:** `docs/superpowers/specs/2026-09-19-spellblade-character-pass.md`

## Global Constraints

- Preserve server combat/network behavior and gameplay constants.
- Preserve the rig keys currently consumed by `RemotePlayers.mjs` and `MenuScene.mjs`: `visual`, `pelvis`, `torso`, `head`, `visor`, `tabardFront`, `tabardBack`, `leftUpperArm`, `leftForearm`, `rightUpperArm`, `rightForearm`, `leftThigh`, `leftShin`, `rightThigh`, `rightShin`, `sword`, `magicAnchor`, `magic`, `magicHalo`, `accentMaterial`.
- Additional pivots such as pauldrons, hands, crest, or cloth anchors are allowed.
- Keep the model procedural and inexpensive; no GLTF/skeletal asset pipeline in this pass.
- Prefer faceted/tapered geometry over adding decorative box primitives.
- Preserve fixed visual hierarchy: cool steel + dark under-armor + crimson cloth + muted brass + cyan visor/magic. Player accent variation must not recolor the whole fighter.
- Do not redesign the menu, arena, Fireball VFX, classes, or balance in this pass.
- `npm run verify` must remain the repository gate.
- Visual success requires browser screenshots; unit tests alone cannot approve the character.

## Review Focus

Reviewers should look specifically for these failure modes:

1. Custom geometry produces non-finite vertices, invalid indices, degenerate triangles, black faces, or holes.
2. Rig keys survive but pivot origins move enough that existing animation rotations dislocate armor or make limbs orbit unnaturally.
3. Player accents overpower the fixed cyan/red/steel concept hierarchy.
4. The larger faceted first-person sword blocks the crosshair or targets during Guard, Cast, or slash extremes.
5. The model looks convincing from the menu's front angle but collapses, clips, or becomes box-like from side/back views.

---

## Task 1 — Lock the visual proportions and rig contract in pure data

**Files:**
- Create: `client/game/spellbladeDesign.mjs`
- Create: `client/game/spellbladeDesign.test.mjs`

### Interface

Export immutable data only; no Three.js import:

```js
export const SPELLBLADE_PALETTE = Object.freeze({
  darkArmor: 0x252b35,
  armor: 0x535d6d,
  armorLight: 0x7b8797,
  cloth: 0x762d35,
  leather: 0x4a3529,
  trim: 0x9b7b4a,
  blade: 0xc9d2dc,
  bladeRidge: 0x8793a2,
  magic: 0x55d9ff,
});

export const SPELLBLADE_PROPORTIONS = Object.freeze({
  bodyHeight: 2.04,
  shoulderSpan: 1.18,
  chestTopWidth: 0.82,
  waistWidth: 0.55,
  helmetWidth: 0.50,
  visorWidth: 0.34,
  bootWidth: 0.36,
  shinWidth: 0.27,
});

export const SPELLBLADE_SWORD = Object.freeze({
  bladeLength: 1.30,
  bladeWidth: 0.24,
  bladeThickness: 0.085,
  guardWidth: 0.66,
  gripLength: 0.34,
  pommelRadius: 0.12,
});

export const REQUIRED_SPELLBLADE_RIG_KEYS = Object.freeze([
  'visual', 'pelvis', 'torso', 'head', 'visor', 'tabardFront', 'tabardBack',
  'leftUpperArm', 'leftForearm', 'rightUpperArm', 'rightForearm',
  'leftThigh', 'leftShin', 'rightThigh', 'rightShin', 'sword',
  'magicAnchor', 'magic', 'magicHalo', 'accentMaterial',
]);
```

Numbers may move during screenshot tuning, but relationships are the contract.

### TDD steps

- [ ] Add `spellbladeDesign.test.mjs` first with assertions:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPELLBLADE_PALETTE,
  SPELLBLADE_PROPORTIONS,
  SPELLBLADE_SWORD,
  REQUIRED_SPELLBLADE_RIG_KEYS,
} from './spellbladeDesign.mjs';

test('Spellblade proportions encode the concept silhouette', () => {
  assert.ok(SPELLBLADE_PROPORTIONS.shoulderSpan > SPELLBLADE_PROPORTIONS.chestTopWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.chestTopWidth > SPELLBLADE_PROPORTIONS.waistWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.bootWidth > SPELLBLADE_PROPORTIONS.shinWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.visorWidth > SPELLBLADE_PROPORTIONS.helmetWidth * 0.55);
  assert.ok(SPELLBLADE_SWORD.bladeLength > SPELLBLADE_PROPORTIONS.bodyHeight * 0.55);
});

test('base palette keeps cyan, crimson, steel and brass roles distinct', () => {
  assert.notEqual(SPELLBLADE_PALETTE.magic, SPELLBLADE_PALETTE.cloth);
  assert.notEqual(SPELLBLADE_PALETTE.trim, SPELLBLADE_PALETTE.armor);
  assert.notEqual(SPELLBLADE_PALETTE.darkArmor, SPELLBLADE_PALETTE.armorLight);
});

test('rig contract keeps every pivot used by the current animation/menu code', () => {
  for (const key of ['visual', 'pelvis', 'torso', 'head', 'visor', 'sword', 'magicAnchor', 'tabardFront', 'tabardBack']) {
    assert.ok(REQUIRED_SPELLBLADE_RIG_KEYS.includes(key));
  }
  assert.equal(new Set(REQUIRED_SPELLBLADE_RIG_KEYS).size, REQUIRED_SPELLBLADE_RIG_KEYS.length);
});
```

- [ ] Run `node --test client/game/spellbladeDesign.test.mjs`; confirm RED because the module does not exist.
- [ ] Add `spellbladeDesign.mjs` with the exported constants above, freezing nested objects as needed.
- [ ] Run the focused test; confirm GREEN.
- [ ] Commit: `test: lock Spellblade visual proportions and rig contract`.

---

## Task 2 — Build testable faceted geometry primitives

**Files:**
- Create: `client/game/facetedGeometryData.mjs`
- Create: `client/game/facetedGeometryData.test.mjs`
- Create: `client/game/facetedGeometry.mjs`

### Pure geometry API

`facetedGeometryData.mjs` must not import Three.js. Use flat numeric arrays:

```js
export function taperedPrismData({
  height,
  topWidth,
  bottomWidth,
  topDepth,
  bottomDepth,
  topOffsetX = 0,
  topOffsetZ = 0,
});

export function wedgeData({ width, height, depth, slope = 0.35 });

export function bladeData({ length, width, thickness, tipLength, ridge = 0.28 });

export function geometryBounds(data);
export function validateGeometryData(data);
```

Each builder returns `{ positions, indices }`. Vertices should be duplicated where necessary for deliberately flat-shaded planes; do not optimize shared vertices prematurely.

### RED tests

- [ ] Add tests first covering finite values, valid triangle indices, positive dimensions, expected bounds, and invalid input rejection:

```js
function assertValid(data) {
  assert.ok(data.positions.length >= 9);
  assert.equal(data.positions.length % 3, 0);
  assert.equal(data.indices.length % 3, 0);
  assert.ok(data.positions.every(Number.isFinite));
  assert.ok(data.indices.every(Number.isInteger));
  const vertexCount = data.positions.length / 3;
  assert.ok(data.indices.every((index) => index >= 0 && index < vertexCount));
}

test('tapered prism narrows from shoulder/chest side toward waist', () => {
  const data = taperedPrismData({
    height: 0.6,
    topWidth: 0.82,
    bottomWidth: 0.55,
    topDepth: 0.46,
    bottomDepth: 0.38,
  });
  assertValid(data);
  const bounds = geometryBounds(data);
  assert.ok(Math.abs(bounds.size.y - 0.6) < 1e-9);
  assert.ok(Math.abs(bounds.size.x - 0.82) < 1e-9);
});

test('blade profile is broad, thin and ends at requested length', () => {
  const data = bladeData({ length: 1.3, width: 0.24, thickness: 0.085, tipLength: 0.28 });
  assertValid(data);
  const bounds = geometryBounds(data);
  assert.ok(Math.abs(bounds.size.y - 1.3) < 1e-9);
  assert.ok(bounds.size.x > bounds.size.z * 2);
});

test('geometry builders reject zero and non-finite dimensions', () => {
  assert.throws(() => taperedPrismData({ height: 0, topWidth: 1, bottomWidth: 1, topDepth: 1, bottomDepth: 1 }));
  assert.throws(() => bladeData({ length: Infinity, width: 1, thickness: 0.1, tipLength: 0.2 }));
});
```

- [ ] Run `node --test client/game/facetedGeometryData.test.mjs`; confirm RED.
- [ ] Implement the minimum pure geometry functions; keep the module under roughly 250 lines unless a clear need emerges.
- [ ] Run the focused tests; confirm GREEN.

### Three.js adapter

- [ ] Create `facetedGeometry.mjs` as a thin browser-only adapter:

```js
import * as THREE from 'three';

export function geometryFromData({ positions, indices }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function facetedMesh(data, material, { castShadow = true, receiveShadow = true } = {}) {
  const mesh = new THREE.Mesh(geometryFromData(data), material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}
```

- [ ] Run `node --check client/game/facetedGeometry.mjs` and `npm run check`.
- [ ] Commit: `feat: add faceted low-poly geometry primitives`.

---

## Task 3 — Build one shared hero sword for remote and first-person views

**Files:**
- Create: `client/game/SpellbladeSword.mjs`
- Modify: `client/game/SpellbladeModel.mjs`
- Modify: `client/game/WeaponView.mjs`
- Modify: `server/tests/client-shell.test.mjs`

### Shared builder

Export:

```js
export function createSpellbladeSword(materials, {
  axis = 'y',
  scale = 1,
  castShadow = true,
} = {});
```

The group must include named/semantic child meshes for `blade`, `ridge`, `guard`, `grip`, `pommel`, and `gem`. Build the blade with `bladeData()`, use tapered/wedge pieces for a substantial brass crossguard, and keep the red gem/inset visible.

`axis='y'` is for the remote rig. `axis='z'` may rotate the completed group for the first-person coordinate convention rather than maintaining a second sword model.

### RED structural contract

- [ ] Before production changes, extend `server/tests/client-shell.test.mjs` with a source contract:

```js
test('remote and first-person Spellblade use the same hero sword builder', async () => {
  const model = await read('client/game/SpellbladeModel.mjs');
  const weapon = await read('client/game/WeaponView.mjs');
  const sword = await read('client/game/SpellbladeSword.mjs').catch(() => '');

  assert.match(model, /createSpellbladeSword/);
  assert.match(weapon, /createSpellbladeSword/);
  assert.match(sword, /bladeData/);
  assert.match(sword, /gem/);
});
```

- [ ] Run `node --test server/tests/client-shell.test.mjs`; confirm this new test is RED.
- [ ] Add `SpellbladeSword.mjs` and replace both duplicated `makeSword()` implementations.
- [ ] Preserve the current remote sword pivot and first-person `swordPivot` interfaces.
- [ ] Run the focused structural test plus `weaponPose.test.mjs`; confirm GREEN.
- [ ] Run `npm run check`.
- [ ] Commit: `feat: share the faceted Spellblade hero sword`.

---

## Task 4 — Rebuild the remote Spellblade silhouette without breaking its pivots

**Files:**
- Modify: `client/game/SpellbladeModel.mjs`
- Modify: `client/game/spellbladeDesign.mjs`
- Modify: `server/tests/client-shell.test.mjs`

### Construction order

Keep current pivot origins initially. Replace visual children around them in this order so animation breakage is easy to isolate:

1. Helmet: dark faceted shell, lighter brow/face plates, cyan visor seam, red crest.
2. Torso: tapered chest/waist core with overlapping light armor plates.
3. Pauldrons: outward wedges/frustums with brass trim planes.
4. Arms: tapered upper-arm armor, dark elbow gap, faceted forearm bracer, gauntlet.
5. Legs: tapered thigh/shin armor, visible dark knee gap, broad flared boots.
6. Cloth: scarf/neck wrap, front tabard, longer back tabard; simple planar/wedge geometry is acceptable here.
7. Magic hand: keep an armored hand underneath the cyan core/halo.

### Required userData compatibility

- [ ] Add a source test first that reads `SpellbladeModel.mjs` and checks every `REQUIRED_SPELLBLADE_RIG_KEYS` name is assigned into `root.userData`. The test should import only `spellbladeDesign.mjs`, not Three.js.
- [ ] Add a source contract that the character uses the faceted adapter/builders and does not define its own local `function box(` helper.
- [ ] Run the focused tests and confirm RED before replacing the model.
- [ ] Rebuild `SpellbladeModel.mjs` using `spellbladeDesign`, `facetedGeometryData`, `facetedGeometry`, and `createSpellbladeSword`.
- [ ] Keep `BoxGeometry` only where a literal rectangular shape is visually correct (for example a thin belt strip); the major head/torso/shoulder/limb/boot silhouettes must not depend on boxes.
- [ ] Give important meshes stable names (`helmet-shell`, `visor`, `crest`, `left-pauldron`, `right-pauldron`, `front-tabard`, `back-tabard`, `left-boot`, `right-boot`) to make browser debugging practical.
- [ ] Run `npm test` and `npm run check`.
- [ ] Commit: `feat: rebuild the base Spellblade faceted silhouette`.

---

## Task 5 — Make remote pose targets pure and retune for the new proportions

**Files:**
- Create: `client/game/remoteSpellbladePose.mjs`
- Create: `client/game/remoteSpellbladePose.test.mjs`
- Modify: `client/game/RemotePlayers.mjs`

### Pure interface

Extract the current local variables from `animateRig()` into:

```js
export function resolveRemoteSpellbladePose({
  state,
  player,
  serverNow,
  localTime,
});
```

Return a plain object:

```js
{
  visual: { y, rx, ry, rz },
  torso: { rx, ry, rz },
  head: { rx, ry, rz },
  leftUpperArm: { rx, ry, rz },
  leftForearm: { rx, ry, rz },
  rightUpperArm: { rx, ry, rz },
  rightForearm: { rx, ry, rz },
  leftThigh: { rx, rz },
  rightThigh: { rx, rz },
  leftShin: { rx },
  rightShin: { rx },
  sword: { rx, ry, rz },
  tabardX,
  magicScale,
}
```

### RED pose-readability tests

- [ ] Add tests first:

```js
test('guard moves the sword across the body instead of resembling idle', () => {
  const idle = resolveRemoteSpellbladePose({ state: 'idle', player: base, serverNow: 10, localTime: 10 });
  const guard = resolveRemoteSpellbladePose({ state: 'guard', player: base, serverNow: 10, localTime: 10 });
  assert.ok(Math.abs(guard.sword.rz - idle.sword.rz) > 0.8);
  assert.ok(Math.abs(guard.rightForearm.rx - idle.rightForearm.rx) > 0.6);
});

test('cast clearly leads with the sorcery arm', () => {
  const cast = resolveRemoteSpellbladePose({ state: 'cast', player: base, serverNow: 10, localTime: 10 });
  assert.ok(cast.leftUpperArm.rx < -1.0);
  assert.ok(cast.magicScale > 1.4);
});

test('dash creates a compressed forward silhouette', () => {
  const dash = resolveRemoteSpellbladePose({ state: 'dash', player: base, serverNow: 10, localTime: 10 });
  assert.ok(dash.visual.rx < -0.15);
  assert.ok(dash.tabardX < -0.25);
});

test('run drives opposite legs', () => {
  const run = resolveRemoteSpellbladePose({ state: 'run', player: { ...base, velocity: { x: 7, y: 0, z: 0 } }, serverNow: 10, localTime: 10.1 });
  assert.ok(run.leftThigh.rx * run.rightThigh.rx <= 0);
});
```

Also assert every returned number is finite for every state.

- [ ] Run the new test; confirm RED.
- [ ] Move pose-target math out of `RemotePlayers.mjs` without changing interpolation, state resolution, or damp rates.
- [ ] Retune only values necessary to make the new shoulder/boot/sword proportions read clearly.
- [ ] Preserve the existing three-strike timing from `attackMotion()`.
- [ ] Run `node --test client/game/remoteSpellbladePose.test.mjs client/game/spellbladePose.test.mjs` and then `npm test`.
- [ ] Commit: `refactor: make remote Spellblade pose targets testable`.

---

## Task 6 — Rebuild first-person gauntlets around the shared sword

**Files:**
- Modify: `client/game/WeaponView.mjs`
- Modify: `client/game/weaponPose.mjs` only if screenshot evidence requires framing changes
- Modify: `client/game/weaponPose.test.mjs` only to express a real readability requirement, never to rubber-stamp a new constant

### Implementation

- [ ] Keep `WeaponView` public methods unchanged: `setAttack`, `setGuard`, `cast`, `dash`, `wallImpact`, `parry`, `update`.
- [ ] Replace `makeGauntletedArm()` box stacks with the same tapered/wedge vocabulary used by the remote arms.
- [ ] Reuse `createSpellbladeSword()`; do not introduce a first-person-only sword shape.
- [ ] Preserve the dark sleeve/under-armor behind the metal bracer so the arm has joint separation.
- [ ] Make the right gauntlet visibly grip the sword rather than ending in a floating block.
- [ ] Keep the cyan left-hand effect attached to visible armor.
- [ ] Run existing `weaponPose.test.mjs` before and after changes. If all tests pass but the sword visually blocks too much screen, change `FIRST_PERSON_WEAPON_SCALE` or pose offsets only after screenshot review in Task 8.
- [ ] Run `npm run check && node --test client/game/weaponPose.test.mjs`.
- [ ] Commit: `feat: bring first-person arms into the Spellblade design language`.

---

## Task 7 — Add local Chrome visual evidence to PRs

**Files:**
- Modify: `scripts/capture-public-arena.mjs`
- Create: `.github/workflows/visual-review.yml`
- Modify: `server/tests/deployment-config.test.mjs`

### Capture script additions

Reuse the existing CDP harness rather than adding Playwright/Puppeteer dependencies.

- [ ] Add a `trustedDrag(selector, dx, dy)` helper using `Input.dispatchMouseEvent` with `mousePressed`, several `mouseMoved` steps, and `mouseReleased`.
- [ ] After `public-game-menu.png`, drag `#menu-spellblade canvas` roughly 360–430 px horizontally and capture `public-game-menu-back.png`; double-click/reset or navigate fresh afterward.
- [ ] Keep existing `public-game-practice-dummy.png` as the remote Guard/combat-distance evidence.
- [ ] Keep `public-game-bot-duel.png` as first-person weapon evidence.
- [ ] Do not add fragile timing-dependent Cast screenshots unless the current deterministic automation can force one without gameplay changes.

### PR visual-review workflow

Create `.github/workflows/visual-review.yml` triggered on pull requests that touch `client/game/**`, `client/menu/**`, `scripts/capture-public-arena.mjs`, or the workflow itself.

Workflow behavior:

```yaml
name: visual-review
on:
  pull_request:
    paths:
      - 'client/game/**'
      - 'client/menu/**'
      - 'scripts/capture-public-arena.mjs'
      - '.github/workflows/visual-review.yml'

jobs:
  chrome-capture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm run verify
      - name: Start local game server
        run: |
          PORT=3001 HOST=127.0.0.1 node server/src/server.mjs > /tmp/ss-server.log 2>&1 &
          echo $! > /tmp/ss-server.pid
          for i in {1..40}; do
            curl -fsS http://127.0.0.1:3001/health && exit 0
            sleep 0.25
          done
          cat /tmp/ss-server.log
          exit 1
      - name: Capture current branch in Chrome
        env:
          PUBLIC_URL: http://127.0.0.1:3001
          CHROME_BIN: /usr/bin/google-chrome
        run: node scripts/capture-public-arena.mjs
      - uses: actions/upload-artifact@v4
        with:
          name: spellblade-visual-review
          path: |
            public-game-*.png
            public-game-browser-report.json
```

If Chrome lives at another standard runner path, copy the existing public workflow's discovery step rather than hard-coding `/usr/bin/google-chrome`.

### RED deployment contract

- [ ] First extend `server/tests/deployment-config.test.mjs` to require `visual-review.yml`, `public-game-menu-back.png`, and `trustedDrag`.
- [ ] Run that test and confirm RED.
- [ ] Add the workflow/capture changes and rerun; confirm GREEN.
- [ ] Commit: `test: capture Spellblade visual evidence in pull requests`.

---

## Task 8 — Browser review and correction pass

**Files:**
- Modify only files proven necessary by screenshots: normally `SpellbladeModel.mjs`, `remoteSpellbladePose.mjs`, `WeaponView.mjs`, `weaponPose.mjs`, or `MenuScene.mjs`.

This task is deliberately not automated into arbitrary image metrics. Human visual review is the correct test.

- [ ] Open/download the PR visual-review artifact.
- [ ] Inspect `public-game-menu.png` against the supplied concept sheet using this rubric:
  - enclosed helmet with readable cyan visor seam;
  - red crest/scarf/tabard visible without dominating armor;
  - broad angled shoulders;
  - chest visibly tapers into narrower waist;
  - boots/gauntlets have weight;
  - sword is broad/faceted and not a rectangular plank;
  - cyan off-hand is clearly a magic hand, not a floating debug orb.
- [ ] Inspect `public-game-menu-back.png`:
  - helmet/back silhouette still intentional;
  - back tabard creates vertical breakup;
  - pauldrons and boots do not clip into torso/legs;
  - no major surface vanishes due to winding/normal mistakes.
- [ ] Inspect `public-game-practice-dummy.png`:
  - remote character reads at combat distance;
  - Guard silhouette is obvious without HUD explanation;
  - visor/cloth/sword survive distance without visual noise.
- [ ] Inspect `public-game-bot-duel.png`:
  - first-person sword/gauntlet clearly belongs to the same fighter;
  - crosshair and center target area remain clear;
  - Guard/slash/cast extremes do not fill most of the viewport.
- [ ] Correct only defects visible in evidence. Avoid adding detail simply because there is unused polygon budget.
- [ ] Rerun the visual workflow and repeat until the four views pass the rubric.
- [ ] If menu framing is the problem rather than model geometry, adjust only `MenuScene` camera/light values; do not redesign the stage.
- [ ] Commit each coherent correction with a descriptive message such as `fix: strengthen Spellblade helmet silhouette` or `fix: clear first-person sword framing`.

---

## Task 9 — Full verification, PR review, merge, and deployed proof

**Files:**
- Modify: `.github/workflows/public-render-check.yml` only after the character implementation is ready to merge
- Modify: `server/tests/deployment-config.test.mjs` to fingerprint the new visual modules

### Repository proof

- [ ] Run `npm run verify` on the exact final implementation head.
- [ ] Confirm the PR visual-review workflow is green and its browser report has zero browser errors and zero HTTP errors.
- [ ] Review the full diff for accidental gameplay/server changes. Any server/gameplay change not required for presentation is a blocker.
- [ ] Confirm no duplicate sword builder remains in `SpellbladeModel.mjs` or `WeaponView.mjs`.
- [ ] Confirm the major model silhouette is not primarily `BoxGeometry`.

### Public Render fingerprint

After merge, sync the dedicated `test/public-arena-capture` branch to the new `main` without rewriting history.

- [ ] Add public workflow fingerprint checks for the new durable source markers, for example:
  - `facetedGeometryData.mjs`
  - `SpellbladeSword.mjs`
  - `createSpellbladeSword`
  - `remoteSpellbladePose.mjs`
- [ ] Update the deployment-config test first so the stale fingerprint fails RED, then update the workflow to GREEN.
- [ ] Trigger the public Render browser verifier.
- [ ] Require current revision fingerprint + WSS handshake + Chrome capture success.
- [ ] Download the fresh Render screenshots and compare the deployed menu/Practice/Bot Duel views against the PR-local evidence.
- [ ] Verify the browser report contains `browserErrors: []` and `httpErrors: []`.
- [ ] If deployed screenshots disagree with local evidence, treat that as a bug; do not declare the character pass finished until the public build matches.

---

## Expected final file shape

After implementation, the visual character code should remain small enough to reason about:

```text
client/game/
  spellbladeDesign.mjs              # pure palette/proportions/contracts
  spellbladeDesign.test.mjs
  facetedGeometryData.mjs           # pure low-poly vertex/index math
  facetedGeometryData.test.mjs
  facetedGeometry.mjs               # thin Three.js adapter
  SpellbladeSword.mjs               # one shared hero sword
  SpellbladeModel.mjs               # remote/menu rig assembly
  remoteSpellbladePose.mjs          # pure pose targets
  remoteSpellbladePose.test.mjs
  RemotePlayers.mjs                 # interpolation + damping + rig application
  WeaponView.mjs                    # first-person rig assembly/application
  weaponPose.mjs                    # existing first-person pose logic
```

Do not add a generic scene graph DSL, asset compiler, ECS, skeletal animation package, texture pipeline, or external modeling dependency for this pass.

## Completion standard

The pass is complete only when the character looks like the same design family as the supplied concept from front, side/back, remote combat distance, and first-person view; Guard/Cast/Attack/Dash remain readable; existing gameplay tests remain green; and the deployed Render build shows the same result without browser errors.