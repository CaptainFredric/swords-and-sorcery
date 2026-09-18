# Swords & Sorcery Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first locally runnable, multiplayer-capable Swords & Sorcery browser arena with authoritative rooms/matches, shared combat simulation, The Shattered Keep, sword/guard/parry/fireball/dash, HUD, death/respawn, scoreboard, rematch, and production-ready build configuration.

**Architecture:** Use an npm-workspace monorepo containing `shared`, `server`, and `client`. Deterministic rules and map data live in `shared`; a 30 Hz Socket.IO Node server owns match truth; the Vite/React/Three.js client predicts its own movement, interpolates remote state, and renders all presentation locally.

**Tech Stack:** TypeScript, npm workspaces, Vite, React, Three.js, Socket.IO, Express, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-swords-and-sorcery-design.md`

## Global Constraints

- Server simulation: 30 Hz.
- Room size: 2–8 players; empty-room cleanup after 60 s.
- FFA: first to 10 kills; 6-minute timer; tied leaders continue in sudden death.
- Health 100; sword 34 damage at 0.40/1.10/1.80 s while held.
- Sword range 2.75 m; Guard cone 115°; Guard Stamina 100; block cost 35; parry window 180 ms; guard break stagger 700 ms; parry stagger 450 ms.
- Fireball: 28 direct, 4 s cooldown, 300 ms cast, 24 m/s, 2 m splash, 12 damage at edge.
- Dash: 5 s cooldown, 5 m over 180 ms; no invulnerability.
- Respawn after 3 s; spawn protection 1 s; attacking cancels protection.
- Health regeneration begins after 5 s without damage at 20 HP/s.
- Reconnect grace period 15 s.
- Sword hitting solid world geometry cancels the strike, interrupts the current combo cycle, applies a small backward recoil, and emits a wall-impact event for CLANG/sparks presentation.
- Desktop keyboard/mouse first; mobile menus may be responsive but no touch combat requirement.

---

## File Structure

```text
package.json                     # workspace commands
vitest.config.ts                 # shared/server tests
shared/
  package.json
  tsconfig.json
  src/constants.ts               # authoritative gameplay constants
  src/types.ts                   # vectors, player/match/projectile types
  src/protocol.ts                # typed socket event maps
  src/combat.ts                  # damage, guard, parry, sword timing helpers
  src/movement.ts                # deterministic movement/dash stepping
  src/map.ts                     # Shattered Keep geometry/spawns/kill volumes
  src/collision.ts               # point/capsule-ish collision + segment-vs-AABB
  src/index.ts                   # exports
server/
  package.json
  tsconfig.json
  src/game/Room.ts               # room lifecycle and player registry
  src/game/simulation.ts         # authoritative 30 Hz world step
  src/game/spawns.ts             # spawn scoring
  src/game/combat.ts             # melee/projectile resolution and kill attribution
  src/rooms/RoomManager.ts       # room creation/lookup/quick play/cleanup
  src/server.ts                  # Express + Socket.IO transport
  tests/room.test.ts
  tests/combat.test.ts
  tests/integration.test.ts
client/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/main.tsx
  src/App.tsx                    # menu/lobby/game/end screen state
  src/styles.css                 # deliberate game UI styling
  src/network/GameSocket.ts      # socket connection and protocol adapter
  src/game/GameRuntime.ts        # Three renderer, camera, update loop
  src/game/InputController.ts    # pointer lock + WASD/jump/attack/guard/Q/E
  src/game/RemotePlayers.ts      # interpolation and remote rigs
  src/game/WorldRenderer.ts      # shared-map data -> Three geometry
  src/game/Effects.ts            # fireball/sparks/trails/hit feedback
  src/game/WeaponView.ts         # procedural first-person sword/guard/cast motion
  src/ui/HUD.tsx                 # health, cooldowns, guard, crosshair, feed
  src/ui/Lobby.tsx               # room code, player list, controls
  src/ui/EndScreen.tsx           # winner/scoreboard/rematch
  src/ui/HowToPlay.tsx           # concise controls/rules
README.md                        # local run + deployment instructions
.env.example                     # client/server env keys
```

---

### Task 1: Workspace foundation and shared combat rules

**Files:**
- Create: root `package.json`, `vitest.config.ts`, `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`
- Create: `shared/src/constants.ts`, `shared/src/types.ts`, `shared/src/combat.ts`, `shared/src/index.ts`
- Test: `shared/src/combat.test.ts`

**Interfaces:**
- Produces `GAME`, `SWORD_STRIKE_TIMES`, `getSwordStrikeIndex(elapsed)`, `resolveSwordVsGuard(...)`, `fireballSplashDamage(distance)`, `isCooldownReady(now, readyAt)`.

- [ ] **Step 1: Add workspace/test configuration.** Root `package.json` defines npm workspaces `shared`, `server`, `client` and scripts `test`, `build`, `dev`; Vitest includes `shared/**/*.test.ts` and `server/tests/**/*.test.ts`.
- [ ] **Step 2: Write failing combat tests.** Tests assert 34x3 sword lethality, strike indexes at 0.40/1.10/1.80, 180 ms parry behavior, normal guard drain of 35, Fireball falloff 28 -> 12, and cooldown readiness.
- [ ] **Step 3: Run `npm test -- --run shared/src/combat.test.ts` and confirm RED because shared combat exports do not exist.**
- [ ] **Step 4: Implement minimal shared constants/types/combat helpers to satisfy those tests.**
- [ ] **Step 5: Re-run shared combat tests and the complete test command; expect green.**
- [ ] **Step 6: Commit `feat: add shared combat rules`.**

### Task 2: Shared map, collision, movement, and wall-sword geometry behavior

**Files:**
- Create: `shared/src/map.ts`, `shared/src/collision.ts`, `shared/src/movement.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/src/collision.test.ts`, `shared/src/movement.test.ts`

**Interfaces:**
- Produces `SHATTERED_KEEP`, `SPAWN_POINTS`, `movePlayer(state,input,dt)`, `segmentAabbHit(start,end,box)`, `resolvePlayerWorld(...)`, `findSwordWorldHit(origin,direction,range)`.

- [ ] **Step 1: Write failing collision tests.** Assert segment-vs-wall intersection, no hit through open space, player is prevented from walking through a wall, and sword sweep detects the nearer wall before a target-distance point.
- [ ] **Step 2: Write failing movement tests.** Assert run speed caps at 7.5 m/s, jump only begins while grounded, gravity returns the player to floor, and dash covers approximately 5 m over 180 ms while entering cooldown.
- [ ] **Step 3: Run the two test files and verify expected RED failures.**
- [ ] **Step 4: Implement The Shattered Keep as shared AABB/floor/kill-volume data with courtyard, west/east halls, battlements, bridge, Arcane Spire cover, and ten spawn points.**
- [ ] **Step 5: Implement collision/movement helpers with deterministic vector math and simple axis-separated player resolution.**
- [ ] **Step 6: Re-run tests; expect green.**
- [ ] **Step 7: Commit `feat: add shared movement and keep geometry`.**

### Task 3: Authoritative room and match state machine

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`
- Create: `server/src/game/Room.ts`, `server/src/game/spawns.ts`, `server/src/rooms/RoomManager.ts`
- Test: `server/tests/room.test.ts`

**Interfaces:**
- Produces `Room.addPlayer`, `Room.removePlayer`, `Room.reconnectPlayer`, `Room.tick`, `Room.recordKill`, `Room.requestRematch`, `RoomManager.createPrivateRoom`, `RoomManager.quickPlay`, `RoomManager.findByCode`.

- [ ] **Step 1: Write failing room tests.** Assert room-code format, max eight players, second player starts countdown, first-to-10 finishes, 6-minute tied leaders enter sudden death, rematch resets scores, disconnect retains a slot 15 s, and empty rooms become cleanup eligible at 60 s.
- [ ] **Step 2: Run `npm test -- --run server/tests/room.test.ts`; verify RED.**
- [ ] **Step 3: Implement explicit `WAITING | COUNTDOWN | PLAYING | FINISHED | REMATCH_COUNTDOWN` transitions and player session state.**
- [ ] **Step 4: Implement spawn scoring based on enemy distance, LOS penalty, and recent-use penalty.**
- [ ] **Step 5: Re-run room tests and full tests; expect green.**
- [ ] **Step 6: Commit `feat: add authoritative rooms and match lifecycle`.**

### Task 4: Authoritative combat simulation

**Files:**
- Create: `server/src/game/combat.ts`, `server/src/game/simulation.ts`
- Modify: `server/src/game/Room.ts`
- Test: `server/tests/combat.test.ts`

**Interfaces:**
- Produces `stepRoom(room,dt,now)`, `beginAttack`, `endAttack`, `setGuard`, `tryCastFireball`, `tryDash`, `applyDamage`, `killPlayer`.

- [ ] **Step 1: Write failing simulation tests.** Cover held sword strikes at exact sequence times, release preventing later strikes, parry causing 450 ms attacker stagger and zero damage, block consuming 35 stamina, guard break causing 700 ms defender stagger, Fireball cooldown rejection, Dash cooldown rejection, regen after 5 s, and spawn protection cancellation on attack.
- [ ] **Step 2: Add failing world-hit sword test.** Put a wall 1 m in front of attacker and target 2 m away; assert target takes zero damage, attack cycle is cancelled, attacker receives backward recoil velocity, and a `swordWorldImpact` simulation event is emitted.
- [ ] **Step 3: Run combat tests; verify RED.**
- [ ] **Step 4: Implement transform history (500 ms), melee cone/range/LOS resolution, guard/parry, wall-first melee collision, projectile stepping/splash, knockback attribution, regeneration, death, respawn, and cooldown rules.**
- [ ] **Step 5: Re-run combat/full tests; expect green.**
- [ ] **Step 6: Commit `feat: add authoritative combat simulation`.**

### Task 5: Typed Socket.IO protocol and multiplayer server transport

**Files:**
- Create: `shared/src/protocol.ts`
- Modify: `shared/src/types.ts`, `shared/src/index.ts`
- Create: `server/src/server.ts`
- Test: `server/tests/integration.test.ts`

**Interfaces:**
- Produces typed `ClientToServerEvents` and `ServerToClientEvents`; executable server on `PORT` (default 3001) with `/health`.

- [ ] **Step 1: Write failing integration test using two `socket.io-client` clients.** Alice creates room; Bob joins; both receive lobby; countdown becomes match start; movement snapshot arrives; attack intent can damage; death increments killer; respawn returns victim; rematch returns to PLAYING.
- [ ] **Step 2: Run integration test and verify RED because transport/server does not exist.**
- [ ] **Step 3: Define protocol payloads and implement Express/Socket.IO server wiring to RoomManager and 30 Hz simulation.**
- [ ] **Step 4: Add reconnection by session token and disconnect grace behavior.**
- [ ] **Step 5: Run integration/full tests; expect green.**
- [ ] **Step 6: Commit `feat: expose multiplayer socket server`.**

### Task 6: Client shell, room flow, and socket adapter

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`
- Create: `client/src/main.tsx`, `client/src/App.tsx`, `client/src/network/GameSocket.ts`
- Create: `client/src/ui/Lobby.tsx`, `client/src/ui/HowToPlay.tsx`, `client/src/ui/EndScreen.tsx`, `client/src/styles.css`

**Interfaces:**
- `GameSocket` exposes create/join/quickPlay/input/combat/rematch actions and subscribable room/snapshot/event state.

- [ ] **Step 1: Add client build configuration and a minimal React render smoke test via TypeScript/Vite build (configuration scaffolding).**
- [ ] **Step 2: Implement GameSocket against shared event types and `VITE_GAME_SERVER_URL` with localhost fallback in development.**
- [ ] **Step 3: Implement main menu, invite-room query parsing, lobby player list/room code/copy link, concise How To Play, finished scoreboard/rematch UI.**
- [ ] **Step 4: Run `npm run build -w client`; fix type/build errors until clean.**
- [ ] **Step 5: Commit `feat: add multiplayer menu and lobby client`.**

### Task 7: Three.js world, input, prediction, and remote interpolation

**Files:**
- Create: `client/src/game/GameRuntime.ts`, `client/src/game/InputController.ts`, `client/src/game/WorldRenderer.ts`, `client/src/game/RemotePlayers.ts`
- Modify: `client/src/App.tsx`, `client/src/styles.css`

**Interfaces:**
- `GameRuntime.start(container,socket,playerId)` and `dispose()`; InputController emits shared movement/combat intentions; RemotePlayers consumes snapshots using a 100 ms interpolation buffer.

- [ ] **Step 1: Implement world rendering directly from `SHATTERED_KEEP` shared geometry, including stone materials, Arcane Spire landmark, abyss/cloud backdrop, lights, and kill-volume-safe visual boundaries.**
- [ ] **Step 2: Implement pointer-lock first-person camera, WASD, Space, LMB hold, RMB hold, Q Fireball, E Dash, Tab scoreboard/F3 debug hooks.**
- [ ] **Step 3: Implement local movement prediction using shared `movePlayer` and reconciliation to authoritative snapshots; smooth small errors, snap only large divergence.**
- [ ] **Step 4: Implement simplified blocky remote Spellblade rigs and 100 ms buffered interpolation.**
- [ ] **Step 5: Run client build and server/shared tests; expect all green.**
- [ ] **Step 6: Commit `feat: render playable multiplayer arena`.**

### Task 8: Weapon view, Fireball effects, wall clang, HUD, and combat feedback

**Files:**
- Create: `client/src/game/WeaponView.ts`, `client/src/game/Effects.ts`, `client/src/ui/HUD.tsx`
- Modify: `client/src/game/GameRuntime.ts`, `client/src/App.tsx`, `client/src/styles.css`

**Interfaces:**
- WeaponView responds to attack/guard/cast/stagger/world-impact states; Effects renders projectile/impact/spark/dash feedback; HUD consumes local authoritative state and combat events.

- [ ] **Step 1: Implement procedural first-person sword with idle sway, three distinct swing arcs, guard pose, parry recoil, and final-hit emphasis.**
- [ ] **Step 2: Handle `swordWorldImpact`: stop the current visible swing at collision, kick the weapon back, apply brief camera recoil, create sparks, and play a loud synthesized metallic clang using Web Audio so no external asset is required.**
- [ ] **Step 3: Implement Fireball glow/trail/impact particles and Dash FOV pulse/streak presentation.**
- [ ] **Step 4: Implement HUD: health + delayed trail, Fireball/Dash countdowns, contextual guard bar, crosshair/hit/parry/kill states, kill feed, death countdown, match timer/score.**
- [ ] **Step 5: Run production build and complete tests; expect green.**
- [ ] **Step 6: Commit `feat: add combat presentation and HUD`.**

### Task 9: Debugging, production configuration, README, and acceptance verification

**Files:**
- Create: `.env.example`, `README.md`
- Modify: `client/src/game/GameRuntime.ts`, `server/src/server.ts`, root scripts/config as needed

**Interfaces:**
- Production build commands: `npm run build`; local dev: `npm run dev`; server health endpoint and env-driven CORS/backend URL.

- [ ] **Step 1: Add F3 diagnostic overlay data (FPS, ping, server tick, position, room, player count, room state, prediction error).**
- [ ] **Step 2: Add server env handling for `PORT`, `CLIENT_ORIGIN`; client env handling for `VITE_GAME_SERVER_URL`; retain localhost defaults only in development.**
- [ ] **Step 3: Write README with install, local two-tab playtest, controls, build, deployment split, and Handshake submission checklist.**
- [ ] **Step 4: Run `npm test -- --run`; require zero failures.**
- [ ] **Step 5: Run `npm run build`; require clean shared/server/client TypeScript/Vite builds.**
- [ ] **Step 6: Launch server and client locally; verify `/health` and the client root return successful responses.**
- [ ] **Step 7: Package the finished repository as `/mnt/data/swords-and-sorcery.zip`.**
- [ ] **Step 8: Commit `docs: add run and deployment guide`.**

## Self-review

- Spec coverage: core architecture, combat, wall impact, map, rooms, networking, UI, testing, reconnect, production config, and first playable milestone all map to tasks above.
- Deferred classes/maps/progression remain excluded.
- No task depends on an undefined production interface; shared simulation/protocol precede server/client consumers.
- Client visual code is verified by TypeScript/Vite build and local smoke run; deterministic/game-rule behavior is verified by Vitest and Socket.IO integration tests.
