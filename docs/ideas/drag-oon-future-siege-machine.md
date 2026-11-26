# DRAG-OON — Future siege machine concept

Status: reserved future concept, not playable; no implementation or balance commitment. Conceived November 26, 2026. The Workshop's fourth slot is a non-interactive acknowledgement only. Do not add a machine ID to the runtime roster, loadout, picker, networking, AI, practice spawning or model loader until the machine is deliberately commissioned.

## Identity and construction

Drag-oon plays on drag-on, dragon and dragoon. A large, bulky, enclosed medieval incendiary siege machine, slow to travel but able to turn and steer in any direction, including pivoting in place through internally cranked wheel assemblies. The operator sits inside its armored shell. Low-mounted flamethrower cannons sit near the bottom frames; their low placement is essential to its ground-control identity. It has high hull HP, a hard shell immune to damage over time, and perpetual Sheathed in Steel. Direct damage, component damage, afflictions, operator protection and destruction rules still need explicit design. Do not conflate DoT immunity with immunity to all Fire or impact damage.

Visual direction: Castleward's authored mechanical siege aesthetic: forged overlapping steel, riveted iron, restrained brass fittings, dark timber where structurally appropriate, exposed practical mechanisms and a distinct heavy enclosed silhouette. Recessed wheels, low swiveling flame cannons and an underside fuel discharge system. Dragon-like presence through construction, not a literal dragon creature or modern tank. Final model, proportions, number of wheels/cannons and palette are not yet specified.

## Built-in abilities (provisional roster)

### Desolation Spray — main attack
Engulf nearby ground and enemies with sustained flames from the low-mounted cannons. The intentionally mundane, product-like word “Spray” contrasts with “Desolation.” Fuel, range, cannon arcs, damage and ordinary flame persistence remain to be tuned.

### Fire's the Limit — explosive leap
Release explosive fuel beneath the chassis and ignite it. Propel the heavy machine high into the air over a moderate distance in a chosen direction, then land with a slam. The hard shell protects the machine from its own launch; an explicit self-ignition damage exception will be required if direct blast damage otherwise applies. This is a built-in movement/attack ability, not an equipped Skill. Drag-oon is a ballistic leaper, not a second Fight-and-Flight. Launch and landing damage, steering, fuel cost, cooldown and terrain interaction remain open.

## Candidate equipped Siege Skills

### Raze the Pasture (preferred name; also considered Raze the Rapture / No Green Grass)
While held, stand still and leak fuel, exposing the machine to enemy action despite its armor. An orange circular ground indicator shows the projected ignition area. Its radius grows at a diminishing rate with hold time. On release, briefly delay, then ignite the indicated area.
- Larger areas erupt with greater initial damage.
- Smaller areas retain their fire longer; the intended area/duration tradeoff should be preserved. Exact relationship to hold duration is still open.
- Intended for sustained area denial, not merely burst damage.
- Fuel rules, interruption behavior, radius/damage curves, persistence and recovery are not finalized.

### Flight Like Hell (preferred name; previously considered Searing Soar, Firefly, Fly as the Sun, Fly to Hell, Spray Desolation, Desolation Spray)
Usable in midair. Blast the lower cannons downward in a powerful, moderately large, partially aimable cone. Thrust opposes gravity and slows descent; with sufficient fuel the chassis can nearly hover for a few seconds. The discharge consumes fuel rapidly and reduces the eventual landing slam somewhat, without making the heavy landing harmless.
- Intended to deal the highest damage over time in the game and burn through pavises or shields.
- Damages maximum health (exact maximum-HP damage/reduction semantics and recovery rules still need confirmation).
- Scorches the ground so thoroughly that it cannot receive persistent environmental effects: a field against fields. Define duration, spatial overlap, existing versus newly created fields, friendly effects and interaction with direct spell impacts before implementation. A temporary, indiscriminate suppression zone is a design suggestion, not final canon.
- Long cooldown and overheated flamethrowers. Temporarily caps maximum usable fuel; the capacity penalty decays over time. Duration-dependent severity is a possible tuning direction, not yet approved.

## Open decisions

No numerical stats, fuel regeneration, cooldowns, third Skill, component breakdown, control bindings, hit volumes, animations, resource rules or model assets have been finalized. Existing playable machines must remain untouched until a dedicated design and implementation pass. The two candidate Skills are alternatives in the established Siege Skill loadout system, not simultaneous built-ins.

Concept distinction: Raze the Pasture establishes persistent burning territory; Flight Like Hell attacks from above and destroys the territory's ability to sustain persistent effects. Desolation Spray and Fire's the Limit are the shared baseline.
