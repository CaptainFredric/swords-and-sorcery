# Castleward — Per-player siege fleets: authoritative migration contract

**Status:** Design and ownership foundation only. The engine is not yet
multi-instance. Do not remove one-per-room checks before the physics, damage,
protocol and renderer sections below have been integrated and tested.

## Player-facing rule

Each living human player may own **at most one active machine of each type**
(Fight-and-Flight, Bi-Bye-llista, SO-FIST-ICATION) in a match. They may keep
all three on the battlefield at once. The machine's **owner** is its builder;
the current **operator** may differ and may change. Loss to the abyss,
destruction, retirement or intentional dismantling releases that owner's
(type, owner) slot. Ordinary dismounting does not.

High Grounds retains the foundry's team-wide production cooldown: a player
cannot bypass it by switching machine types, operator or builder. A teammate
can build after cooldown even when their teammate's same-class machine is
already alive. In Shared Practice, ordinary players should be able to
construct/replace their own machines; host-exclusive permissions remain only
for global practice settings and hostile siege operators.

No client can choose an arbitrary machine owner. The host assigns ownerId
from its authenticated command issuer. Machine IDs are unique over the
whole room, not only per class/player. Persistent ownership is not changed by
mounting, disconnect/reconnect or enemy capture.

## Migration steps

1. **Normalize the Room registry.** Authoritative
   `room.siegeMachines: Map<string, Machine>`, plus an
   `owner/type -> machineId` index and a monotonic room-wide revision.
   Attach `ownerId` to every construction. Preplaced map equipment uses
   `ownerId:null` and doesn't consume a player's quota. Keep existing
   singleton fields only as temporary compatibility projections; never
   treat them as the source of truth after collection support is enabled.
   Explicitly assign a `machineId` for every mounted command, selecting
   from the authenticated player's `operating*Id` rather than client input.
2. **Refactor the full simulation.** Iterate machines during fixed 30-Hz
   movement, control/skill ticks, Steel repair, wreck disposal, projectile
   handling and hit volume construction. Use a shared spatial index or
   query by type/position; never compare only with `room.fightFlight`
   or the other current singletons. Ram piston, rotor sweep, spells, arrows
   and siege bolts must route to the *actual contacted machine ID*.
   Every queued projectile/release keeps its originating machine ID.
   Projectile clocks, HP, Skill, charge, rotor and ammo remain per instance.
3. **Mount and lifecycle transactions.** Mount/dismount resolves the chosen
   instance, validates proximity, and synchronously changes operator only
   for that instance. No player may operate two machines simultaneously.
   Building/rebuilding/dismantling always addresses the *owner's* existing
   machine of the same type, not a neighbor's. Physical destruction, terminal
   Dive and abyss loss remove precisely the impacted machine. Disconnect
   dismounts the player but doesn't silently transfer ownership or delete
   their standing equipment.
4. **Versioned network snapshots.** Introduce
   `siegeMachines: {flight:[], ram:[], ballista:[]}`, each keyed by
   `id`, with `ownerId`, `operatorId`, all authoritative components,
   and revision. Preserve legacy singular fields only during an explicit
   dual-format migration; never show two clients different authoritative
   ownership. Events always include `machineId` and dedupe per instance.
   Reject out-of-order machine revisions independently.
5. **Client collections.** Each GLB renderer, effect clock, hit marker and
   projectile trace must be keyed by machine ID, with disposal on retirement.
   Mounted HUD/camera selects via the local `operating*Id`, not the first
   vehicle of that class. Unoccupied vehicles remain visible/collidable.
   Build UI shows each player's three type slots, with currently active
   machines marked by actual IDs, not a global “already exists” message.
6. **Regression matrix.** Two or more same-class machines and all three
   different classes coexist; two players simultaneously operating the
   same class; independent HP/ammo/skills; one player's rebuild leaves another
   undisturbed; cross-machine collisions route component damage correctly;
   projectiles preserve originating ID; spectator and both clients see
   identical inventory; death/dismount/disconnect and High Grounds cooldown
   remain correct; individual machine abyss loss frees only its owner's slot.
   Include actual Chrome multiplayer, not just Node object tests.

## Safety constraints

- **No global singleton swap** around calls into combat: indirect
  callbacks and overlapping projectile queries would route damage to a
  different vehicle and break multiplayer determinism.
- Don't broaden a builder's fleet quota before every combat, wire and
  client consumer uses collections. Silently hiding a second machine is
  not implementation.
- Keep terminal Dive one use per physical Fight-and-Flight chassis, not
  once per player or per match. A replacement chassis can have its own
  one-time dive.
- Keep active machines independent from destroyed-but-visible wrecks;
  a wreck must not occupy a player's type slot.
