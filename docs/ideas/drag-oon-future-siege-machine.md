# DRAG-OON — Incendiary Cooperative Siege Engine (Experimental Prototype)

Status: **Playable experimental prototype** (`feat/drag-oon-prototype`). Excluded from public matchmaking (`seekSiege`), public room creation/browsing, and the standard 3-machine Siege Blades roster unless explicitly opted in for local/private Siege Blades bots, Private Rooms (`experimentalDragOon`), or the Practice Yard (`DRAG-OON [EXPERIMENTAL]`). Gemini Neon is developing the final production 3D GLB model separately; this prototype uses procedural V3.1 geometry and centralized mount/station origins in [`shared/src/dragOonConfig.mjs`](../../shared/src/dragOonConfig.mjs).

---

## 1. Identity & Construction

DRAG-OON plays on *dragon*, *dragoon*, and *drag-on*. It is a slow, heavily armored eight-wheeled enclosed mobile furnace that can pivot in place, fire twin low-mounted four-nozzle flame cannons (±60° traverse), propel itself through the air with ignited underside fuel, and house allied Spellblades at shielded casting apertures to infuse its thermal weapons with their elements.

### Core Chassis & Protection Rules
- **Authoritative hull state:** 2200 hull HP (`DRAG_OON_TUNING.maxHealth`), independent left/right twin cannons and 8 wheel stations (`Wheel_FL1..RR2`).
- **Perpetual Sheathed in Steel:** The chassis carries perpetual Steel protection (`innateSteelStrength: 0.55`) plus **hull DoT immunity** against persistent fire/burn sources (`hullDotImmuneSources` in `dragOonConfig.mjs`). Direct projectile blasts, ram impacts, sword/fist hits, and heavy bolts still damage the hull normally.
- **Crew aperture protection & timed boarding/evacuation:**
  - 1 Operator station + configurable passenger stations (`defaultPassengerCapacity: 4`, `maxPassengerCapacity: 6`).
  - Timed boarding (`0.85s`) and timed evacuation (`1.05s`; extended to `1.95s` when unlatching during **Camp Fire**).
  - Living passengers inside closed apertures fire their personal spells from the station's exterior aperture origin without self-colliding against DRAG-OON's hull (`raycastFleet` / `cast` origin support), while being shielded from direct outside impacts unless internal overpressure heat exceeds insulation thresholds or hull rupture catches them mid-evacuation.
  - Passengers still retain **Burning Brotherhood** affinity while riding (`pilotContributes: false`; passengers' primary equipped spells drive elemental infusions: Fire, Frostfire, Gale, Lightning, Steel — partial at 1 matching passenger, full at 2+ or via Practice overrides).

---

## 2. Implemented Innate Abilities & Equipped Siege Skills

### Built-In Abilities
1. **DESOLATION SPRAY** *(Hold Primary Attack / `F`)*
   - After a short `0.16s` pressurized buildup (eliminated cleanly at Lightning Tier II), twin low-mounted articulated four-nozzle cannons spray continuous bounded flame segments along aimed horizontal/pitch angles.
   - Coherent damage cadence (`0.25s` interval) prevents visual multi-nozzle stacking from multiplying DPS; includes rare `<1%` cosmetic aerosol spray-can gag sound (`DragOonSound.aerosolGag`) with zero gameplay timing/cost difference.
   - **Elemental Infusions (Burning Brotherhood):**
     - **Fire (I / II):** Widens spray swath radius (×1.38 / ×1.52), emits radiant heat around the chassis (`4.8m`), deals more direct heat stress, and slows cooling while retained at high heat.
     - **Frostfire (I / II):** Lowers heat accumulation (×0.72 / ×0.50), speeds cooling (×1.38 / ×1.85), and inflicts **Recovery Interference** (`2.2s`: slows stamina regen to `35%` and extends active spell/dash/technique cooldown recovery to `45%` rate).
     - **Gale (I / II):** Stretches plume lifetime (`1.95s` / `3.6s`) into lingering wind-driven flame corridors that push enemies away (`7.5`–`11.0 m/s`).
     - **Lightning (I / II):** Accelerates flame stream speed (×1.55 / ×2.05) and eliminates startup delay at Full Lightning.
     - **Steel (I / II):** Sweeping the jet leaves slow-moving molten Steel flame curtains that attenuate enemy projectiles (up to `-68%` speed/damage), hamper enemy movement (`drag: 0.78`), and stagger enemies struck directly during cannon sweep (`24` impact damage).

2. **FUEL'S THE LIMIT** *(Jump / `Space`)*
   - *“Ignite fuel beneath your hull to propel yourself through the air and crash down upon foes.”*
   - Costs `26` fuel, adds `+18` heat, `12s` cooldown.
   - Opens underside shutters (`0.22s` prep) and blasts downward (`28` damage, `5.0m` launch knockback — explicitly self-exempt for DRAG-OON and its crew), launching the hull along steered horizontal input into a ballistic arc and landing slam (`62` base damage, `5.6m` radius; expanded to `8.2m` + terrain crack cue at Steel II).

3. **STEAM THE TEAM** *(Secondary Attack / `RMB` / `G`)*
   - `25s` cooldown; vents an expanding 360° superheated steam ring up to `12.5m`, scaling blast damage (`12` cold base up to `+46` heat/overpressure bonus) and knockback (`15.0`) with internal heat while venting up to `48` heat and partially relieving overheat fuel-cap penalties (`16`).
   - Douses exposed environmental fires within expanding ring sightlines; infused by Fire (thick high-frontload scald + burn), Frostfire (cooler wider pulse + recovery interference), Gale (longer lingering outward wind ring), Lightning (faster ring velocity), and Steel (dense vapor barrier slowing incoming projectiles up to `72%` and impeding movement).

4. **BURNING BROTHERHOOD** & **ALL ABORT!** *(Crew & Critical Rupture)*
   - **Burning Brotherhood:** Passenger stations channel elemental infusions and slightly aid external Steel repair assistance when active.
   - **All Abort!:** Upon hull destruction (`health <= 0`), DRAG-OON detonates once (idempotent atomic trigger) scaling radius and damage with stored heat, fuel, and active **Brimming with Potential**, ejecting surviving crew outward while inflicting internal blast trauma on anyone caught with an incomplete evacuation (`dragOonTransition` not yet finished).

### Equipped Siege Skills (`U` — Selectable via Workshop & Practice)
1. **RAZE THE PASTURE** (`22s` cooldown)
   - Hold `U` while immobilized to leak pressurized fuel across a growing circular ground ring (`3.2m` → `11.0m` at diminishing growth rate over up to `4.0s`), then briefly ignite (`0.35s` delay).
   - Preserves the **area-vs-duration tradeoff**: smaller quick rings burn much longer (`14.5s`, `16` burst), whereas large fully-held rings erupt violently (`76` burst, `4.5s` burn duration).
   - Enemy interruptions or premature cancellation trigger controlled abort handling.

2. **FLIGHT LIKE HELL** (`28s` cooldown — Midair Activation)
   - Triggered while airborne (typically after *Fuel's the Limit*): blasts all lower nozzles downward in a `14m`, `28°` half-angle aimable cone consuming `34` fuel/s, generating strong downward thrust (`hoverGravityCounter: 20.5` near-hover, capped descent `3.4 m/s`; Full Gale permits climbing at `5.2 m/s`).
   - Deals sustained intense beam/cone fire (`78` DPS vs players, `65/s` guard drain, `90` structure DPS), cushions the eventual landing slam (`0.52` factor, never harmless), rapidly drives up internal heat and `overheatPenalty` (temporarily locking max usable fuel down toward a `25` floor as penalty decays over time).
   - **Frostfire synergy:** Inflicts server-authoritative **reversible maximum health reduction** (`42%` of damage dealt down to a `25` HP floor; restored on respawn/round reset).
   - **Field-vs-Field Suppression:** Scorches hit ground (`5.2m` radius for `8.0s`), extinguishing overlapping persistent elemental fields (`dragOonFlames`, `dragOonRazeFields`, `oneHitFields`, Valkyrie flame pools) and blocking new persistent fields inside the scorched footprint while permitting direct spell/projectile combat.

3. **CAMP FIRE** (`24s` cooldown)
   - Settles chassis downward and seals external hatches (`0.45s` settle -> `12.0s` fortified lockdown), consuming `2.5` fuel/s to maintain a `4.2m` protective perimeter burn (`20` DPS every `0.5s`).
   - Locks external passenger elemental casts (`campFire.sealed`), permits internal/self **Sheathe in Steel** fortification (`repairAssist`), and extends emergency disembarkation time (`1.95s`) to reflect unsealing hatches.

4. **BRIMMING WITH POTENTIAL** (`26s` cooldown)
   - Sustains furnace overpressure past normal `100` heat up to `220` (`+19` heat/s), scaling all DRAG-OON flame output up to `+65%`.
   - Past insulation threshold (`110` heat), occupants suffer escalating internal thermal DPS (`3.5` → `16.0` DPS) and risk a massively amplified **All Abort!** detonation (`1.42×` radius, `1.55×` blast, `1.45×` crew trauma). Under Full Fire infusion, high overpressure heat dissipates more slowly (`0.42×` decay).

---

## 3. Provisional Tuning Values Summary

All values live centrally in [`shared/src/dragOonConfig.mjs`](../../shared/src/dragOonConfig.mjs) and should be treated as **first-pass playable prototype balance**:

| System | Key Provisional Constants |
| :--- | :--- |
| Chassis & Armor | `2200` hull HP · `3.1 m/s` forward / `2.3 m/s` reverse · `1.05 rad/s` pivot · `0.55` perpetual Steel (`allocationWeight: 2`) |
| Thermal & Fuel | `100` base max fuel (floor `25`) · `6.5/s` regen after `1.25s` · `100` standard heat / `220` Brimming overpressure · `4.5/s` idle cooling · max overheat fuel cap penalty `55` |
| Desolation Spray | `11.5` fuel/s · `8.5` heat/s · `10.5m` range · `28`→`13` DPS on `0.25s` cadence · `0.16s` prep |
| Fuel's the Limit | `26` fuel · `+18` heat · `12s` CD · `12.8` up / `13.4` fwd · `28` launch blast / `62` landing slam |
| Steam the Team | `25s` CD · `12.5m` ring · `12..58` heat-scaled damage · vents `48` heat · relieves `16` overheat penalty |
| Skills | Raze `22s` (`3.2m`–`11m`, `16`–`76` blast, `14.5s`–`4.5s` burn) · Flight `28s` (`34` fuel/s, `78` DPS, `8s` scorch) · Camp `24s` (`12s` seal, `4.2m` burn) · Brimming `26s` (`+65%` max output, `220` cap) |

---

## 4. Open Balance Questions & Neon Production GLB Dependencies

### Open Design & Balance Decisions (Pending Playtesting)
1. **Siege Blades Allocation Weight:** Currently `allocationWeight: 2`; decide whether DRAG-OON counts as 2 team slots or 1 heavy slot with passenger synergy caps in 2v2 / 3v3 competitive Siege Blades.
2. **Passenger Max Health Cap Balance:** Confirm whether Flight Like Hell's Frostfire max-HP floor (`25` HP) and conversion fraction (`42%`) feel fair vs slow-healing objectives.
3. **Passenger Prepared Spell Contributions:** `allowMultiPreparedSpells` is currently `false` (passengers contribute their primary equipped spell only); decide whether Chivalry multi-prepared cycling should contribute multiple infusions.
4. **Raze Interrupt & Self-Thermal Punishment:** Confirm whether interrupted Raze casts should drop a smaller volatile puddle or strictly fizzle with partial fuel refund.

### Neon Production 3D Asset Dependencies
While all simulation hitboxes, stations, cannon traversal bounds, and emitters operate cleanly off V3.1 coordinates in [`shared/src/dragOonConfig.mjs`](../../shared/src/dragOonConfig.mjs), final handoff of Gemini Neon's production GLB will cleanly replace [`client/worlds/DragOonRenderer.mjs`](../../client/worlds/DragOonRenderer.mjs) procedural geometry when wired with matching named pivots/bones:
- `Wheel_FL1..RR2` wheel pivots & steering axles.
- `cannonL` / `cannonR` articulated mounts and `nozzle_L1`, `nozzle_L2`, `nozzle_R1`, `nozzle_R2` tip empties.
- `undersideIgnitionOrigin`, `landingImpactOrigin`, `fuelOutletOrigins`, `steamExhaustOrigins`.
- Armor hatch/shutter meshes for **Camp Fire** & **Fuel's the Limit**, interior seating + exterior aperture bone transforms (`stations.passengers[0..5]`, `stations.exits[0..7]`).
- Three dedicated emissive heat material slots (`cannons`, `underside`, `furnaceInterior`) + final Workshop thumbnail/portrait and animation clips (`Walk`, `Leap`, `CampFire`, `Raze`, `Abort`).
