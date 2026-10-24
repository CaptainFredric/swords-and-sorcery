# Siege machinery and defense contract

For Antigravity's larger siege battlefield. This branch changes Bastion Breach only. Larger battlefield layout, terrain, sightlines and ballista placement remain Antigravity's responsibility.

## Selected structures

A world may expose `structures: [{ id, name, solidIds, profile, team }]`. `solidIds` refer to that world's existing axis aligned world solids. A structure can own several solids; failure removes all of them together. Profile is `timber` or `reinforcedTimber`. Team is the owning team; friendly damage is refused. Leave essential boundaries, permanent architecture and capture gates outside this list.

`createStructureState(world)` initializes the room's `{ revision, entities }` health map. `structureWorld(baseWorld, state)` returns a cached collision variant. Use that variant for movement, terrain, projectile tracing, machinery and bot navigation. It retains stable identity until the failed set changes. Gate phase selection happens first; structural filtering follows. Never apply broken state by mutating the canonical world.

`damageStructureSolid(room, solid, amount, attackerId, source, now, {point})` handles actual first contacts. The sword, ordinary projectile, upper bolt, heavy bolt, piston and charge integrations already call it or `damageStructure`. Only an authored structure can receive health damage. Health, hit time, failure time and revision travel in every snapshot. `structureDamaged` events provide transient feedback; reconnect relies on snapshot state rather than event history.

Current reinforced timber: 600 HP. Armored piston240, exposed shaft120, full normal frontal charge up to180, heavy siege bolt153, clean ordinary30HP sword13.5, Fireball10.8. A charge and overlapping first piston share a240maximum contact budget. Subsequent deliberate strokes remain independent. Timber profile:240HP with lighter resistances. Shared player damage, spell cooldowns and ram animation timings remain unchanged.

## Emplacement

A team world may expose one `siegeEmplacements` entry: `{id,type:'so-fist-ication',team,phases:[0,1],x,y,z,heading}`. At match start Room validates actual wheel support, chassis clearance and the rear operator station, then creates one authoritative ram. The entry controls team and permitted operating phases. Enemy mounting and friendly damage are refused, including when empty. Destruction persists until rematch. No construction command, economy or automatic respawn is involved.

Bastion uses the approach at(0,0,-23), headingPI. It receives no ballista. This singular emplacement contract reflects the current Room's singular ram field; multiple concurrent emplacements require an explicit future collection design.

## Rendering and authoring checks

`StructureRenderer(scene, world)` supplies timber planks, iron reinforcement, damage cracks and bounded settled debris. Call `update(snapshot.structures, serverNow)` and `dispose()` on world changes. Static map renderers must omit the matching solid IDs, so failed objects never retain a duplicate intact mesh. Current supplied visual construction assumes a screen oriented across X; a differently oriented defense needs its matching authored renderer while retaining the same health/collider contract.

Call the shared structural filter in client prediction as well as authority. The runtime currently does this automatically. Ensure waypoints can reach alternate routes while each defense remains intact. Preserve capture dependencies independently of structural health. Do not use a destructible panel to bypass phase boundaries.

No direct Antigravity messaging connection was available in the current Codex chat inventory. This document and the stacked PR provide the concrete integration handoff; no external map files were edited.
