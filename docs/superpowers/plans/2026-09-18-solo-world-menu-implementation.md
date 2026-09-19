# Solo Modes, Castleward, and Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative one-tab solo play, server-controlled bot/practice actors, map/mode registries, the Castleward hill-town/castle arena, and a medieval Spellblade-centered main menu without regressing public FFA.

**Architecture:** Keep one authoritative `Room`/combat simulation and parameterize it with explicit mode and world definitions. Server-owned actors use the same combat verbs as human players; clients receive authoritative `mode`, `worldId`, and `actorKind`. World presentation is selected by a renderer factory, while the front-end navigation is split out of `client/main.mjs` into menu/router modules.

**Tech Stack:** Node.js 22+, native HTTP/WebSocket server, browser ES modules, Three.js 0.169 via import map, `node:test`, GitHub Actions, Render.

**Spec:** `docs/superpowers/specs/2026-09-18-solo-world-menu-architecture.md`

## Global Constraints

- Preserve the base Spellblade kit: sword combo, Guard/Perfect Parry, Fireball, Dash, jump/movement, existing health/cooldown/respawn rules.
- Solo play must use the same server-authoritative movement/combat code as PvP.
- `FFA`, `BOT_DUEL`, and `PRACTICE` are stable protocol-level mode IDs.
- Initial actor kinds are `human`, `bot`, and `dummy`.
- Castleward is a compact 45–55 m medieval hill-town/castle arena; normal route loops do not require Dash.
- Medieval material language comes first; magic remains accent-level.
- No classes, progression, account economy, cosmetic inventory, bot difficulty selector, campaign, or mobile combat in this phase.
- Do not repeatedly wake the Render free-tier service. Use CI for intermediate validation and one batched public verification after the structural phase is green.
- Every behavior change follows red-green TDD where practical; every PR must pass `npm run verify` before merge.

## Review Focus

1. **Mode spoofing / incompatible room selection:** Quick Play must never return solo rooms, and clients must not mutate a room's mode/world after creation. Pin in Tasks 1–2.
2. **Server actor/session confusion:** bots/dummies must not count as connected human sessions, reconnect voters, or cleanup blockers. Pin in Tasks 2–4.
3. **World disagreement:** server collision/spawns and client renderer must use the same authoritative `worldId`; unsupported IDs must fail explicitly. Pin in Tasks 1, 5, and 6.
4. **Bot authority bypass:** bot Attack/Guard/Cast/Dash must obey the exact existing cooldown/range/LOS/parry pipeline. Pin in Task 3.
5. **Solo recovery/UI transitions:** reconnect, expired session, leaving Practice, and invite-room URLs must still lead to the correct screen without a ghost lobby. Pin in Tasks 2, 7, and 8.

---

### Task 1: Introduce Mode and World Registries Without Changing FFA Behavior

**Files:**
- Create: `shared/src/modes.mjs`
- Create: `shared/worlds/registry.mjs`
- Create: `shared/worlds/shatteredKeep.mjs`
- Modify: `shared/src/map.mjs`
- Modify: `server/src/game/Room.mjs`
- Modify: `server/src/rooms/RoomManager.mjs`
- Modify: `server/src/server.mjs`
- Test: `shared/src/modes.test.mjs`
- Test: `server/tests/room.test.mjs`
- Test: `server/tests/integration.test.mjs`

**Interfaces:**
- Produces: `GAME_MODES`, `getModePolicy(modeId)`, `WORLD_IDS`, `getWorld(worldId)`, room properties `mode`, `worldId`, actor property `actorKind`.
- Preserves: `SHATTERED_KEEP` and `SPAWN_POINTS` exports from `shared/src/map.mjs` as compatibility re-exports during migration.

- [ ] **Step 1: Write failing mode/world registry tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODES, getModePolicy } from '../../shared/src/modes.mjs';
import { getWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';

test('FFA policy preserves the current multiplayer start rules', () => {
  const ffa = getModePolicy(GAME_MODES.FFA);
  assert.equal(ffa.minHumansToStart, 2);
  assert.equal(ffa.scoreToWin, 10);
  assert.equal(ffa.matchSeconds, 360);
  assert.equal(ffa.autoStart, false);
});

test('world registry rejects unknown ids instead of silently choosing a map', () => {
  assert.equal(WORLD_IDS.SHATTERED_KEEP, 'shattered-keep');
  assert.throws(() => getWorld('not-a-world'), /Unknown world/);
});
```

Add to `server/tests/room.test.mjs`:

```js
test('room has immutable mode/world identity and humans are marked human', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  const player = room.addPlayer({ id: 'p1', token: 't1', name: 'A' }, 0);
  assert.equal(room.mode, 'FFA');
  assert.equal(room.worldId, 'shattered-keep');
  assert.equal(player.actorKind, 'human');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:
```bash
node --test shared/src/modes.test.mjs server/tests/room.test.mjs
```
Expected: FAIL because the mode/world registry and Room constructor options do not exist.

- [ ] **Step 3: Implement stable registries and compatibility exports**

`shared/src/modes.mjs`:

```js
export const GAME_MODES = Object.freeze({
  FFA: 'FFA',
  BOT_DUEL: 'BOT_DUEL',
  PRACTICE: 'PRACTICE',
});

const POLICIES = Object.freeze({
  FFA: Object.freeze({ id: 'FFA', minHumansToStart: 2, botCount: 0, scored: true, timed: true, scoreToWin: 10, matchSeconds: 360, autoStart: false, allowRematchVote: true }),
  BOT_DUEL: Object.freeze({ id: 'BOT_DUEL', minHumansToStart: 1, botCount: 1, scored: true, timed: true, scoreToWin: 10, matchSeconds: 360, autoStart: true, allowRematchVote: false }),
  PRACTICE: Object.freeze({ id: 'PRACTICE', minHumansToStart: 1, botCount: 0, scored: false, timed: false, scoreToWin: null, matchSeconds: null, autoStart: true, allowRematchVote: false }),
});

export function getModePolicy(id) {
  const policy = POLICIES[id];
  if (!policy) throw new Error(`Unknown game mode: ${id}`);
  return policy;
}
```

Move the existing Keep definition into `shared/worlds/shatteredKeep.mjs`, export it as `SHATTERED_KEEP`, and add:

```js
export const WORLD_IDS = Object.freeze({ SHATTERED_KEEP: 'shattered-keep', CASTLEWARD: 'castleward' });
const WORLDS = new Map([[WORLD_IDS.SHATTERED_KEEP, SHATTERED_KEEP]]);
export function getWorld(id) {
  const world = WORLDS.get(id);
  if (!world) throw new Error(`Unknown world: ${id}`);
  return world;
}
```

`shared/src/map.mjs` becomes a compatibility re-export of Keep plus `KEEP_HORIZONTAL_SCALE`/`SPAWN_POINTS` until Castleward migration is complete.

Update `Room` constructor to resolve policy/world once, store `mode`, `worldId`, `policy`, `world`, and set `actorKind: 'human'` in `addPlayer`. Replace direct Keep spawn reads with `this.world.spawnPoints`.

- [ ] **Step 4: Parameterize `RoomManager` and protocol metadata while keeping existing calls identical**

Implement one internal creator:

```js
#create({ isPrivate, mode = GAME_MODES.FFA, worldId = WORLD_IDS.SHATTERED_KEEP }, nowSec) {
  const room = new Room(code, { isPrivate, mode, worldId });
  ...
}
```

Ensure `quickPlay()` filters `room.mode === GAME_MODES.FFA`.

Add `mode` and `worldId` to `joined`, `lobby`, and `snapshot`; add `actorKind` to player snapshot rows.

- [ ] **Step 5: Run focused and full verification**

Run:
```bash
node --test shared/src/modes.test.mjs server/tests/room.test.mjs server/tests/integration.test.mjs
npm run verify
```
Expected: all pass; existing two-human FFA behavior remains unchanged.

- [ ] **Step 6: Commit and open PR**

```bash
git add shared server
git commit -m "refactor: add explicit mode and world identity"
```

PR title: `Add explicit game mode and world registries`.

---

### Task 2: Add Authoritative Solo Room Creation and Server-Owned Actor Plumbing

**Files:**
- Modify: `server/src/game/Room.mjs`
- Modify: `server/src/rooms/RoomManager.mjs`
- Modify: `server/src/server.mjs`
- Modify: `client/network/GameSocket.mjs`
- Test: `server/tests/solo-room.test.mjs`
- Test: `server/tests/integration.test.mjs`

**Interfaces:**
- Consumes: `GAME_MODES`, `getModePolicy`, room `mode/worldId` from Task 1.
- Produces: `Room.addServerActor({ id, name, actorKind }, nowSec)`, `RoomManager.createSoloRoom(mode, nowSec)`, `GameSocket.startSolo(mode, name)`.

- [ ] **Step 1: Write failing lifecycle tests**

```js
test('Bot Duel starts from one network human and one server bot', () => {
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  const human = room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.connectedCount(), 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
});

test('Practice starts with one human and never times out', () => {
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);
  room.tick(0.01);
  assert.equal(room.state, 'PLAYING');
  room.tick(9999);
  assert.equal(room.state, 'PLAYING');
});

test('Quick Play never selects a solo room', () => {
  const solo = manager.createSoloRoom('BOT_DUEL', 0);
  const quick = manager.quickPlay(0);
  assert.notEqual(quick.code, solo.code);
  assert.equal(quick.mode, 'FFA');
});
```

- [ ] **Step 2: Run and verify RED**

Run:
```bash
node --test server/tests/solo-room.test.mjs
```
Expected: FAIL because solo creation/server actors do not exist.

- [ ] **Step 3: Implement actor/session separation and mode-aware start logic**

Add `addServerActor()` that creates a normal combat state but has `token: null`, `connected: false`, `disconnectExpiresAt: null`, and `actorKind` constrained to `bot|dummy`.

Add:

```js
humanCount() {
  return [...this.players.values()].filter((p) => p.actorKind === 'human' && p.connected).length;
}
```

Use `humanCount()` for network-start/rematch quorum. Mode population logic may count bots for scoring but never as connected humans.

For auto-start policies, set a short `COUNTDOWN` for Bot Duel and direct `PLAYING` start for Practice (or `COUNTDOWN` with zero duration); the implementation must satisfy the tests and never show `WAITING FOR ANOTHER SPELLBLADE` for solo rooms.

- [ ] **Step 4: Add `startSolo` protocol handling**

`GameSocket.mjs`:

```js
startSolo(mode, name) { this.send({ type: 'startSolo', mode, name }); }
```

Server handler accepts only `BOT_DUEL` or `PRACTICE`; rejects other strings with `{type:'error', message:'Unknown solo mode'}`. Create a private non-matchmade room, join the human, provision mode actors, then attach normally.

- [ ] **Step 5: Add integration assertions for reconnect and actor/session separation**

Use the existing integration WebSocket helper to prove a single socket can send `startSolo(PRACTICE)` and receive `joined` then a `PLAYING` snapshot without a second socket; reconnect token resumes the same mode/world.

- [ ] **Step 6: Verify and commit**

Run:
```bash
node --test server/tests/solo-room.test.mjs server/tests/integration.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git commit -am "feat: add authoritative solo rooms"
```

PR title: `Add one-tab authoritative solo room lifecycle`.

---

### Task 3: Implement the Basic Bot Controller Through Existing Combat Authority

**Files:**
- Create: `server/src/ai/BotController.mjs`
- Modify: `server/src/game/combat.mjs`
- Modify: `server/src/server.mjs`
- Modify: `server/src/game/Room.mjs`
- Test: `server/tests/bot-controller.test.mjs`
- Test: `server/tests/combat.test.mjs`

**Interfaces:**
- Consumes: `beginAttack`, `endAttack`, `setGuard`, `tryCastFireball`, `tryDash`, server actor states.
- Produces: `stepBotControllers(room, nowSec, world)`; bot per-actor AI state in `player.ai`.

- [ ] **Step 1: Write tests proving the bot emits intentions, not damage**

```js
test('bot closes distance and attacks through beginAttack when in range', () => {
  const { room, bot, human } = botDuelFixture();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.4 };
  stepBotControllers(room, 1, room.world);
  assert.equal(bot.attackHeld, true);
  assert.equal(human.health, 100); // damage still waits for normal combat strike timing
});

test('bot Fireball still obeys authoritative cooldown', () => {
  const { room, bot } = botDuelFixture();
  bot.fireballReadyAt = 10;
  const before = room.projectiles.size;
  stepBotControllers(room, 5, room.world);
  assert.equal(room.projectiles.size, before);
});

test('bot does not perfect-parry with zero reaction latency by default', () => {
  const { room, bot } = botDuelFixture();
  stepBotControllers(room, 1, room.world);
  assert.ok(bot.ai.nextDefensiveDecisionAt > 1);
});
```

- [ ] **Step 2: Run RED**

Run:
```bash
node --test server/tests/bot-controller.test.mjs
```
Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement low-frequency decisions with continuous movement input**

Controller state:

```js
player.ai = {
  nextDecisionAt: nowSec,
  nextDefensiveDecisionAt: nowSec + 0.2,
  strafeSign: 1,
  aimErrorYaw: 0,
};
```

At 5–10 Hz, acquire nearest alive hostile human, compute target distance/yaw, then update `bot.input.forward/right/yaw/pitch`. Use existing combat functions for actions. Do not mutate target HP, score, cooldown timestamps, or projectile maps directly except through those functions.

Use bounded deterministic-ish noise derived from actor id/tick where possible so tests can inject a `random` function.

- [ ] **Step 4: Call bot decisions before `stepRoom()` movement/combat resolution**

In the authoritative tick, for every `PLAYING` room call `stepBotControllers(room, time, room.world)` before `stepRoom(...)`.

- [ ] **Step 5: Add authority regression tests**

Reuse existing combat fixtures to prove bot sword attacks respect Guard/parry and bot casts create the same projectile type/event as humans.

- [ ] **Step 6: Verify and commit**

Run:
```bash
node --test server/tests/bot-controller.test.mjs server/tests/combat.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git add server/src/ai server/src/game server/src/server.mjs server/tests
git commit -m "feat: add authoritative Spellblade bot controller"
```

PR title: `Add basic server-authoritative Bot Duel opponent`.

---

### Task 4: Add Practice Yard Utilities and Training Dummy Modes

**Files:**
- Create: `server/src/game/practice.mjs`
- Modify: `server/src/server.mjs`
- Modify: `client/network/GameSocket.mjs`
- Test: `server/tests/practice.test.mjs`

**Interfaces:**
- Produces server functions: `resetPracticePlayer(room, playerId, nowSec)`, `spawnPracticeDummy(room, mode, nowSec)`, `removePracticeDummy(room)`, `setPracticeDummyMode(room, mode)`.
- Produces client socket helpers matching practice message names.

- [ ] **Step 1: Write mode-gating and bounded-actor tests**

```js
test('practice reset is rejected outside Practice', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  assert.equal(resetPracticePlayer(room, 'p1', 1), false);
});

test('Practice reset restores health, Guard stamina and cooldowns', () => {
  const { room, human } = practiceFixture();
  human.health = 12;
  human.guardStamina = 9;
  human.fireballReadyAt = 99;
  human.dashReadyAt = 99;
  assert.equal(resetPracticePlayer(room, human.id, 5), true);
  assert.equal(human.health, 100);
  assert.equal(human.guardStamina, 100);
  assert.ok(human.fireballReadyAt <= 5);
  assert.ok(human.dashReadyAt <= 5);
});

test('Practice keeps at most one training dummy', () => {
  const { room } = practiceFixture();
  spawnPracticeDummy(room, 'PASSIVE', 0);
  spawnPracticeDummy(room, 'GUARDING', 0);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'dummy').length, 1);
});
```

- [ ] **Step 2: Run RED**

Run:
```bash
node --test server/tests/practice.test.mjs
```
Expected: FAIL because practice utility module does not exist.

- [ ] **Step 3: Implement utilities and dummy behavior**

Dummy modes are constants `PASSIVE`, `GUARDING`, `FIGHTS_BACK`.

- Passive: zero movement, no Guard/Attack.
- Guarding: zero movement, `setGuard(room, dummy.id, true, nowSec)` when stamina allows; never manufactures Perfect Parry timestamps.
- Fights Back: reuse bot controller with a constrained aggression profile.

Reset uses a safe spawn from `room.world.spawnPoints`, clears projectiles owned by the player if needed, and uses the same fresh-combat-state helper Room uses for respawns.

- [ ] **Step 4: Wire explicit practice-only messages**

Add `GameSocket` helpers:

```js
practiceResetPlayer() { this.send({ type: 'practiceResetPlayer' }); }
practiceSpawnDummy(mode = 'PASSIVE') { this.send({ type: 'practiceSpawnDummy', mode }); }
practiceRemoveDummy() { this.send({ type: 'practiceRemoveDummy' }); }
practiceSetDummyMode(mode) { this.send({ type: 'practiceSetDummyMode', mode }); }
```

Server rejects these outside Practice and clamps mode to the three allowed values.

- [ ] **Step 5: Verify and commit**

Run:
```bash
node --test server/tests/practice.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git commit -am "feat: add Practice Yard controls and dummies"
```

PR title: `Add authoritative Practice Yard utilities`.

---

### Task 5: Create Castleward Gameplay Geometry and Make World Selection Truly Per-Room

**Files:**
- Create: `shared/worlds/castleward.mjs`
- Modify: `shared/worlds/registry.mjs`
- Modify: `server/src/server.mjs`
- Modify: `server/src/game/combat.mjs` only where a global world argument remains
- Test: `shared/src/castleward.test.mjs`
- Test: `server/tests/world-selection.test.mjs`

**Interfaces:**
- Produces: `CASTLEWARD` world object with `id`, `name`, `floors`, `ramps`, `solids`, `spawnPoints`, `abyssY/worldBounds`, `zones`, and optional `navigationHints`.
- `stepRoom` receives `room.world` rather than a server-global map.

- [ ] **Step 1: Write world contract and traversal-envelope tests**

```js
test('Castleward is a compact 45-55m arena with safe spawns', () => {
  const xs = CASTLEWARD.floors.flatMap((f) => [f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2]);
  const zs = CASTLEWARD.floors.flatMap((f) => [f.center[2] - f.size[2] / 2, f.center[2] + f.size[2] / 2]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 55);
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 55);
  assert.ok(CASTLEWARD.spawnPoints.length >= 10);
  for (const spawn of CASTLEWARD.spawnPoints) assert.ok(spawn.y >= 0);
});

test('Castleward exposes required semantic zones', () => {
  assert.deepEqual(new Set(CASTLEWARD.zones.map((z) => z.id)), new Set(['town-green', 'castle-bailey', 'west-village', 'east-meadow', 'south-road']));
});
```

Add a movement simulation test for at least the Town Green -> Castle Bailey and Town Green -> East Meadow routes using normal movement/jump and no Dash.

- [ ] **Step 2: Run RED**

Run:
```bash
node --test shared/src/castleward.test.mjs server/tests/world-selection.test.mjs
```
Expected: FAIL because Castleward is not registered and room simulation still has global-world assumptions.

- [ ] **Step 3: Build collision-friendly Castleward topology**

Use broad rectangular floors/ramps/solids compatible with existing movement. Establish central Town Green, north castle gate/bailey/wall walk, west lane, east meadow/chapel, south road. Use believable boundary solids rather than abyss on every side.

Do not add decorative non-collision overhangs that look solid in gameplay; gameplay-relevant buildings/walls must have corresponding solids.

- [ ] **Step 4: Make server simulation resolve `room.world` each tick**

Remove the default `world = SHATTERED_KEEP` coupling from runtime room stepping. A test with two simultaneously created rooms using different world IDs must prove each player collides/spawns against its own world.

- [ ] **Step 5: Make Castleward the default for newly created FFA/solo rooms while retaining Keep registry access**

Change RoomManager default world ID to `castleward`; tests that explicitly need Keep pass `worldId: 'shattered-keep'`.

- [ ] **Step 6: Verify and commit**

Run:
```bash
node --test shared/src/castleward.test.mjs server/tests/world-selection.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git add shared server
git commit -m "feat: add Castleward gameplay world"
```

PR title: `Add Castleward as the default authoritative arena`.

---

### Task 6: Add Client World Renderer Factory and Castleward Medieval Presentation

**Files:**
- Create: `client/worlds/WorldRendererFactory.mjs`
- Create: `client/worlds/CastlewardRenderer.mjs`
- Create: `client/worlds/ShatteredKeepRenderer.mjs`
- Create: `client/worlds/castlewardDecor.mjs`
- Modify: `client/game/WorldRenderer.mjs` into compatibility wrapper or remove after callers migrate
- Modify: `client/game/GameRuntime.mjs`
- Modify: `package.json`
- Test: `client/worlds/worldRendererFactory.test.mjs`
- Test: `client/worlds/castlewardDecor.test.mjs`

**Interfaces:**
- Produces: `createWorldRenderer(worldId, scene)` and renderer instances exposing `update(timeSec)` and `dispose()`.
- Consumes authoritative `snapshot.worldId`.

- [ ] **Step 1: Expand test script to include client world/menu tests**

Change the test command to include:

```json
"test": "node --test client/game/*.test.mjs client/worlds/*.test.mjs client/menu/*.test.mjs shared/src/*.test.mjs server/tests/*.test.mjs"
```

Do not create empty directories solely for the glob; create the world tests in this task and menu tests in Task 7 before final verification.

- [ ] **Step 2: Write renderer selection tests**

```js
test('renderer factory selects Castleward and Keep explicitly', () => {
  assert.equal(rendererKeyForWorld('castleward'), 'castleward');
  assert.equal(rendererKeyForWorld('shattered-keep'), 'shattered-keep');
  assert.throws(() => rendererKeyForWorld('unknown'), /Unsupported world/);
});
```

Decor-plan tests assert bounded counts and medieval categories:

```js
const plan = buildCastlewardDecorPlan(1337);
assert.ok(plan.houses.length >= 4 && plan.houses.length <= 10);
assert.ok(plan.trees.length <= 24);
assert.ok(plan.torches.length <= 20);
assert.ok(plan.castlePieces.length > 0);
```

- [ ] **Step 3: Run RED**

Run:
```bash
node --test client/worlds/*.test.mjs
```
Expected: FAIL because factory/decor modules do not exist.

- [ ] **Step 4: Extract Keep renderer without behavior changes**

Move existing `WorldRenderer` logic to `ShatteredKeepRenderer`; preserve its update semantics. Implement factory explicit map lookup; no fallback to Keep for unknown IDs.

- [ ] **Step 5: Build Castleward renderer from authoritative geometry plus deterministic decor**

Use shared/practical geometry:
- grass/earth floor materials;
- warm gray castle/chapel stone;
- oak timber + cream plaster house facades;
- pitched low-poly roof prisms or rotated box roofs;
- castle gatehouse and parapet silhouettes;
- fences, carts/stalls, trees, chapel ruins, banners;
- restrained sun/hemisphere lighting and limited warm torch/window lights.

Decor positions must be seeded/deterministic. Do not place decorative solid-looking props across authoritative walk routes unless collision data includes them.

- [ ] **Step 6: Make GameRuntime switch renderer only from authoritative snapshots**

When the first snapshot arrives, create the matching renderer. If a later snapshot changes `worldId` unexpectedly for the same active room, dispose and rebuild only if protocol intentionally supports it; otherwise surface an error. Unknown world should stop presentation and show explicit incompatibility text rather than rendering Keep.

- [ ] **Step 7: Verify and commit**

Run:
```bash
node --test client/worlds/*.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git add client/worlds client/game package.json
git commit -m "feat: render Castleward medieval arena"
```

PR title: `Render Castleward and select worlds authoritatively`.

---

### Task 7: Rebuild the Main Menu and Wire Solo / Practice UI

**Files:**
- Create: `client/menu/MenuController.mjs`
- Create: `client/menu/MenuScene.mjs`
- Create: `client/ui/ScreenRouter.mjs`
- Modify: `client/index.html`
- Modify: `client/styles.css`
- Modify: `client/main.mjs`
- Modify: `client/network/GameSocket.mjs`
- Test: `client/menu/MenuController.test.mjs`
- Test: `server/tests/client-shell.test.mjs`

**Interfaces:**
- Produces screen IDs: `MAIN_MENU`, `SOLO_MENU`, `PRIVATE_MENU`, `LOBBY`, `PLAYING`, `PRACTICE_OVERLAY`, `END_SCREEN`, `HOW_TO_PLAY`.
- Menu actions call existing `GameSocket.quickPlay/createRoom/joinRoom` plus `startSolo` and practice helpers.
- `MenuScene` owns a non-gameplay Three.js preview scene and `dispose()`.

- [ ] **Step 1: Write pure controller/router tests before touching DOM-heavy code**

```js
test('Solo defaults to Fight Bot and exposes Practice Yard', () => {
  const state = reduceMenuState({ screen: 'MAIN_MENU' }, { type: 'OPEN_SOLO' });
  assert.equal(state.screen, 'SOLO_MENU');
  assert.equal(state.soloSelection, 'BOT_DUEL');
});

test('joined Practice skips multiplayer waiting lobby', () => {
  const state = routeJoined({ mode: 'PRACTICE', roomState: 'PLAYING' });
  assert.equal(state, 'PLAYING');
});

test('invite URL emphasizes private join flow', () => {
  const state = initialMenuState({ invitedRoom: 'ABCD2' });
  assert.equal(state.screen, 'PRIVATE_MENU');
  assert.equal(state.roomCode, 'ABCD2');
});
```

- [ ] **Step 2: Run RED**

Run:
```bash
node --test client/menu/*.test.mjs
```
Expected: FAIL because menu modules do not exist.

- [ ] **Step 3: Implement `ScreenRouter` and `MenuController` as pure state + small DOM adapter**

`main.mjs` remains bootstrap: construct socket/HUD/router/menu scene, subscribe to socket events, and hand authoritative snapshots to runtime/router. It should no longer directly own every button's behavior.

- [ ] **Step 4: Replace centered utility card markup with medieval front-door hierarchy**

Required visible actions:

```text
QUICK MATCH
SOLO >
PRIVATE MATCH >
JOIN ROOM
HOW TO PLAY
SPELLBLADE: <name> [EDIT]
```

Solo submenu contains:

```text
FIGHT BOT
PRACTICE YARD
```

Private submenu contains Create Private Room and room-code Join.

- [ ] **Step 5: Implement `MenuScene` using the existing Spellblade rig**

Render a simplified Castleward hill/castle background and one base Spellblade center/right. Support pointer drag to rotate around Y only; clamp/preserve a tasteful angle. Keep idle motion restrained. Reuse `createSpellbladeRig()` rather than duplicating the character model.

Ability presentation is three small medieval sigils/medallions: Sword/Guard, Q Fireball, E Dash. No rarity colors/currency/shop affordances.

- [ ] **Step 6: Rework CSS toward authored medieval materials**

Replace cyan SaaS-card emphasis with parchment/iron/wood/stone hierarchy: warm off-white copy, muted burgundy/gold accents, dark iron dividers, translucent panels only where text needs contrast. Do not apply heavy textures that hurt readability or performance.

HUD can remain mostly prototype-grade in this task; only menu/lobby/practice overlay must be restructured.

- [ ] **Step 7: Add Practice overlay controls**

When `snapshot.mode === 'PRACTICE'`, show a compact escape/pause-style practice panel with Reset Player, Reset Cooldowns, Spawn/Remove Dummy, and Passive/Guarding/Fights Back state controls. Do not show it during FFA/Bot Duel.

- [ ] **Step 8: Verify client-shell and full repository**

Run:
```bash
node --test client/menu/*.test.mjs server/tests/client-shell.test.mjs
npm run verify
```
Expected: all pass.

Commit:
```bash
git add client package.json server/tests/client-shell.test.mjs
git commit -m "feat: rebuild medieval main menu and solo flows"
```

PR title: `Rebuild main menu around Spellblade and solo play`.

---

### Task 8: Harden Integrated Solo/World/Menu Boundaries and Preserve Multiplayer

**Files:**
- Modify: `server/tests/integration.test.mjs`
- Create: `server/tests/structural-phase.test.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes all previous tasks.
- Produces end-to-end regression coverage and documented player flows.

- [ ] **Step 1: Add full structural regression tests**

Cover these scenarios in one test file using actual server instances/WebSockets where appropriate:

```js
// 1. one FFA client stays WAITING
// 2. second FFA client starts countdown/match
// 3. one BOT_DUEL client reaches PLAYING with exactly one bot
// 4. one PRACTICE client reaches PLAYING with no bot until dummy requested
// 5. Quick Play does not attach to solo rooms
// 6. snapshots report mode/worldId/actorKind
// 7. practice messages are rejected in FFA
// 8. reconnect resumes same solo mode/world
```

- [ ] **Step 2: Add malformed/unsupported protocol cases**

Send `startSolo` with `FFA`, unknown mode, oversized dummy mode strings, and attempted `worldId` injection. Verify explicit errors/no room mutation and server remains connected.

- [ ] **Step 3: Update smoke test and README**

Smoke should continue to verify HTTP/private-path/health/WebSocket handshake and also confirm the served client shell contains `FIGHT BOT` and `PRACTICE YARD` once the menu is final.

README documents:
- Quick Match;
- Fight Bot;
- Practice Yard;
- private room/join code;
- Castleward as current default;
- Keep retained for regression/debug;
- Render free-tier cold-start note without promising always-on availability.

- [ ] **Step 4: Run the full local/CI-equivalent gate**

Run:
```bash
npm run verify
```
Expected: syntax clean, all unit/integration tests pass, HTTP/private-path/health/WebSocket smoke passes.

- [ ] **Step 5: Commit and merge only after fresh CI**

```bash
git add server/tests scripts README.md
git commit -m "test: harden solo world and menu integration"
```

PR title: `Harden solo, Castleward, and menu integration`.

---

### Task 9: One Batched Public Render Verification and Screenshot Pass

**Files:**
- Modify or create only the existing temporary/public-verification GitHub Actions harness under `.github/workflows/` if it already exists; do not add a permanent high-frequency schedule.
- No production code changes unless the verification exposes a reproducible defect; such fixes receive their own test-first PR.

**Interfaces:**
- Consumes deployed `main` from Tasks 1–8.
- Produces one browser evidence artifact bundle and a list of defects found from real rendering/play.

- [ ] **Step 1: Wait for `main` CI to be green before allowing Render deployment**

Use commit status/workflow evidence; do not wake Render from intermediate task branches.

- [ ] **Step 2: Run one public verification job**

The job must:
- poll `/health` until the free-tier instance is awake;
- verify client assets and `wss://.../ws` hello/pong;
- open headless Chrome;
- capture the new menu;
- enter Practice with one browser client and capture Town Green/Castleward;
- spawn a dummy and capture Guard/combat state;
- leave, enter Bot Duel with one browser client and capture opponent/combat;
- create or Quick Play one FFA room and prove it remains waiting for a second human;
- record browser console errors and fail on non-whitelisted asset failures.

- [ ] **Step 3: Inspect screenshots manually against structural acceptance criteria**

Look specifically for:
- menu still reading as generic AI/SaaS/gacha UI;
- Spellblade overlapping title/actions;
- Castle not functioning as dominant landmark;
- grassy/town routes looking decorative but conflicting with collision;
- bot/dummy poses unreadable;
- first-person weapon blocking too much screen;
- practice overlay obscuring combat.

- [ ] **Step 4: File/fix only reproducible defects, test-first**

Each discovered production defect receives a focused regression test and normal PR. Do not repeatedly rerun Render after each small fix; batch a second production check only if changes materially affect multiple verified views.

- [ ] **Step 5: Final full verification**

After any screenshot-driven fixes merge, run fresh `main` CI and, if warranted, one final batched public job. Acceptance requires the 14 criteria in the approved spec to be demonstrably satisfied.
