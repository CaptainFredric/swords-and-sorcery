# Swords & Sorcery — Multiplayer Arena Game Design

**Date:** 2026-09-18  
**Status:** Design approved in conversation; implementation not started  
**Target:** Public browser multiplayer game for the Handshake AI Studio "Create a Multiplayer Game" mission, designed to exceed the minimum bar and be replayable on its own merits.

## 1. Product thesis

Swords & Sorcery is a fast, first-person, low-poly fantasy arena game for 2–8 players. It borrows the low-friction browser format of games such as Krunker—open a URL, enter a name, join a room, play immediately—but replaces hitscan gunplay with readable melee, guarding/parrying, projectile magic, mobility, and environmental knockback.

The first playable release is intentionally narrow: one combat kit, one strong arena, one free-for-all mode, and a short match loop. The goal is not feature count. The goal is to make movement, sword combat, spellcasting, hit feedback, death, respawn, and rematching feel coherent enough that players voluntarily play another round.

### Success criterion

A new player should be able to open the public URL with no explanation, join a friend within 30 seconds, understand the controls and objective from the interface, finish a match, and want to press **Play Again**.

## 2. Release scope

### Must ship in the first public build

- Public URL reachable from unrelated devices.
- 2–8 players per room.
- Quick Play, private room creation, room-code joining, copyable invite links.
- One free-for-all mode.
- First to 10 kills wins; 6-minute fallback timer.
- One shared combat kit: **Spellblade**.
- Sword combo, Guard/Parry, Fireball, Arcane Dash, movement, jumping.
- Server-authoritative health, damage, cooldown legality, kills, respawns, scores, and match lifecycle.
- Client-side movement prediction and remote-player interpolation.
- The Shattered Keep arena.
- HUD, cooldown presentation, health, guard stamina, kill feed, death screen, scoreboard, rematch.
- Basic combat sound and visual feedback.
- Desktop keyboard + mouse gameplay.
- Automated tests for deterministic combat and room/match rules.
- Integration tests with at least two simulated multiplayer clients.

### Explicitly deferred

- Multiple classes.
- Multiple maps.
- Accounts, XP, unlocks, cosmetics, progression, inventory, shops.
- Ranked play.
- Touch-first combat controls.
- Complex physics, ragdoll simulation, or realistic melee simulation.
- Heavy attacks, ultimates, mana, status-effect systems, elemental resistances, loot, or random damage.

The deferred systems are expansion opportunities only after the core loop is proven fun.

## 3. Technical approach

### Recommended stack

- **Client:** TypeScript, Vite, React for shell/UI, Three.js for 3D gameplay.
- **Realtime transport:** Socket.IO over WebSockets.
- **Server:** Node.js + TypeScript.
- **Testing:** Vitest for deterministic/shared systems; Socket.IO client integration tests for multiplayer flows.
- **Deployment:** static/CDN frontend plus a persistent Node/WebSocket backend on a provider that supports long-lived socket connections.

This is preferred over a heavier multiplayer framework because the game has a compact authoritative state model and benefits from explicit control over networking, prediction, combat, and room behavior.

### Repository layout

```text
swords-and-sorcery/
├── client/
│   └── src/
│       ├── game/
│       │   ├── world/
│       │   ├── player/
│       │   ├── combat/
│       │   ├── effects/
│       │   ├── networking/
│       │   └── audio/
│       ├── ui/
│       │   ├── MainMenu/
│       │   ├── Lobby/
│       │   ├── HUD/
│       │   ├── Scoreboard/
│       │   └── DeathScreen/
│       └── main.tsx
├── server/
│   └── src/
│       ├── rooms/
│       ├── players/
│       ├── combat/
│       ├── matches/
│       └── server.ts
├── shared/
│   └── src/
│       ├── protocol.ts
│       ├── constants.ts
│       ├── abilities.ts
│       ├── map.ts
│       ├── types.ts
│       └── simulation/
└── tests/
```

The shared package is authoritative for protocol types, combat constants, movement formulas, map collision definitions, and deterministic simulation code used by both client prediction and the server.

## 4. Authority model

The client controls immediate presentation; the server controls consequences.

### Client-owned presentation

- Camera rotation.
- Immediate local movement prediction.
- Local weapon animation.
- Local casting anticipation.
- Particles, trails, impact presentation, sound, screen shake, hit markers.
- Interpolation of remote players between authoritative snapshots.

### Server-owned truth

- Player positions after authoritative simulation.
- Collision legality.
- Attack and guard timing.
- Cooldowns.
- Projectile simulation.
- Damage and knockback consequences.
- Health and death.
- Kill attribution.
- Respawns.
- Score and match state.

Clients send inputs and intentions rather than authoritative outcomes. A client never sends "my health is 100," "I teleported here," or "I hit Bob for 34." It sends movement input, attack down/up, guard down/up, and ability requests.

## 5. Server simulation and networking

### Tick rate

The server advances the authoritative world at **30 Hz**. Rendering is independent and may run at 60–144+ FPS.

### Input transport

Movement input includes:

- monotonic input sequence number,
- movement axes / key state,
- jump request,
- yaw and pitch,
- client timestamp.

The server acknowledges the highest processed input sequence in authoritative snapshots.

### Client-side prediction

The local browser runs the shared movement simulation immediately, records unacknowledged inputs, and later reconciles against server positions. Small errors are corrected smoothly; large invalid divergence is corrected decisively.

### Remote interpolation

Remote players are rendered from a small buffered history, 100 ms behind the newest received snapshot, so the client can interpolate between known authoritative states instead of visibly snapping between network updates.

### Snapshot contents

Snapshots include the server tick, processed input acknowledgement, relevant player transforms/states, health/guard state, and relevant projectile state. With a maximum of eight players, straightforward full snapshots are acceptable initially; premature delta compression is unnecessary.

## 6. Movement model

The first release emphasizes accessible arena movement rather than movement-shooter mastery.

- Base run speed: **7.5 m/s**.
- Moderate jump height.
- Gravity and friction defined in shared deterministic code.
- No wallrunning, slide-cancelling, bunny-hop optimization, or elaborate air-strafing system in v1.
- Arcane Dash provides the primary burst-mobility expression.

Player collision uses a capsule/cylinder-like body even if the visible character is blockier, reducing snagging on geometry.

## 7. Core combat kit: Spellblade

Every player uses the same kit in the initial release. This allows combat quality to be established before class balance multiplies complexity.

### 7.1 Sword — hold-to-combo

Holding primary attack begins an automatic three-strike sequence. The sequence is readable, interruptible, and takes roughly **1.8–2.0 seconds** to kill a full-health target if all three attacks connect.

Baseline sequence:

- Minor initial wind-up.
- Strike 1 at **0.40 s** — light **TING** impact character.
- Strike 2 at **1.10 s** — heavier **CLANG**.
- Strike 3 at **1.80 s** — strongest **CLANG**, commonly the killing blow.
- **34 damage** per successful unblocked strike, for 102 total damage.

Releasing attack stops the chain after the currently committed swing. Missing still consumes that strike. Being staggered cancels the chain.

The player remains able to move, aim, and jump while attacking, but the swing timing itself is server-owned.

### Sword contact with world geometry

A sword swing can strike solid map geometry. When the active melee sweep intersects a wall, pillar, or other solid surface before reaching a valid target:

- that strike deals no player damage,
- the current swing is cancelled at the point of contact,
- the attacker receives a small backward recoil impulse,
- the first-person weapon visibly kicks away from the surface,
- a loud heavy metallic **CLANG** plays with a spark burst at the contact point,
- the combo chain is interrupted for that attack cycle rather than phasing through the obstacle.

This behavior is intentionally included in the core collision model even if the richer audiovisual treatment is polished after the initial multiplayer loop works.

### Server melee validation

A strike only damages a target if the target is:

1. within **2.75 meters**,
2. inside the attacker's forward attack arc,
3. unobstructed by world collision,
4. alive and damageable,
5. not protected by temporary spawn immunity.

The server retains a short transform history (**500 ms**) for bounded lag compensation so melee is evaluated near the attacker's perceived moment rather than only against the target's newest position.

### 7.2 Guard

Holding secondary attack raises Guard.

- Protects only a **115-degree frontal cone**.
- Blocks sword attacks, not Fireball.
- Uses **100 Guard Stamina**.
- A normal blocked sword strike costs **35 stamina**.
- Stamina regeneration begins after **1.0 second** without meaningful guard drain and restores **40 stamina per second**.
- Reaching zero causes **Guard Break** and **700 ms** of defender stagger.

Guard stamina should be contextual UI, not a permanently dominant resource bar.

### 7.3 Perfect Guard / Parry

The initial **180 ms** after raising Guard is the parry window.

A successful parry:

- negates the sword hit,
- consumes little or no guard stamina,
- staggers the attacker **450 ms**,
- interrupts the attacker's current combo,
- triggers a distinctive metallic sound, spark burst, weapon recoil, and brief **PARRY** confirmation.

The server timestamps guard initiation and applies bounded latency compensation so moderate ping does not make the timing mechanic unusable.

### 7.4 Fireball

Fireball is a visible projectile and the primary answer to passive guarding and ranged pressure.

Initial values:

- Direct damage: **28**.
- Cooldown: **4.0 seconds**.
- Cast commitment: **300 ms**.
- Projectile speed: **24 m/s**.
- Splash radius: **2.0 m**.
- Splash damage falls linearly from **28** at direct impact to **12** at the radius edge.
- Guard does not block Fireball.
- Fireball applies meaningful but not extreme knockback.

The client predicts the cast animation immediately, but the server validates cooldown and spawns the authoritative projectile.

### 7.5 Arcane Dash

Dash is burst repositioning, not invulnerability.

Initial values:

- Cooldown: **5.0 seconds**.
- Distance: **5.0 m**.
- Burst duration: **180 ms**.
- Direction follows movement input; defaults forward.
- Usable in the air when off cooldown.
- No general damage immunity.

The local client predicts the dash immediately; the server validates and simulates it authoritatively.

### 7.6 Resource philosophy

No mana in v1.

- Sword: timing/commitment limited.
- Guard: stamina limited.
- Fireball: cooldown limited.
- Dash: cooldown limited.

This avoids unnecessary overlapping resource systems.

## 8. Health, recovery, death, and knockback

- Maximum health: 100.
- Three unblocked sword strikes defeat a full-health player.
- No in-combat passive regeneration.
- After **5.0 seconds** without taking damage, health regenerates at **20 HP per second** until full.
- Ordinary arena falls do **not** deal fall damage in v1; falling into an abyss kill volume is lethal.
- Sword applies small knockback.
- Fireball applies medium knockback.
- Environmental positioning is strategically meaningful.

The server records recent attackers/knockback sources. If a player falls into the abyss shortly after meaningful enemy displacement, the responsible enemy receives the kill and the kill feed can say that they "sent" the victim into the abyss.

## 9. Match rules

### Mode

**Free For All** in v1.

This avoids team assignment, friendly fire, team balancing, and team-specific UI while preserving the mission requirement that two players can immediately play.

### Victory

- First player to **10 kills** wins.
- If nobody reaches 10 before **6 minutes**, highest kill count wins.
- Tie behavior can enter a short sudden-death condition or award a draw; v1 implementation should choose one explicit behavior rather than leave ambiguity.

Recommended v1 rule: tied leaders at time expiry continue until one tied leader gains the next kill.

### Respawn

- **3.0-second** respawn delay.
- 8–10 candidate spawn points around the arena.
- The server scores spawn points for enemy distance, enemy line of sight, and recent spawn use.
- **1.0 second** of spawn protection; attacking immediately cancels it.

### Match lifecycle

Explicit room state machine:

```text
WAITING -> COUNTDOWN -> PLAYING -> FINISHED -> REMATCH_COUNTDOWN -> PLAYING
```

Players may join active casual matches and begin at zero score.

## 10. Rooms and joining

### Main menu

- Player name field.
- **Quick Play**.
- **Create Private Room**.
- Room code field + **Join**.
- Compact **How to Play** panel.

No accounts are required.

### Private rooms

Creating a room produces a short readable code, e.g. `FIRE7`, and an invite URL such as `/?room=FIRE7`.

The room supports up to eight players. Two players are enough to begin. Joining an active match is permitted. The server owns the room; the creator leaving does not terminate the match.

Empty rooms are cleaned up after **60 seconds**.

### Reconnection

Each joined player receives a temporary session token. After an unexpected disconnect, the server retains that player slot and score for a **15-second reconnect grace period**. Reconnecting with the same token restores the player; after 15 seconds the slot is removed normally.

## 11. Arena: The Shattered Keep

The first map is a compact ruined sorcerer's fortress suspended over a mist-filled abyss. It is deliberately sized so players normally find combat within roughly 5–10 seconds.

Primary footprint target: **36 m across**, with vertical extensions.

### Central Courtyard

Mixed-range anchor space containing:

- broken pillars,
- partial walls,
- stairs toward battlements,
- a raised central feature,
- **The Arcane Spire**, a floating broken crystal landmark visible from much of the map.

The courtyard supports mixed sword/fireball play and provides the main visual orientation point.

### West Hall

Tighter melee-favoring route with columns, arches, short stairs, corners, and broken interior walls. Fireball sightlines are constrained; sword pressure and Guard matter more.

### East Hall

More open magic-favoring route with longer lines of sight, a damaged ceiling, and an elevated gallery, while still providing cover.

### Battlements

Elevated routes with a mixture of safe courtyard-facing drops and lethal abyss-facing edges. These make knockback strategically meaningful without turning every high surface into automatic death.

### Broken Bridge

A meaningful connector wide enough for real combat but exposed enough that knockback and Fireball matter. A small damaged gap may require an easy jump or Dash crossing.

### Vertical shortcuts

Players may intentionally drop from upper routes into lower combat areas rather than always using stairs, increasing route connectivity and chase options.

### Map collision/data model

The map is defined as shared structured data using simple primitives such as boxes, floors, ramps, platforms, and kill volumes. The client uses those definitions to render the environment; the server uses them for authoritative collision. This minimizes client/server disagreement about the playable space.

## 12. Visual direction

The game should look like a stylized low-poly fantasy arena, not a Minecraft clone and not a generic Three.js tech demo.

### Character language

Remote players use a simplified but readable fantasy fighter silhouette:

- blocky armored torso,
- oversized shoulders / simple armor masses,
- simplified boots and hands,
- helmet/hood options later,
- clearly readable sword,
- magical off-hand presentation,
- individual accent color on cloth/trim/glow rather than full-body recoloring.

Required readable states:

- idle,
- run,
- jump,
- sword attack,
- guard,
- cast,
- dash,
- stagger,
- death.

Combat animation is information: a raised sword means Guard, a glowing hand means casting, and a wind-up means an incoming strike.

### First-person body

Render arms + weapon only in v1. Avoid full first-person body rigs until necessary.

### Environment palette

- Dark blue-gray stone.
- Warm torch/brazier light.
- Cyan/violet ambient magic.
- Orange/gold Fireball effects.
- Red reserved primarily for damage communication.

The distant world may include clouds, ruined silhouettes, mountains, floating masonry, and magical debris to create scale without expanding playable geometry.

## 13. HUD and interface

The game should feel like a game launched in a browser, not a website that happens to contain a game.

### HUD hierarchy

- Central crosshair.
- Health.
- Fireball and Dash readiness/cooldowns.
- Match timer and score target.
- Contextual Guard Stamina.
- Kill feed.

Avoid MMO-style action bars and excessive explanatory UI.

### Cooldowns

Ability icons visually darken during cooldown and show a circular or numeric countdown. Readiness should be obvious without calculation.

### Guard UI

Guard stamina appears prominently while guarding or recovering from a guard interaction, then recedes when irrelevant. **GUARD BROKEN** briefly appears when stamina reaches zero.

### Hit feedback

Successful attacks provide:

- hitmarker change,
- impact sound,
- particles/sparks,
- target reaction/knockback,
- immediate health/damage feedback.

A kill produces a stronger confirmation such as **SLAIN +1** under the crosshair.

### Damage feedback

- brief screen-edge response,
- directional damage indicator,
- health bar with a delayed damage trail,
- small camera impulse where appropriate.

### Kill feed

Examples:

- `Aden ⚔ Morgan`
- `Sam 🔥 Aden`
- `Aden sent Morgan into the abyss`

Flavor should be concise and lightly theatrical rather than meme-saturated.

### Death screen

Short and momentum-preserving:

```text
SLAIN BY
MORGAN

RESPAWNING IN 2.1
```

No manual respawn button is required.

### End-of-match

Display winner, kills, deaths, and optionally one inexpensive secondary stat such as most parries or most abyss kills. Provide **Play Again** and **Leave Match**. Rematch should keep the room intact.

## 14. Game feel and audio

Perceived quality depends heavily on impact presentation.

Required minimum sound categories:

- sword swing,
- sword hit,
- block,
- parry,
- Fireball cast,
- Fireball flight/impact,
- dash,
- player damage,
- death,
- respawn,
- countdown,
- kill confirmation,
- victory.

The three sword strikes should escalate acoustically—roughly **TING -> CLANG -> CLANG!**—with the final strike receiving stronger weapon recoil, impact particles, and camera impulse.

Fireball should visibly form during the cast, travel as a bright irregular magical projectile with embers/trail, and create a short impact burst/shock effect rather than appearing as a plain colored sphere.

Dash presentation may use a slight temporary FOV increase, peripheral streaks, and a short directional sound rather than heavy motion blur.

Parry receives disproportionate polish: sharp metallic sound, spark burst, attacker weapon recoil, and brief confirmation.

## 15. Performance constraints

Prioritize responsive multiplayer over graphical extravagance.

- Target **60 FPS at 1080p** on an ordinary recent student laptop with integrated graphics at the default quality preset.
- Low-poly geometry.
- Conservative dynamic lighting and shadow distance.
- Pooled/reused particle objects where sensible.
- Limited post-processing.
- Avoid expensive physics and excessive real-time effects.

Menus may be responsive on mobile, but first-release combat is keyboard + mouse desktop/laptop first.

## 16. Typed network protocol

All socket payloads are TypeScript-defined in shared code.

### Client -> Server

Representative messages:

- createRoom
- joinRoom
- playerInput
- attackDown
- attackUp
- guardDown
- guardUp
- castAbility
- requestRematch

### Server -> Client

Representative messages:

- roomJoined
- playerJoined
- playerLeft
- worldSnapshot
- playerDamaged
- playerDied
- projectileSpawned
- projectileImpact
- matchCountdown
- matchStarted
- matchEnded
- serverCorrection / validation rejection when necessary

The implementation may consolidate related events where that reduces complexity without weakening type safety.

## 17. Latency behavior

### Parry

The server records guard start time and permits a bounded latency-aware evaluation window. The client does not decide whether a parry succeeded.

### Melee

The server maintains short player transform history and evaluates melee against rewound target positions based on bounded input timing/latency estimates. This reduces the "I clearly hit them" problem without full rollback netcode.

### Projectiles

Fireball is server-simulated and therefore naturally less dependent on rewind logic. The client predicts only the casting presentation before authoritative spawn confirmation.

## 18. Abuse resistance

The objective is not professional anti-cheat. The objective is to make obvious browser manipulation ineffective.

Server validation covers:

- movement limits,
- jump legality,
- dash cooldown,
- sword timing/range/arc,
- guard/parry timing,
- Fireball cooldown,
- projectile collision,
- health,
- damage,
- death,
- score,
- respawn.

Changing client variables in DevTools must not allow a player to authoritatively set health, score, movement speed, or damage.

## 19. Deployment and production configuration

- Frontend is served over HTTPS from a static/CDN-capable host.
- Backend runs as a persistent Node service with WebSocket support.
- Production uses secure WebSocket transport (`wss://`) as appropriate.
- Production CORS permits the intended game origin(s); localhost is allowed only in development configuration.
- Frontend receives backend URL through environment configuration rather than hard-coded development values.

The final provider selection should optimize for reliable WebSocket hosting and low deployment friction rather than brand preference.

## 20. Debugging tools

A hidden/development F3 overlay should expose useful diagnostics such as:

- FPS,
- ping,
- server tick,
- player position,
- room code,
- player count,
- room state,
- prediction error where available.

During development, test under artificial **50 ms, 100 ms, 150 ms, and 250 ms round-trip latency**. The game should remain meaningfully playable around 100–150 ms even if timing precision degrades somewhat.

## 21. Testing strategy

### Unit tests

Cover deterministic rules including:

- sword combo timing,
- sword damage/death after three hits,
- guard stamina drain/regeneration,
- parry window,
- cooldown calculations,
- Fireball damage falloff,
- kill attribution after knockback/abyss death,
- spawn scoring,
- room-code generation,
- match win/timer logic.

### Simulation tests

Examples:

- a second Dash during cooldown is rejected,
- a sword contact during the parry window staggers the attacker and deals zero damage,
- a normal Guard drains stamina,
- releasing attack prevents later combo strikes,
- stagger cancels an active sword combo.

### Integration tests

Use at least two Socket.IO test clients to verify:

- room creation/join,
- countdown start,
- authoritative match start,
- damage propagation,
- death/respawn,
- score update,
- match end,
- rematch lifecycle,
- clean disconnect.

### Human playtest criteria

Every meaningful playable build should be judged on:

- movement immediacy,
- remote-player smoothness,
- clarity of sword contact,
- clarity/fairness of Guard and Parry,
- Fireball dodgeability,
- usefulness of Dash,
- spawn fairness,
- time-to-contact in the arena,
- UI learnability,
- whether players voluntarily select **Play Again**.

## 22. Competitive quality bar

The Handshake mission minimum is not the internal product bar.

Minimum mission bar: two remote players can connect and follow real rules at a public URL.

Swords & Sorcery bar: the URL feels like a small finished browser game; the first match begins with almost no friction; the combat produces understandable counterplay and memorable environmental kills; and the user has a reason to rematch.

## 23. First playable milestone

The first milestone qualifies as a real game only when all of the following work together:

- two remote players connect,
- local movement feels immediate,
- remote movement is acceptably smooth,
- sword hold-combo works,
- Guard works,
- Parry works,
- Fireball works,
- Dash works,
- authoritative damage/death works,
- respawn works,
- scoring works,
- first-to-10/timer match conclusion works,
- rematch works,
- The Shattered Keep provides usable combat topology,
- HUD communicates controls and state,
- core sound/impact feedback exists,
- deployment is public.

Only after this milestone should the project prioritize classes, additional maps, advanced presentation, or progression systems.

## 24. Likely post-core expansion

Once the first milestone is proven fun, the safest expansion is to convert the shared Spellblade foundation into class variations rather than invent unrelated mechanics.

Potential examples:

- **Knight:** stronger Guard / more health / weaker ranged pressure.
- **Arcanist:** stronger projectile/control magic / weaker melee survivability.
- **Spellblade:** balanced baseline mobility and mixed-range kit.

Exact classes, additional spells, and new maps are intentionally outside this implementation specification and should receive their own design pass after playtesting the shared foundation.
