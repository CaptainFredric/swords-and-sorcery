# Swords & Sorcery: Solo Modes, World Architecture, and Main Menu Redesign

**Date:** 2026-09-18  
**Status:** Approved design, implementation not started  
**Repository:** `CaptainFredric/swords-and-sorcery`

## 1. Purpose

This specification defines the next structural phase of Swords & Sorcery after the initial multiplayer vertical slice.

The current build proves the core combat loop, authoritative networking, room lifecycle, remote Spellblade rendering, Fireball/Dash/sword presentation, and a deployable browser build. The next phase must solve three structural problems before cosmetics and additional classes become the main focus:

1. A player should be able to play and test the game alone without opening a second browser tab.
2. The server, room system, and renderer should no longer assume one game mode and one hard-coded map.
3. The front door and default setting should feel like an intentional medieval fantasy arena game rather than a prototype utility panel over a floating ruin.

The intended result is a game where a new player can open the site and immediately choose Quick Match, Fight Bot, Practice Yard, or Private Match; where all of those modes use the same authoritative combat simulation; and where the default arena is a grassy medieval hill-town dominated by a castle rather than an abstract floating keep.

This phase deliberately preserves the existing combat kit and postpones class proliferation, progression, monetization, large cosmetic systems, complex bot difficulties, and advanced game modes.

## 2. Product principles

### 2.1 Base game first

The base Spellblade remains the only fully supported combat identity during this phase:

- Sword combo
- Guard / Perfect Parry
- Fireball
- Dash
- Jump / movement
- Existing health, cooldown, respawn, and scoring rules

No new class abilities are part of this specification.

### 2.2 Solo must test the real game

Solo play must not be a client-only approximation. Practice, bots, dummies, and human multiplayer all run through the same server-authoritative movement/combat rules.

A successful parry in Practice Yard must prove the same parry code that PvP uses. A Fireball that hits a bot must use the same projectile collision and damage logic as a Fireball that hits a human.

### 2.3 Medieval first, magic as contrast

The world and menu should first read as a believable stylized medieval-fantasy place:

- grass
- packed earth
- stone
- oak timber
- plaster
- slate/thatch
- iron
- faded heraldic cloth
- torches and warm windows

Sorcery should be visually special because it interrupts that material language. Cyan/violet/orange magical effects should not become the ambient color of every wall, panel, and decorative object.

### 2.4 Fast arena topology, not open-world wandering

Castleward should feel broader and more inhabited than The Shattered Keep, but it remains an arena. Players should normally locate combat within roughly 5–10 seconds rather than search a large town.

### 2.5 Render free-tier discipline

Development should avoid unnecessary production wakeups. CI and deterministic tests verify most changes. Public Render verification is batched after meaningful milestones rather than used for every commit.

## 3. Scope

### Included

- Game-mode abstraction
- `FFA`, `BOT_DUEL`, and `PRACTICE` policies
- Server-owned actors (`human`, `bot`, `dummy`)
- Basic bot controller
- Practice Yard controls and training dummy states
- World/map registry
- Removal of direct Shattered Keep assumptions from room/server/runtime boundaries
- New default map: Castleward
- Castleward visual renderer and combat topology
- Menu scene and menu navigation redesign
- Solo submenu: Fight Bot / Practice Yard
- Multiplayer menu: Quick Match / Private Match / Join Room
- Snapshot/protocol fields for mode, world, and actor type
- Migration tests preserving existing multiplayer behavior
- One batched production verification at the end of the structural phase

### Explicitly deferred

- Bot difficulty selector
- Advanced tactical AI
- Multiple bots / team modes
- Campaign, quests, NPC dialogue, inventory, economy
- Accounts or persistence beyond current local identity/session behavior
- Cosmetic inventory or unlock economy
- Classes / ability loadouts
- Skill trees / progression
- Mobile touch combat
- Large open world
- Multiple simultaneously polished maps
- Full animation overhaul beyond readability changes required by this phase

## 4. Architectural direction

The recommended architecture is one authoritative room model with explicit mode and world policies.

Avoid separate `SoloRoom`, `PracticeRoom`, and `FfaRoom` implementations unless later complexity proves necessary. Mode behavior should be data/policy-driven where practical so combat, reconnects, actor state, respawns, and snapshots stay shared.

Conceptual dependencies:

```text
Room
 ├─ mode policy
 ├─ world definition
 ├─ players/actors
 ├─ projectiles/events
 └─ lifecycle state

stepRoom(room)
 ├─ update bot/dummy intentions
 ├─ process movement
 ├─ process combat
 ├─ process projectiles
 ├─ process deaths/respawns
 └─ apply mode end conditions
```

The client receives `mode` and `worldId` from authoritative room state and selects presentation accordingly.

## 5. Game mode policy

### 5.1 Mode IDs

Initial IDs:

- `FFA`
- `BOT_DUEL`
- `PRACTICE`

These are protocol-level stable identifiers. UI labels may change independently.

### 5.2 Policy shape

A mode policy should expose behavior such as:

```js
{
  id: 'FFA',
  minHumansToStart: 2,
  botCount: 0,
  scored: true,
  timed: true,
  scoreToWin: 10,
  matchSeconds: 360,
  autoStart: false,
  allowRematchVote: true,
}
```

`BOT_DUEL`:

```js
{
  id: 'BOT_DUEL',
  minHumansToStart: 1,
  botCount: 1,
  scored: true,
  timed: true,
  scoreToWin: 10,
  matchSeconds: 360,
  autoStart: true,
  allowRematchVote: false,
}
```

`PRACTICE`:

```js
{
  id: 'PRACTICE',
  minHumansToStart: 1,
  botCount: 0,
  scored: false,
  timed: false,
  scoreToWin: null,
  matchSeconds: null,
  autoStart: true,
  allowRematchVote: false,
}
```

Exact object names may vary, but the behavior must remain explicit and testable.

### 5.3 Lifecycle behavior

#### FFA

Preserve current behavior:

`WAITING -> COUNTDOWN -> PLAYING -> FINISHED -> REMATCH_COUNTDOWN`

At least two connected humans are required to begin.

#### Bot Duel

Creation immediately provisions one human and one server-owned bot. The room may enter a short countdown for presentation, but must never wait for another network client.

The first bot duel uses the same first-to-10 / six-minute rules as FFA unless later playtesting justifies a shorter solo target.

#### Practice

Practice begins immediately after the player joins. It does not finish from time or score.

Practice can still use `PLAYING` as its active room state so existing combat authority checks continue to work. It does not need a separate `PRACTICING` lifecycle state.

## 6. Actor model

Each simulated combatant receives an `actorKind`:

- `human`
- `bot`
- `dummy`

Human actors own network sessions. Bot and dummy actors never do.

Server-owned actors should otherwise carry normal combat state wherever possible:

- position / velocity
- yaw / pitch
- health
- Guard stamina
- attack state
- cooldowns
- stagger
- alive / respawn state
- scoring fields when relevant

This lets the existing combat functions remain authoritative.

### 6.1 Session separation

Never represent a bot as a fake WebSocket connection. Bots should not:

- consume reconnect tokens
- count as connected humans
- affect room cleanup as network sessions
- participate in invite/rematch quorum as humans

Mode policy decides whether server actors count for match population and scoring.

## 7. Bot controller

### 7.1 Principle

The bot chooses intentions; combat code resolves outcomes.

The bot controller may call or feed the same semantic actions used by human clients:

- movement input
- aim/yaw/pitch
- begin/end Attack
- begin/end Guard
- Cast Fireball
- Dash

The bot must not directly change another actor's HP, teleport through cooldowns, or force successful parries.

### 7.2 Initial behavior

The first bot is intentionally simple but playable:

1. Acquire nearest valid hostile human.
2. Face target with limited turn rate and modest aim error.
3. If far, move toward target.
4. At medium range, strafe rather than run straight continuously.
5. Cast Fireball when line-of-sight exists and spacing is appropriate.
6. Use Dash occasionally to close or reposition.
7. At sword range, approach and attack.
8. Raise Guard in response to nearby pressure with a reaction delay.
9. Avoid walking directly into known abyss/invalid bounds when map metadata permits.

The bot should not Perfect Parry with impossible reaction speed. Initial Guard timing should be deliberately fallible.

### 7.3 Future difficulty seam

Difficulty later changes:

- reaction latency
- aim error
- turn speed
- aggression
- Fireball selection
- Guard/parry discipline
- Dash decision quality
- navigation quality

Difficulty should not primarily be implemented as health or damage multipliers.

## 8. Practice Yard

Practice is a real authoritative room with utility controls exposed only in practice mode.

Initial controls:

- Reset player position
- Restore health
- Reset ability cooldowns / Guard stamina
- Spawn training dummy
- Remove training dummy
- Dummy mode: Passive
- Dummy mode: Guarding
- Dummy mode: Fights Back

These actions require dedicated server messages validated against `room.mode === 'PRACTICE'`.

### 8.1 Dummy behavior

`Passive`: stationary, does not attack or Guard.

`Guarding`: primarily holds/refreshes Guard so the player can practice Guard pressure, Fireball interaction, and Guard Break. Perfect Parry behavior should not be automatic unless specifically enabled later.

`Fights Back`: may reuse a constrained bot controller with simpler movement.

### 8.2 No hidden developer dependence

The practice controls should be usable from an intentional small practice overlay/menu. They should not require F3, console commands, or query-string hacks.

## 9. World registry

### 9.1 Problem

Current server and room code directly import `SHATTERED_KEEP`; client rendering is likewise Keep-specific.

### 9.2 Shared world definition

Introduce a registry under a shared world/map module. Exact paths may be adjusted during implementation, but intended organization is:

```text
shared/worlds/
  registry.mjs
  shatteredKeep.mjs
  castleward.mjs
```

Each gameplay world definition provides:

- `id`
- display name
- floors / traversable surfaces
- ramps / elevation transitions
- solid collision primitives
- spawn points
- kill/fall volumes or world bounds
- optional navigation hints for bots
- semantic zone metadata where useful

Three.js materials, meshes, particles, and lights do not belong in shared world data.

### 9.3 Room world ownership

Each room stores `worldId` when created. All spawn selection and simulation collision resolve the room's world definition rather than reading a global default.

World changes are not accepted from arbitrary client messages after room creation.

### 9.4 Snapshot contract

Snapshots and lobby/join metadata expose at minimum:

- `mode`
- `worldId`

Actor snapshots expose `actorKind` when required by UI/rendering.

The client must never infer the map from display text or menu selection after joining; authoritative room data wins.

## 10. Castleward: default arena

### 10.1 Identity

Internal world ID: `castleward`.

Working display name: **Castleward**.

Castleward is a compact grassy medieval hill-town built below and around a fortified castle. It should feel inhabited and geographically coherent while still functioning as an arena.

The arena is not a full village simulation and does not require functional interiors for every building.

### 10.2 Major zones

#### Town Green / Market — central

Primary crossing and orientation area.

Elements:

- grass and packed-dirt routes
- low stone well/fountain/monument
- market awnings or stalls
- cart or barrel cover
- low wall sections
- broad lines into neighboring zones

This is the easiest place to understand the map from.

#### Castle Gate & Bailey — north / uphill

Dominant landmark and vertical combat space.

Elements:

- visible castle facade/gatehouse
- gate arch
- compact inner bailey or forecourt
- stairs/ramp to short wall walk
- parapets and battlements
- one or two covered/melee-biased choke points

The castle should be visible from multiple zones and anchor player orientation.

#### West Village Lane

Short-range route.

Elements:

- timber-framed/plaster house facades
- narrow but not claustrophobic lane
- fences and sheds
- corners for sword pressure
- small cross-connections back to Town Green and South Road

Buildings may use simplified blocked interiors initially; no fake doors should imply enterable spaces unless they actually are traversable.

#### East Meadow / Ruined Chapel

Longer-range route.

Elements:

- open grass
- mild rolling elevation
- sparse trees / rocks
- ruined stone chapel or shrine
- broken walls as projectile cover

This gives Fireball and Dash room to matter without creating sniper-scale distances.

#### South Road / Outer Gate

Broad reconnection route.

Elements:

- dirt road
- grassy banks
- outer gate/wall remnants
- cart/fence cover
- routes back toward west village and east meadow

### 10.3 Map scale

Castleward should feel larger than the original Keep without becoming slow.

Initial target:

- practical combat footprint roughly 45–55 m across depending on route shape
- most spawn-to-center travel within several seconds at normal run speed
- no spawn should require Dash to reach primary combat space
- normal traversal loops should not depend on precision jumps

These are starting targets, not immutable numbers.

### 10.4 Terrain

Use restrained stepped/sloped geometry compatible with existing movement/collision architecture.

Avoid a highly tessellated heightfield if it complicates authoritative collision or causes foot jitter.

Rolling hills should be represented through broad ramps/terraces or another deterministic collision-friendly approach.

### 10.5 Castle and buildings

Architecture should use stylized low-poly/blocky forms rather than Minecraft cubes:

- beveled-looking silhouettes through layered blocks/prisms
- stone bases
- timber framing
- plaster panels
- pitched slate/thatch roofs
- arches
- buttresses / wall caps
- banners
- iron brackets
- wooden fences

Decorative geometry must not protrude into traversal in ways that disagree with server collision.

### 10.6 Visual palette

Base materials:

- grass: desaturated natural green
- dirt: warm brown/ochre
- main stone: warm gray / limestone
- castle stone: slightly cooler/darker gray for mass
- timber: dark warm oak
- plaster: cream/weathered off-white
- roof: slate blue-gray / muted brown thatch
- cloth: faded red, burgundy, ochre, navy where useful
- metal: dark iron

Magic remains accent-level rather than environmental wallpaper.

### 10.7 Falling and boundaries

Castleward should not use the abyss as its primary map boundary.

Use believable containment first:

- town walls
- cliffs / steep banks
- castle walls
- dense non-traversable backdrop terrain
- blocked buildings

Kill-falls may remain in limited, legible locations such as a castle exterior drop or ravine if they improve combat.

## 11. Client world rendering

Client renderer organization should allow one renderer per world/theme:

```text
client/worlds/
  WorldRendererFactory.mjs
  CastlewardRenderer.mjs
  ShatteredKeepRenderer.mjs
```

The active match runtime asks the factory for a renderer by authoritative `worldId`.

The legacy Keep renderer remains available during migration and as a regression/debug arena.

World renderers may share primitive helpers/material helpers where useful, but avoid forcing all worlds into one giant conditional renderer.

## 12. Main menu redesign

### 12.1 Goals

The main menu should immediately communicate:

- medieval fantasy
- Spellblade identity
- what the player can do
- a clear primary action
- solo availability

It should not resemble a generic dark SaaS card or mobile/gacha storefront.

### 12.2 Menu scene

Introduce a lightweight `MenuScene` separate from active `GameRuntime`.

The menu scene renders:

- Castleward hillside/town/castle background or a simplified menu-specific version of it
- one base Spellblade center/right
- sword visible
- restrained magical off-hand glow
- subtle breathing/idle motion
- manual horizontal drag to rotate character
- restrained camera drift only if it improves depth without motion sickness

No constant showcase spin, loot rarity glow, currency counters, or oversized hero cards.

### 12.3 Layout

Primary hierarchy:

```text
SWORDS & SORCERY

[ QUICK MATCH ]
[ SOLO          > ]
[ PRIVATE MATCH > ]

Join Room  [ _____ ] [ JOIN ]
How to Play

                 [ Spellblade preview ]
                 [ Sword / Guard sigil ]
                 [ Q Fireball sigil ]
                 [ E Dash sigil ]
```

The title/menu column should not cover the Spellblade.

### 12.4 Solo submenu

Selecting `SOLO` exposes:

- **FIGHT BOT** — default/highlighted
- **PRACTICE YARD**

No difficulty selector in this phase.

### 12.5 Multiplayer flow

`QUICK MATCH` immediately enters public matchmaking.

`PRIVATE MATCH` exposes Create Room and Join options.

A direct invite URL with `?room=CODE` should preselect or emphasize Join Room as current behavior does.

### 12.6 Player identity

The player name remains stored locally.

Present it as a compact identity control, for example:

`SPELLBLADE: Aden   [edit]`

Do not make the name input the central visual object on first load.

### 12.7 Ability sigils

Around/beside the character, show restrained medallion/sigil treatment for the base kit:

- Sword / Guard
- Q Fireball
- E Dash

These are informational. They do not imply progression, rarity, upgrades, or a shop.

## 13. Menu/client state architecture

Current `client/main.mjs` directly manages all DOM screens and match state. This should be decomposed.

Recommended boundaries:

```text
client/menu/MenuScene.mjs
client/menu/MenuController.mjs
client/ui/ScreenRouter.mjs
client/main.mjs
```

`main.mjs` should become bootstrap/orchestration rather than the owner of every button and state transition.

`ScreenRouter` (or equivalent) controls high-level UI states:

- MAIN_MENU
- SOLO_MENU
- PRIVATE_MENU
- LOBBY
- PLAYING
- PRACTICE_OVERLAY
- END_SCREEN
- HOW_TO_PLAY

The exact representation may be simpler than a formal state machine if tests remain clear, but state transitions should no longer be scattered ad hoc.

## 14. Network protocol changes

### Client -> server

Add a solo start message, preferably one semantic endpoint:

```json
{ "type": "startSolo", "mode": "BOT_DUEL", "name": "Aden" }
```

or

```json
{ "type": "startSolo", "mode": "PRACTICE", "name": "Aden" }
```

Practice-only actions use explicit messages such as:

- `practiceResetPlayer`
- `practiceResetCooldowns`
- `practiceSpawnDummy`
- `practiceRemoveDummy`
- `practiceSetDummyMode`

The server validates room mode and actor ownership for each action.

### Server -> client

`joined`, `lobby`, and/or `snapshot` provide authoritative:

- `mode`
- `worldId`

Player/actor snapshots include:

- `actorKind`

Practice state may expose dummy mode if required for overlay display.

## 15. Room creation and matchmaking

RoomManager gains explicit creation methods or one parameterized creator:

- public FFA
- private FFA
- solo Bot Duel
- solo Practice

Quick Play searches only compatible public FFA rooms.

Solo rooms are private/non-matchmade and must never be returned by Quick Play.

Private join codes must not accidentally expose Practice/Bot Duel rooms unless deliberately supported later.

## 16. Scoring and end conditions

### FFA

Unchanged first-to-10 / timer / sudden death behavior.

### Bot Duel

Human and bot both participate in kills/deaths and winning conditions.

The end screen may show the bot normally as an opponent.

Rematch can be one-click rather than a vote because no second human approval exists.

### Practice

Kills/deaths may be tracked for debugging but do not end the session.

No sudden death or match timer.

Leaving Practice returns to the menu.

## 17. Error handling and recovery

- If solo room creation fails, return to menu with a specific error rather than showing a multiplayer lobby.
- If a bot controller fails to acquire a target, it should idle/reacquire rather than crash the room tick.
- Unknown `mode` or `worldId` values must be rejected/fallback safely server-side rather than trusted from client input.
- Client receiving an unsupported authoritative `worldId` should show an explicit incompatibility/error state rather than silently render the wrong map.
- Reconnect should preserve solo room/mode while within the existing reconnect grace period.
- Expired solo sessions return to the main menu via the existing session-expiry mechanism.

## 18. Testing strategy

All implementation is test-driven where practical.

### 18.1 Mode tests

Prove:

- FFA with one human stays waiting.
- FFA with two humans counts down/starts.
- Bot Duel with one human provisions exactly one bot and starts without a second client.
- Practice with one human starts without a second client.
- Practice does not finish due to score or time.
- Solo rooms are never selected by Quick Play.
- mode is immutable after room creation except through intentional future APIs.

### 18.2 Actor/bot tests

Prove:

- bot is not counted as a connected human session.
- bot cannot bypass Fireball/Dash cooldowns.
- bot melee still respects range/facing/LOS/Guard/parry logic.
- bot damage flows through normal combat events.
- bot death/respawn uses normal lifecycle.
- dummy modes do not mutate human session counts.
- reaction timing is bounded and not zero-time perfect parry by default.

### 18.3 Practice tests

Prove:

- Practice reset is rejected outside Practice.
- health/cooldown reset works in Practice.
- dummy spawn/remove is bounded and cannot create unbounded actors.
- dummy mode changes are validated.

### 18.4 World registry tests

Prove:

- every registered world has required collision/spawn metadata.
- room simulation uses room `worldId`, not a global map constant.
- snapshots report the authoritative world ID.
- unsupported world IDs fail safely.

### 18.5 Castleward geometry tests

Prove:

- spawns are on safe walkable ground.
- initial facing directions point into useful playable space.
- first several meters of each spawn lane are not blocked by solids.
- key route loops are traversable at normal movement speed.
- required connections do not depend on Dash.
- collision props match visual expectations for major buildings/walls.
- combat footprint stays inside the intended size envelope.
- no obvious spawn is trapped in a dead end.

### 18.6 Menu/client tests

Prove:

- Quick Match sends public matchmaking request.
- Fight Bot sends `startSolo(BOT_DUEL)`.
- Practice Yard sends `startSolo(PRACTICE)`.
- Private Match flow still creates/joins rooms.
- invite room URL remains usable.
- joined solo session skips multiplayer waiting lobby.
- room `worldId` selects matching renderer.
- unsupported world ID produces explicit error.

### 18.7 Existing regression suite

The full existing syntax/unit/integration/WebSocket/deployment suite remains required for every PR.

## 19. Migration / implementation phases

### Phase A — Mode and world identifiers, no behavior change

- introduce registries
- add `mode` / `worldId` to Room
- preserve current FFA behavior
- preserve Shattered Keep as active world initially
- add protocol fields

This minimizes risk before new behavior appears.

### Phase B — Solo foundation

- server-owned actors
- Bot Duel creation
- Practice creation
- bot controller seam
- practice controls
- client temporary buttons/flow sufficient to enter both modes

This phase proves one-tab solo play on the existing world before the new map complicates diagnosis.

### Phase C — Castleward

- Castleward gameplay geometry
- spawn/path tests
- Castleward renderer
- make Castleward default after validation
- retain Shattered Keep as alternate/debug map

### Phase D — Main menu rebuild

- MenuScene
- character preview and manual rotation
- medieval menu layout
- solo/private submenus
- player identity control
- route menu actions through new controller/router
- remove generic centered-card presentation

### Phase E — Integrated verification

After all prior phases are green on `main`:

- allow Render to deploy one meaningful batch
- public health/WSS verification
- open menu in real browser
- enter Practice without second tab
- enter Bot Duel without second tab
- verify Quick Match still creates/joins FFA flow
- capture several screenshots in one session
- inspect browser console and visual/collision issues

Do not repeatedly wake Render for each intermediate commit.

## 20. Performance constraints

- Keep procedural geometry conservative and reusable.
- Avoid hundreds of individual dynamic lights in town buildings.
- Use shared geometries/materials where practical.
- Limit decorative trees/fences/market props so ordinary student laptops remain near the current performance target.
- Bot AI runs at a lower decision frequency than the 30 Hz physics tick where possible (for example 5–10 decisions/sec), while normal movement continues every tick.
- No pathfinding library is required initially; use simple zone/navigation hints and steering before introducing navmesh complexity.

## 21. Security / authority constraints

- Client cannot create arbitrary server actors.
- Practice utility messages are mode-gated.
- Client cannot select an unapproved map ID after room creation.
- Bot actions go through server combat authority.
- Human client messages cannot impersonate bot/dummy actor IDs.
- Existing message-rate limiting remains active.

## 22. Cosmetics after this phase

Once solo, Castleward, and the new menu are structurally stable, cosmetics become an appropriate next layer.

Good first cosmetics:

- tabard/accent color
- helmet variants
- sword silhouettes
- magic bracer variants
- cloth/trim variants
- restrained victory flourishes

Avoid account economy, rarity systems, loot boxes, or progression requirements in the first cosmetic pass.

The menu's central Spellblade preview should become the natural place to inspect those cosmetics later, which is one reason the menu architecture is being established now.

## 23. Acceptance criteria

This structural phase is complete only when all of the following are true:

1. A user can click Fight Bot and reach active combat without opening a second tab.
2. A user can click Practice Yard and immediately move/use the full base kit.
3. Practice offers at least health/cooldown reset and one controllable dummy.
4. Bot Duel uses the normal authoritative combat pipeline.
5. Public FFA still works and still requires human opponents.
6. Room state carries explicit mode and world identity.
7. Server simulation no longer relies on a global Shattered Keep import for every room.
8. Castleward is the default arena and has a tested, coherent combat topology.
9. The old Shattered Keep remains available as a regression/debug world rather than being deleted.
10. The main menu is no longer a centered dark utility card and presents the Spellblade/world as the visual anchor.
11. Quick Match, Solo, Private Match, Join Room, and How to Play are clearly accessible.
12. The menu does not use mobile/gacha visual language.
13. Full repository verification passes on `main`.
14. One batched public Render verification confirms menu, Practice, Bot Duel, multiplayer handshake, browser console cleanliness, and deployed screenshots.

## 24. Design decisions intentionally left flexible

These are implementation/playtest choices, not unresolved requirements:

- exact Castleward dimensions within the stated arena envelope
- exact house count and facade arrangement
- exact castle silhouette
- exact bot reaction/aim numbers
- exact wording of menu labels
- exact practice overlay position
- exact duration of Bot Duel pre-match countdown

Changes to these do not require architectural redesign as long as they preserve the boundaries and acceptance criteria above.
