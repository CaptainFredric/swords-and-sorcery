# Solo Modes, Castleward, and Main Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative one-tab solo play, basic server-controlled opponents/training actors, a per-room world system, Castleward as the default medieval hill-town arena, and a Spellblade-centered main menu without regressing public FFA.

**Architecture:** Keep one authoritative `Room` and combat simulation. Give each room an explicit mode policy and world definition; represent bots/dummies as server-owned combat actors, not fake sockets. The client selects world presentation only from authoritative `worldId`, while menu/navigation state moves out of `client/main.mjs` into focused modules.

**Tech Stack:** Node.js 22+, native HTTP/WebSocket server, browser ES modules, Three.js 0.169 via import map, `node:test`, GitHub Actions, Render.

**Spec:** `docs/superpowers/specs/2026-09-18-solo-world-menu-architecture.md`

## Global Constraints

- Preserve the base Spellblade combat kit and current server-authoritative damage/cooldown/parry rules.
- Stable mode IDs: `FFA`, `BOT_DUEL`, `PRACTICE`.
- Actor kinds: `human`, `bot`, `dummy`.
- Castleward target combat footprint: roughly 45–55 m across; normal route loops do not require Dash.
- Medieval material language first; magic is an accent, not the ambient color of the entire game.
- No classes, progression, account economy, cosmetic inventory, difficulty selector, campaign, or touch combat in this phase.
- Intermediate validation stays in CI. Do one batched Render/browser verification after the structural phase is green.
- Every behavior-changing task uses red-green TDD where practical and must pass `npm run verify` before merge.

## Review Focus

1. Quick Play must never select solo rooms; mode/world identity is immutable after room creation.
2. Bots/dummies must never count as connected humans, reconnect sessions, rematch voters, or cleanup blockers.
3. Server collision/spawns and client rendering must agree on authoritative `worldId`; unknown IDs fail explicitly.
4. Bot attacks/spells/dashes/Guard must use existing combat authority rather than mutate HP/cooldowns directly.
5. Reconnect, expired session, invite links, Practice leave, and solo start must route to the correct UI without a ghost lobby.

---

### Task 1: Add Explicit Mode and World Identity Without Changing Existing FFA

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
- Produces: `GAME_MODES`, `getModePolicy(id)`, `WORLD_IDS`, `getWorld(id)`, `Room.mode`, `Room.worldId`, `Room.world`, `player.actorKind`.
- Preserves: compatibility exports `SHATTERED_KEEP`, `KEEP_HORIZONTAL_SCALE`, `SPAWN_POINTS` from `shared/src/map.mjs` during migration.

- [ ] **Step 1: Write the failing registry tests**

`shared/src/modes.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODES, getModePolicy } from './modes.mjs';
import { WORLD_IDS, getWorld } from '../worlds/registry.mjs';

test('FFA preserves current start and win rules', () => {
  const mode = getModePolicy(GAME_MODES.FFA);
  assert.equal(mode.minHumansToStart, 2);
  assert.equal(mode.scoreToWin, 10);
  assert.equal(mode.matchSeconds, 360);
  assert.equal(mode.autoStart, false);
});

test('unknown modes and worlds fail explicitly', () => {
  assert.throws(() => getModePolicy('NOPE'), /Unknown game mode/);
  assert.throws(() => getWorld('NOPE'), /Unknown world/);
  assert.equal(WORLD_IDS.SHATTERED_KEEP, 'shattered-keep');
});
```

Add to `server/tests/room.test.mjs`:

```js
test('Room stores mode/world identity and marks network players human', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  const player = room.addPlayer({ id: 'p1', token: 't1', name: 'A' }, 0);
  assert.equal(room.mode, 'FFA');
  assert.equal(room.worldId, 'shattered-keep');
  assert.equal(player.actorKind, 'human');
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:
```bash
node --test shared/src/modes.test.mjs server/tests/room.test.mjs
```
Expected: FAIL because registries and Room options do not exist.

- [ ] **Step 3: Implement the mode registry**

`shared/src/modes.mjs`:

```js
export const GAME_MODES = Object.freeze({ FFA: 'FFA', BOT_DUEL: 'BOT_DUEL', PRACTICE: 'PRACTICE' });

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

- [ ] **Step 4: Move Keep data behind a world registry**

Move the existing map definition into `shared/worlds/shatteredKeep.mjs` unchanged except add `id: 'shattered-keep'` and `name`. Implement `shared/worlds/registry.mjs`:

```js
import { SHATTERED_KEEP } from './shatteredKeep.mjs';

export const WORLD_IDS = Object.freeze({ SHATTERED_KEEP: 'shattered-keep', CASTLEWARD: 'castleward' });
const WORLDS = new Map([[WORLD_IDS.SHATTERED_KEEP, SHATTERED_KEEP]]);

export function getWorld(id) {
  const world = WORLDS.get(id);
  if (!world) throw new Error(`Unknown world: ${id}`);
  return world;
}

export function registerWorld(world) {
  if (!world?.id || !Array.isArray(world.spawnPoints)) throw new Error('Invalid world definition');
  WORLDS.set(world.id, world);
}
```

`shared/src/map.mjs` re-exports the legacy names from `shatteredKeep.mjs` so existing tests/callers stay green during migration.

- [ ] **Step 5: Parameterize `Room` and `RoomManager` while retaining FFA defaults**

`Room` constructor resolves and stores policy/world once:

```js
constructor(code, { isPrivate = true, mode = GAME_MODES.FFA, worldId = WORLD_IDS.SHATTERED_KEEP } = {}) {
  this.code = code;
  this.isPrivate = isPrivate;
  this.mode = mode;
  this.policy = getModePolicy(mode);
  this.worldId = worldId;
  this.world = getWorld(worldId);
  this.state = 'WAITING';
  this.players = new Map();
  this.projectiles = new Map();
  this.events = [];
  this.countdownEndsAt = null;
  this.matchStartedAt = null;
  this.winnerId = null;
  this.suddenDeath = false;
  this.suddenDeathLeaders = [];
  this.rematchVotes = new Set();
  this.emptySince = null;
  this.tickNumber = 0;
  this.recentSpawnUse = new Map();
}
```

Replace Room's direct `SHATTERED_KEEP.spawnPoints` reads with `this.world.spawnPoints`; set `actorKind: 'human'` in `addPlayer`.

In `RoomManager`, centralize creation:

```js
#createRoom({ isPrivate, mode, worldId }, nowSec) {
  let code;
  do code = generateRoomCode(this.random); while (this.rooms.has(code));
  const room = new Room(code, { isPrivate, mode, worldId });
  room.createdAt = nowSec;
  this.rooms.set(code, room);
  return room;
}
```

Existing public/private FFA methods call this with `FFA`/Keep. `quickPlay()` filters `room.mode === GAME_MODES.FFA`.

- [ ] **Step 6: Add protocol metadata and verify GREEN**

Add `mode`/`worldId` to `joined`, `lobby`, and `snapshot`; add `actorKind` to each player snapshot.

Run:
```bash
node --test shared/src/modes.test.mjs server/tests/room.test.mjs server/tests/integration.test.mjs
npm run verify
```
Expected: all pass and current two-human FFA behavior remains unchanged.

- [ ] **Step 7: Commit, PR, merge after fresh CI**

```bash
git add shared server
git commit -m "refactor: add explicit mode and world identity"
```

PR: `Add explicit game mode and world registries`.

---

### Task 2: Add Authoritative One-Tab Solo Rooms and Server-Owned Actor Plumbing

**Files:**
- Modify: `server/src/game/Room.mjs`
- Modify: `server/src/rooms/RoomManager.mjs`
- Modify: `server/src/server.mjs`
- Modify: `client/network/GameSocket.mjs`
- Create/Test: `server/tests/solo-room.test.mjs`
- Modify/Test: `server/tests/integration.test.mjs`

**Interfaces:**
- Produces: `Room.addServerActor()`, `Room.humanCount()`, `Room.provisionModeActors()`, `RoomManager.createSoloRoom()`, `GameSocket.startSolo()`.

- [ ] **Step 1: Write failing solo lifecycle tests**

`server/tests/solo-room.test.mjs` imports `RoomManager` and asserts:

```js
test('Bot Duel needs one connected human, not a second browser', () => {
  const manager = new RoomManager({ random: () => 0.1 });
  const room = manager.createSoloRoom('BOT_DUEL', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.humanCount(), 1);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'bot').length, 1);
  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
});

test('Practice starts for one human and does not time out', () => {
  const manager = new RoomManager({ random: () => 0.2 });
  const room = manager.createSoloRoom('PRACTICE', 0);
  room.addPlayer({ id: 'human', token: 'token', name: 'Aden' }, 0);
  room.armAutoStart(0);
  room.tick(0.01);
  assert.equal(room.state, 'PLAYING');
  room.tick(9999);
  assert.equal(room.state, 'PLAYING');
});

test('Quick Play never selects a solo room', () => {
  const manager = new RoomManager({ random: () => 0.3 });
  const solo = manager.createSoloRoom('BOT_DUEL', 0);
  const quick = manager.quickPlay(0);
  assert.notEqual(quick.code, solo.code);
  assert.equal(quick.mode, 'FFA');
});
```

- [ ] **Step 2: Run RED**

```bash
node --test server/tests/solo-room.test.mjs
```
Expected: FAIL because solo methods/server actors do not exist.

- [ ] **Step 3: Implement server actor/session separation**

`Room.addServerActor({id,name,actorKind}, nowSec)` accepts only `bot`/`dummy`, assigns normal combat state, `token: null`, `connected: false`, and no reconnect deadlines. Add:

```js
humanCount() {
  return [...this.players.values()].filter((p) => p.actorKind === 'human' && p.connected).length;
}
```

Use `humanCount()` for start/rematch quorum. Bots/dummies can score/die but never become network voters or cleanup sessions.

`provisionModeActors()` inserts exactly one bot for `BOT_DUEL` and none for `PRACTICE`. `armAutoStart()` starts Practice immediately and Bot Duel via the normal short countdown.

- [ ] **Step 4: Add `startSolo` protocol**

`GameSocket.mjs`:

```js
startSolo(mode, name) { this.send({ type: 'startSolo', mode, name }); }
```

Server accepts only `BOT_DUEL`/`PRACTICE`, creates a private non-matchmade room, joins the human, provisions actors, and attaches normally. Unknown/FFA input returns `{ type: 'error', message: 'Unknown solo mode' }` and creates no room.

- [ ] **Step 5: Add real WebSocket integration test**

Using the existing integration socket helper, one client sends `startSolo(PRACTICE)` and must receive `joined` followed by a snapshot with `roomState === 'PLAYING'`, `mode === 'PRACTICE'`, without opening another socket. Resume with the issued token must restore the same `mode` and `worldId`.

- [ ] **Step 6: Verify and merge**

```bash
node --test server/tests/solo-room.test.mjs server/tests/integration.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: add authoritative solo rooms`.
PR: `Add one-tab authoritative solo room lifecycle`.

---

### Task 3: Add a Basic Bot Controller That Uses Existing Combat Verbs

**Files:**
- Create: `server/src/ai/BotController.mjs`
- Modify: `server/src/server.mjs`
- Modify: `server/src/game/Room.mjs`
- Test: `server/tests/bot-controller.test.mjs`
- Modify/Test: `server/tests/combat.test.mjs`

**Interfaces:**
- Consumes existing exports `beginAttack`, `endAttack`, `setGuard`, `tryCastFireball`, `tryDash`.
- Produces `stepBotControllers(room, nowSec, world, { random } = {})` and per-bot `player.ai` state.

- [ ] **Step 1: Write failing bot-authority tests**

```js
test('bot chooses melee intent without directly damaging the target', () => {
  const { room, bot, human } = makeBotDuel();
  bot.position = { x: 0, y: 0, z: 0 };
  human.position = { x: 0, y: 0, z: -1.4 };
  stepBotControllers(room, 1, room.world, { random: () => 0.5 });
  assert.equal(bot.attackHeld, true);
  assert.equal(human.health, 100);
});

test('bot Fireball cannot bypass cooldown', () => {
  const { room, bot } = makeBotDuel();
  bot.fireballReadyAt = 10;
  const count = room.projectiles.size;
  stepBotControllers(room, 5, room.world, { random: () => 0.5 });
  assert.equal(room.projectiles.size, count);
});

test('bot defensive decisions have nonzero reaction latency', () => {
  const { room, bot } = makeBotDuel();
  stepBotControllers(room, 1, room.world, { random: () => 0.5 });
  assert.ok(bot.ai.nextDefensiveDecisionAt > 1);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test server/tests/bot-controller.test.mjs
```
Expected: FAIL because controller does not exist.

- [ ] **Step 3: Implement low-frequency decisions**

Initialize:

```js
bot.ai = {
  nextDecisionAt: nowSec,
  nextDefensiveDecisionAt: nowSec + 0.2,
  strafeSign: 1,
  aimErrorYaw: 0,
};
```

At 5–10 Hz: acquire nearest alive hostile human; compute desired yaw/distance; update `bot.input`; attack at sword range; Fireball at medium range if `tryCastFireball()` accepts; Dash for gap closing if `tryDash()` accepts; call `setGuard()` only after defensive reaction deadline. Never write target HP, cooldown times, kill counts, or successful parry state from AI code.

- [ ] **Step 4: Run bot intentions before normal room simulation**

In server tick, call `stepBotControllers(room, time, room.world)` for active rooms before `stepRoom(room, dt, time, room.world)`.

- [ ] **Step 5: Add Guard/parry/cooldown regression tests and verify**

Prove a bot sword strike follows existing Guard/parry handling and bot Fireball produces the same projectile/event path as human Fireball.

Run:
```bash
node --test server/tests/bot-controller.test.mjs server/tests/combat.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: add authoritative Spellblade bot controller`.
PR: `Add basic server-authoritative Bot Duel opponent`.

---

### Task 4: Add Practice Yard Utilities and One Training Dummy

**Files:**
- Create: `server/src/game/practice.mjs`
- Modify: `server/src/server.mjs`
- Modify: `client/network/GameSocket.mjs`
- Test: `server/tests/practice.test.mjs`

**Interfaces:**
- Produces: `resetPracticePlayer`, `spawnPracticeDummy`, `removePracticeDummy`, `setPracticeDummyMode`.
- Dummy modes: `PASSIVE`, `GUARDING`, `FIGHTS_BACK`.

- [ ] **Step 1: Write failing mode-gating/reset tests**

```js
test('practice utilities are rejected in FFA', () => {
  const room = new Room('ABCDE', { mode: 'FFA', worldId: 'shattered-keep' });
  assert.equal(resetPracticePlayer(room, 'p1', 1), false);
});

test('practice reset restores base combat resources', () => {
  const { room, human } = makePracticeRoom();
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

test('practice owns at most one dummy', () => {
  const { room } = makePracticeRoom();
  spawnPracticeDummy(room, 'PASSIVE', 0);
  spawnPracticeDummy(room, 'GUARDING', 0);
  assert.equal([...room.players.values()].filter((p) => p.actorKind === 'dummy').length, 1);
});
```

- [ ] **Step 2: Run RED**

```bash
node --test server/tests/practice.test.mjs
```

- [ ] **Step 3: Implement practice module**

Passive dummy has zero input/no Guard. Guarding dummy calls normal `setGuard()` when stamina permits but does not manufacture Perfect Parry timing. Fights Back reuses the bot controller with constrained aggression. Reset uses a safe `room.world.spawnPoints` entry and the same fresh combat-state path used by respawn.

- [ ] **Step 4: Add mode-gated socket helpers/messages**

`GameSocket` methods:

```js
practiceResetPlayer() { this.send({ type: 'practiceResetPlayer' }); }
practiceSpawnDummy(mode = 'PASSIVE') { this.send({ type: 'practiceSpawnDummy', mode }); }
practiceRemoveDummy() { this.send({ type: 'practiceRemoveDummy' }); }
practiceSetDummyMode(mode) { this.send({ type: 'practiceSetDummyMode', mode }); }
```

Server rejects these unless `room.mode === 'PRACTICE'`; accepted dummy modes are exactly the three constants.

- [ ] **Step 5: Verify and merge**

```bash
node --test server/tests/practice.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: add Practice Yard controls and dummies`.
PR: `Add authoritative Practice Yard utilities`.

---

### Task 5: Add Castleward Gameplay Geometry and True Per-Room World Selection

**Files:**
- Create: `shared/worlds/castleward.mjs`
- Modify: `shared/worlds/registry.mjs`
- Modify: `server/src/server.mjs`
- Modify: `server/src/game/combat.mjs` only where simulation still receives a global world
- Test: `shared/src/castleward.test.mjs`
- Test: `server/tests/world-selection.test.mjs`

**Interfaces:**
- Produces `CASTLEWARD` with `id`, `name`, `floors`, `ramps`, `solids`, `spawnPoints`, boundary/fall data, `zones`, optional `navigationHints`.

- [ ] **Step 1: Write failing Castleward contract tests**

```js
test('Castleward exposes the five intended combat zones', () => {
  const ids = new Set(CASTLEWARD.zones.map((zone) => zone.id));
  assert.deepEqual(ids, new Set(['town-green', 'castle-bailey', 'west-village', 'east-meadow', 'south-road']));
});

test('Castleward stays inside the arena size envelope', () => {
  const xs = CASTLEWARD.floors.flatMap((f) => [f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2]);
  const zs = CASTLEWARD.floors.flatMap((f) => [f.center[2] - f.size[2] / 2, f.center[2] + f.size[2] / 2]);
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 55);
  assert.ok(Math.max(...zs) - Math.min(...zs) <= 55);
  assert.ok(CASTLEWARD.spawnPoints.length >= 10);
});
```

Also write normal-movement simulation tests for Town Green -> Castle Bailey and Town Green -> East Meadow with Dash disabled.

- [ ] **Step 2: Run RED**

```bash
node --test shared/src/castleward.test.mjs server/tests/world-selection.test.mjs
```

- [ ] **Step 3: Implement collision-friendly Castleward topology**

Use broad deterministic floors/ramps/solids compatible with current collision: central Town Green/market, uphill north castle gate+bailey+short wall walk, west village lane, east meadow+ruined chapel, south road/outer gate. Use walls/buildings/banks as primary containment; limited kill-falls only where visually legible.

- [ ] **Step 4: Remove remaining server-global world coupling**

Every room tick resolves collision/spawns from `room.world`. `world-selection.test.mjs` creates one Keep room and one Castleward room in the same server and proves spawn/collision differ according to each room's `worldId`.

- [ ] **Step 5: Register Castleward and make it the default for new rooms**

`WORLD_IDS.CASTLEWARD` resolves to `CASTLEWARD`; RoomManager defaults public/private/solo creation to Castleward while explicit Keep creation remains supported for tests/debug.

- [ ] **Step 6: Verify and merge**

```bash
node --test shared/src/castleward.test.mjs server/tests/world-selection.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: add Castleward gameplay world`.
PR: `Add Castleward as the default authoritative arena`.

---

### Task 6: Add Client World Renderer Factory and Castleward Medieval Presentation

**Files:**
- Create: `client/worlds/WorldRendererFactory.mjs`
- Create: `client/worlds/CastlewardRenderer.mjs`
- Create: `client/worlds/ShatteredKeepRenderer.mjs`
- Create: `client/worlds/castlewardDecor.mjs`
- Modify: `client/game/WorldRenderer.mjs`
- Modify: `client/game/GameRuntime.mjs`
- Modify: `package.json`
- Test: `client/worlds/worldRendererFactory.test.mjs`
- Test: `client/worlds/castlewardDecor.test.mjs`

**Interfaces:**
- Produces `rendererKeyForWorld(worldId)`, `createWorldRenderer(worldId, scene)`, renderer `update(timeSec)` and `dispose()`.

- [ ] **Step 1: Add only the world-test glob**

Set:

```json
"test": "node --test client/game/*.test.mjs client/worlds/*.test.mjs shared/src/*.test.mjs server/tests/*.test.mjs"
```

Do not add `client/menu/*.test.mjs` until Task 7 creates that test directory.

- [ ] **Step 2: Write failing renderer/decor tests**

```js
test('world renderer selection is explicit', () => {
  assert.equal(rendererKeyForWorld('castleward'), 'castleward');
  assert.equal(rendererKeyForWorld('shattered-keep'), 'shattered-keep');
  assert.throws(() => rendererKeyForWorld('unknown'), /Unsupported world/);
});

test('Castleward deterministic decor stays performance bounded', () => {
  const plan = buildCastlewardDecorPlan(1337);
  assert.ok(plan.houses.length >= 4 && plan.houses.length <= 10);
  assert.ok(plan.trees.length <= 24);
  assert.ok(plan.torches.length <= 20);
  assert.ok(plan.castlePieces.length > 0);
});
```

- [ ] **Step 3: Run RED**

```bash
node --test client/worlds/*.test.mjs
```

- [ ] **Step 4: Extract Keep renderer and implement explicit factory**

Move existing Keep renderer body to `ShatteredKeepRenderer.mjs`. Factory maps exactly two supported IDs and throws for unknown worlds; there is no silent Keep fallback.

- [ ] **Step 5: Build Castleward renderer**

Render authoritative floors/solids, then deterministic medieval decor: natural green grass, packed earth, warm gray limestone, dark oak timber, weathered cream plaster, muted roofs, castle gatehouse/parapets, village facades, fences, market stalls/carts, chapel ruin, trees and faded banners. Keep point lights limited; use daylight/hemisphere lighting for most readability. Decorative solid-looking props cannot block a route unless server collision contains matching geometry.

- [ ] **Step 6: Make `GameRuntime` choose renderer from authoritative snapshot**

On first snapshot create the renderer for `snapshot.worldId`. Unknown ID stops match presentation and surfaces an explicit incompatible-world error. Dispose the prior renderer when leaving/switching rooms.

- [ ] **Step 7: Verify and merge**

```bash
node --test client/worlds/*.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: render Castleward medieval arena`.
PR: `Render Castleward and select worlds authoritatively`.

---

### Task 7: Rebuild the Main Menu Around the Spellblade and Solo Flows

**Files:**
- Create: `client/menu/MenuController.mjs`
- Create: `client/menu/MenuScene.mjs`
- Create: `client/ui/ScreenRouter.mjs`
- Modify: `client/index.html`
- Modify: `client/styles.css`
- Modify: `client/main.mjs`
- Modify: `client/network/GameSocket.mjs`
- Modify: `package.json`
- Test: `client/menu/MenuController.test.mjs`
- Modify/Test: `server/tests/client-shell.test.mjs`

**Interfaces:**
- Screen IDs: `MAIN_MENU`, `SOLO_MENU`, `PRIVATE_MENU`, `LOBBY`, `PLAYING`, `PRACTICE_OVERLAY`, `END_SCREEN`, `HOW_TO_PLAY`.
- Menu actions call existing socket methods plus `startSolo`/practice helpers.

- [ ] **Step 1: Extend test command now that menu tests exist**

Set:

```json
"test": "node --test client/game/*.test.mjs client/worlds/*.test.mjs client/menu/*.test.mjs shared/src/*.test.mjs server/tests/*.test.mjs"
```

- [ ] **Step 2: Write failing pure menu-state tests**

```js
test('Solo opens with Fight Bot selected by default', () => {
  const state = reduceMenuState({ screen: 'MAIN_MENU' }, { type: 'OPEN_SOLO' });
  assert.equal(state.screen, 'SOLO_MENU');
  assert.equal(state.soloSelection, 'BOT_DUEL');
});

test('Practice join skips the multiplayer waiting lobby', () => {
  assert.equal(routeJoined({ mode: 'PRACTICE', roomState: 'PLAYING' }), 'PLAYING');
});

test('invite URL opens private join flow', () => {
  const state = initialMenuState({ invitedRoom: 'ABCD2' });
  assert.equal(state.screen, 'PRIVATE_MENU');
  assert.equal(state.roomCode, 'ABCD2');
});
```

- [ ] **Step 3: Run RED**

```bash
node --test client/menu/*.test.mjs
```

- [ ] **Step 4: Implement `ScreenRouter`/`MenuController` and slim `main.mjs`**

`main.mjs` becomes bootstrap/orchestration: construct socket/HUD/menu/router/runtime, subscribe to socket messages, hand snapshots to runtime/router. Button state transitions and submenu state live in `MenuController`; screen visibility lives in `ScreenRouter`.

- [ ] **Step 5: Replace centered utility card with the approved hierarchy**

Required main actions:

```text
QUICK MATCH
SOLO >
PRIVATE MATCH >
JOIN ROOM
HOW TO PLAY
SPELLBLADE: <name> [EDIT]
```

Solo submenu: `FIGHT BOT` highlighted/default, then `PRACTICE YARD`. Private submenu: Create Private Room + room-code Join. Invite URL pre-fills/emphasizes join.

- [ ] **Step 6: Implement `MenuScene` using the existing Spellblade rig**

Render a simplified Castleward hill/town/castle backdrop and one base Spellblade center/right. Reuse `createSpellbladeRig()`. Pointer drag rotates only the character Y axis; idle motion stays restrained. Present three small medieval medallions for Sword/Guard, Q Fireball, E Dash. No currency, rarity, upgrade arrows, pulsing loot cards, or generic cyan crest.

- [ ] **Step 7: Rework menu CSS and add Practice overlay**

Use warm off-white text, burgundy/faded red cloth accents, restrained gold, iron/wood/stone separators and only enough dark backing for readability. HUD overhaul is out of scope. Practice overlay exposes Reset Player, Reset Cooldowns, Spawn/Remove Dummy and Passive/Guarding/Fights Back controls only when `snapshot.mode === 'PRACTICE'`.

- [ ] **Step 8: Verify and merge**

```bash
node --test client/menu/*.test.mjs server/tests/client-shell.test.mjs
npm run verify
```
Expected: all pass.

Commit: `feat: rebuild medieval main menu and solo flows`.
PR: `Rebuild main menu around Spellblade and solo play`.

---

### Task 8: Integrated Structural Regression Gate and One Batched Public Verification

**Files:**
- Create: `server/tests/structural-phase.test.mjs`
- Modify: `server/tests/integration.test.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `README.md`
- Modify/create the existing manual public-verification GitHub Actions workflow only as needed; do not schedule it frequently.

**Interfaces:**
- Consumes Tasks 1–7.
- Produces final regression coverage, documentation, and one browser evidence bundle.

- [ ] **Step 1: Add integrated server/protocol regressions**

Using actual server/WebSocket fixtures, assert all eight cases:

```text
1. one FFA human remains WAITING
2. two FFA humans can start
3. one BOT_DUEL human reaches PLAYING with exactly one bot
4. one PRACTICE human reaches PLAYING without a bot until dummy requested
5. Quick Play never attaches to solo rooms
6. snapshot contains mode, worldId, actorKind
7. practice utility messages are rejected in FFA
8. reconnect resumes the same solo mode/world
```

Also send malformed `startSolo` mode values, attempted client `worldId` injection and invalid dummy modes; verify no room identity mutation and no server crash.

- [ ] **Step 2: Update smoke/README and run full CI-equivalent verification**

Smoke retains HTTP assets/private-path/health/WebSocket handshake and verifies the served shell contains `FIGHT BOT` and `PRACTICE YARD` after the menu ships.

README documents Quick Match, Fight Bot, Practice Yard, private room/join, Castleward default, Keep regression map and Render cold starts.

Run:
```bash
npm run verify
```
Expected: syntax clean, every unit/integration test passes, smoke passes.

- [ ] **Step 3: Merge only after fresh GitHub Actions evidence**

Commit: `test: harden solo world and menu integration`.
PR: `Harden solo, Castleward, and menu integration`.

- [ ] **Step 4: Perform one Render wake/browser batch after `main` is green**

The manual verification job must, in one run:
- poll `/health` until awake;
- verify client assets and public WSS hello/pong;
- capture the new menu;
- enter Practice with one browser client and capture Castleward;
- spawn a dummy and capture combat/Guard state;
- leave and enter Bot Duel with one browser client;
- create/Quick Play FFA and prove one human remains waiting;
- collect browser console errors and fail on unexpected asset/network errors.

- [ ] **Step 5: Inspect screenshots and fix only reproducible defects test-first**

Check specifically for generic AI/SaaS/gacha menu language, Spellblade/menu overlap, weak castle landmarking, visual/collision mismatch, unreadable bot/dummy poses, oversized first-person weapon, or Practice overlay obstruction. Each actual defect gets a focused failing regression before a fix. Batch any necessary second public check instead of waking Render after each correction.

- [ ] **Step 6: Final verification**

After screenshot-driven fixes, require fresh green `main` CI. The structural phase is complete only when all 14 acceptance criteria in the approved spec are demonstrably satisfied.
