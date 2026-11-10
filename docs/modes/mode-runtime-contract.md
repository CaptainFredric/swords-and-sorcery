# Castleward authoritative mode contract — Phase 1B

**Location:** `shared/sim/modeRuntime.mjs`  
**Reference implementation:** `shared/sim/restlessDayMode.mjs`  
**Integration branch:** `feat/restless-day-phase-1-20261107`, PR #402 (draft).

This is an **opt-in extension** of existing Castleward room/combat, *not* a replacement for the existing Free-for-All, Breakthrough or High Grounds implementations. Independent modes (Renown Trials and Edge of Victory) should register only their own handlers. Never import Restless Day state, AI, victory conditions or scenery into either mode.

## 1. Registration

1. Declare an exact id in `shared/src/modes.mjs` (`GAME_MODES`), its policy, and a dedicated arena list if applicable. `teamMode`, `teamSize`, `timed`, `matchSeconds`, `scored`, `respawnSec`, `autoStart`, `allowRematchVote`, `botCount` use existing policy semantics. `fixedTeamSize:true` disallows overriding the declared team count; `privateCustomRoom:true` allows private rooms without listing a not-yet-validated mode in `PUBLIC_ROOM_MODES`. Public matchmaking is a **separate opt-in** via `PUBLIC_ROOM_MODES` after verification.
2. Register the authoritative world in `shared/worlds/registry.mjs`, with real supported collision floors, ramps, solids, enemy/team spawns and optional `structures` (`solidIds` matching the actual world solids). Use `client/worlds/WorldRendererFactory.mjs` to select the correct client visual module, and add the renderer to GameRuntime's renderer table. The client's visual mesh does **not** define authoritative collisions.
3. Create `shared/sim/<newMode>Mode.mjs`, export a frozen `HANDLER` object, and add `[GAME_MODES.NEW_MODE, defineModeHandler(GAME_MODES.NEW_MODE, NEW_HANDLER)]` to the static `handlers` registry in `modeRuntime.mjs`. Eager registration checks each hook name against the exported `MODE_HOOKS` contract and rejects non-callable or misspelled functions. Import only a module already present. Do not create placeholder imports of future modes.
4. Add a small pure UI adapter (for instance `client/ui/restlessDayHudView.mjs`) for the mode-specific `snapshot.modeState`. Maintain events/voice in the runtime's event consumer. No gameplay-authoritative calculations in the client renderer.
5. Add server tests for room creation, player limits, real physics/navigation, reset, commands, structure/time ordering and snapshot serialization; add a separate real-browser acceptance suite and preserve failure artifacts.

## 2. Hook signatures and return semantics

The dispatcher calls `modeCall(room,hook,...args)`, which prepends `room`; an unregistered hook returns `undefined`. All hooks are optional. The serialized `modeSnapshot(room, nowSec)` explicitly returns `null` when the mode has no mode state.

| Hook | Invocation | Contract |
| --- | --- | --- |
| `ownsTeamObjectives(room)` | Room construction/configuration/reset and simulation dispatch | Return `true` to opt out of legacy Breakthrough capture objectives (without disabling ordinary team combat). Without this hook, legacy behavior is unchanged. |
| `init(room)` | Room construction or mode change in waiting lobby | Initialize exclusively owned mode state; capture its canonical base world if a dynamic world is needed. Do not start the match timer here. |
| `beforeSpawns(room, nowSec)` | Before assigning first-spawn/rematch positions | Reset transient phase/spawn progression before bots and humans are placed; do not mutate unrelated combat state. |
| `reset(room, nowSec)` | Match start/rematch after ordinary actor/machine reset | Reset all mode state and set the mode-owned deadline from the authoritative match clock; may push `room.events`. |
| `baseWorld(room, previousWorld)` | Every authoritative simulation tick, before structure collision filtering | Return canonical persistent geometry to prevent accumulating procedural solids and stale collision shapes. Omit to keep the existing world. |
| `composeWorld(room, structureFilteredWorld)` | After destroyed structure solids are removed, before player/vehicle physics | Return collision/nav geometry augmented with **current** ephemeral bridges, ladders, hazards, etc. Cache immutable variants when possible; both server and client must share collision math. |
| `step(room, dt, nowSec, {damage})` | After ordinary physics and combat, while playing | Advance mode-owned interactions/objective AI, using ordinary `applyDamage` callback. Must not duplicate generic combat ticks or invent rival movement. |
| `command(room, player, message, nowSec)` | Via mode-specific input dispatch in `wire.mjs` | Validate actor/team/current room state/range and return `{}` on success or `{rejected: '...'}` on denial. Do not treat a missing handler as success. |
| `spawn(room, player, allSpawns)` | Room start and authoritative respawn | Return an array of valid, grounded spawn points, or `null`/`undefined` to use legacy selection. Only use points belonging to the actual world. |
| `botGoal(room, actor)` | Shared bot AI | Return a valid world-space `{x,y,z}` goal. The shared pathfinder/locomotion remains authoritative. |
| `botAct(room, actor, nowSec, {ai, world, wayToward, tryCastSpell})` | Shared bot AI, before its own movement and combat | Return `true` after setting the bot's inputs (and using only the interactions a player has) for this tick; anything else hands the bot to the shared brain. Restless Day uses it to lift, carry and set up siege ladders and to burn ladders from the walls. |
| `botOccupation(room, actor)` | Shared bot AI before its generic combat choice | Return `'carry'` when equipment commits both hands to a route. The shared movement/navigation brain routes the carrier, disables combat and waits for mode interactions to place/retrieve the item. Other values are not yet supported. |
| `beforeStructureDamage(room, structureId, nowSec)` | Before mutation of a validated structure hit | Return **strictly `false`** to reject mutation; used to arbitrate time-locked outcomes. Undefined means proceed. Never mutate structure health indirectly from this guard. |
| `onStructureDamage(room, structureId, nowSec)` | After actual health change and event | React to a zero-health structure and finish the match once. Do not give duplicate rewards/victories. |
| `onTime(room, nowSec)` | From `Room.tick` every playing tick of a timed room | Return **truthy** when the mode fully owns time/ending even *before* expiry. If missing or falsy, the existing clock/overtime logic runs. Ownership does not itself mean expired. |
| `serialize(room, nowSec)` | Every shared snapshot | Return JSON-safe mode-owned state, not references to mutable players or Three.js objects. Prefer one `snapshot.modeState` tree, source of truth for HUD and synchronized presentations. |

**Ordering and authority.** On a normal simulation step, Room.tick resolves already-expired match clocks **before** movement/attacks; legacy capture/high-ground steps apply only for their modes; canonical world/structure removal/optional world composition precede movement, siege physics and projectiles; `step` advances the mode after combat; snapshots serialize from authoritative state. Structural hits anywhere in the pipeline call `beforeStructureDamage` **before** health mutation, then `onStructureDamage` after successful mutation. Thus `nowSec >= deadline` cannot reduce the Renowner to zero; a legitimate `nowSec < deadline` hit can cause immediate surrender.

Time comparisons use **server-local monotonically sampled seconds**; do not independently count `dt` in client or bot AI. Two events with equal authoritative timestamps are resolved by explicit policy, not incidental iteration order. Restless Day chooses sundown on equality, surrender strictly before. Other modes may implement different ties.

## 3. Presentation events

The mode can emit `room.events.push({type,at,...})`; the normal room event pipeline delivers these to all clients. The client may trigger subtitles, interpolation, smoke, sound and collapse poses from events, but must not independently award victories. Store persistent objective data in `snapshot.modeState` (phase, machine/ladders, deadline, health). Events are one-shot transient reactions; late joiners use snapshots rather than replaying prior voice.

Example *Restless Day* event keys: `restlessDaylightStarted`, `restlessLastLight`, `restlessCurtainBreached`, `restlessLadderPlaced`, `restlessLadderDamaged`, `renownerSwordWarn`, `renownerCoinLaunched`, `renownerDestroyed`, `restlessSundown`. Dialogue concepts are **not recorded voice assets** unless the files and voice manifest are verified.

## 4. Geometry and networking expectations

- Spawn points are **feet coordinates**, not body centers. Test the full player radius/height, upper parapets, machine clearance, solid-body separation and the transition from ramp to supported ledge. `runClear` checks body-width rays and repeated underfoot support, not just nodes' point coordinates.
- Closed walls may genuinely partition a pathfinding graph; for an assault mode, verify routes **after the actual opening mechanism exists** (deployed ladder, destroyed gate), rather than adding impossible edges through stone to make a test green.
- A dynamic ladder deployment must produce the same id/coordinates and ramp orientation for the authoritative simulation and local prediction. Reuse `withRestlessLadders` only in Restless Day's geometry provider and its client movement; do not attach Restless-specific geometry to another mode.
- Dynamic worlds should retain stable object identities across ticks when unchanged to avoid redoing O(nodes²) route connectivity at each frame. Rebuild only when structural revision or ladder placement actually changes.
- Physics and win-state verification should use real `stepRoom` (or the production server) and avoid hand-editing `room.state` in gameplay code. Browser test instrumentation that teleports setup actors or injects damage must be labeled as a staged test, not an unassisted gameplay proof.

## 5. Separate objectives for the next two mode authors

**Renown Trials:** own wave schedule, Renown payout, overdue probability and ceremonial verdict; reuse the *concept/art asset* of the Renowner but do **not** reuse `RESTLESS_DAY_HANDLER` or its destructive battle AI, ladder geometry or “sundown means sleep” policy. Overdue trial completion is not identical to match timeout.

**Edge of Victory:** own arena shrink/resolve boundary, player count and last-knight-standing logic; use ordinary movement plus a narrowly scoped outward-displacement constraint. Do not reuse Restless Day objective capture/clock. The boundary is **psychological refusal**, not damage fog or an orc.

Both authors: make a separate feature branch + draft PR; consume this exact contract only after checking it against the latest integration branch head. The PR #402 conversation comment publishes the exact handoff SHA and is the shared coordination point. Cross-branch work must be merged/reconciled deliberately; never force-push another developer's branch.

## 6. Verification status and known barriers (November 7, 2026)

- PR #404's merged combat and All-Natural Disaster voice/audio assets were integrated using a genuine two-parent merge commit `e391d18d9dbb8e3a49432fcb6ac0cc02957e61f6`. Both parents' histories remain intact.
- Baseline PR #402 CI recorded eight failures (4 Restless integration expectations plus 1 existing Steel repair and 3 Argon files). Main at `8629628dab1d731ed264e010e2ae6c8424a0bf04` has precisely the same **four** SO-FIST failures, independently confirming they are inherited, not newly introduced by Restless.
- Navigation was evaluated geometrically with both real ladder slopes deployed: **101/101 linked nodes; 329 passable bidirectional links; zero isolated nodes**. This validates static connectivity in an assault configuration, not real bot arrival times.
- Added real 30Hz ten-actor server simulation/ladder regression tests and a real Chrome workflow `scripts/restless-day-browser.mjs`; the latter explicitly labels staged warps, accelerated clock and injected damage. Any workflows still queued are **not** passes.
- Remaining: end-to-end real human 5v5, mobile control overlap and lag, full wall-lip movement, bot tactical path completion, live machine deployment/repair, final Argon model/animation binary, fully authored VO. Neither deployment nor merge is permitted until validation is complete.
