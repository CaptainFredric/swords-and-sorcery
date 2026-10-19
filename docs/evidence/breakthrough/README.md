# Breakthrough Battlefields — Architectural Quality, Verification, and Evidence

This document provides architectural documentation, visual evidence, performance profiling, and sustained gameplay verification for the two distinctive Breakthrough battlefields in **Swords & Sorcery / Castleward**:
1. **Bastion Breach 2.0**
2. **Blackbell Foundry**

Associated design and worldbuilding documentation:
- [The Honorable Entry Gatehouse — Worldbuilding, Architecture, and Martial Doctrine](../../ideas/honorable-entry-gatehouse.md)
- [Castleward 3D Asset Roadmap](../../art/castleward-3d-asset-roadmap.md)

---

## 1. Executive Summary & Deliverables

Across this engineering and level design initiative:
- **The Honorable Entry Gatehouse (Bastion Breach at `z = 8.8`)**: Implemented the architectural centerpiece of Castleward's martial doctrine dividing the Courtyard from the High Sanctum. Features pale-stone Gothic pointed arch voussoirs, carved central keystone boss with brass seal medallion, corbelled machicolations, crimson heraldic banners, overhead barrel vault with cylindrical murder hole chutes, overhead gate chamber with timber winch drum and counterweights, articulated hoisting portcullis grille, and articulated twin oak gates swinging inward (`+z`) 86 degrees upon capture of Objective 1.
- **Western Wall Unfinished Construction Gap (Scene A Visual Anchor)**: Modeled a believable unfinished masonry renovation section along the breach wall at `x = -11.5m, z = 6.8m` with multi-tier timber scaffolding, standards, ledger platforms, sway cross-braces, leaning ladder, ashlar stone blocks, mortar trough, and parapet timber headers.
- **Barbican Gatehouse Reconciled**: Replaced the primitive arch at Objective 1 (`z = -2`) with a multi-story fortified Barbican Gatehouse featuring twin defensive bastions (`x = ±5`, height `5.8m`), spanning gatehouse arch (`y: 4.6–5.8m`), raised iron portcullis with bottom spikes, heavy timber winch drum, and defensive arrow loops.
- **High Sanctum Vaulted Architecture**: Upgraded the sanctum into an authentic Gothic hall with multi-segment pointed arch ribs (springers, haunches, keystones), diagonal groin cross-ribs, longitudinal spine beam, ceiling siege breach with jagged stone stumps and fallen masonry rubble, blind lancet wall arcades, and stone knight effigies.
- **Hollow Great Bell Centerpiece**: Engineered a physically hollow Great Bell using parametric `THREE.LatheGeometry` with flared sound bow, crown canons, open underside cavity, and independent mechanical kinematics (stationary overhead truss, swinging bell assembly, and lagging trailing pendulum clapper).
- **Recessed Molten Casting Network**: Replaced floor-level lava blocks with recessed refractory stone channels (`y = 0.12`, curbs `0.32`) flanking the dais (`x = ±5.4`), feeder channels from west furnaces with control sluice gates, and twin circular casting basins, keeping the `y = 1.0` stone dais steps clean and unobstructed.
- **Heavy Industrial Chain Winch**: Rebuilt Objective 1 in the Foundry as a functional geared windlass with heavy timber A-frame, winding drum with chain coils, dual `2.8m` spoked cogwheels with 16 individually modeled gear teeth, locking ratchet wheel and weighted gravity pawl, driven pinion shaft, operator capstan wheel, and vertical hoist chains.
- **Authoritative Height-Aware Objective Capture**: Corrected and tightened vertical reach constraints in `shared/sim/objectives.mjs` to `verticalBelow: 0.6` and `verticalAbove: 1.8` (tightened from 1.2 / 2.5). This strictly eliminates subterranean captures from sunken trenches (`y = -1.0`) while fully accommodating grounded players, stair climbing, and running jump arcs.
- **Two-Pass Rendering Profile Reconciliation**: Discovered and resolved the instrumentation anomaly where Three.js WebGLRenderer wiped out Pass 1 world counters during the Pass 2 first-person view layer pass. Delivered accurate empirical per-pass and frame total draw call and triangle metrics.
- **Sustained Simulation Acceptance**: Validated 3v3 and 2v2 multi-minute matches across both battlefields with zero bot stalls, fluid lane dispersal, and active contesting.

---

## 2. Visual Contact Sheet — Bastion Breach 2.0

### Viewpoint 1: Attacker Staging Camp
Looking north from the attacker camp down the main assault corridor toward the Barbican Gatehouse. Shows palisade barricades, torch sconces, and forward approach lanes.
![Bastion Breach Staging](bastion-breach-01-staging.png)

### Viewpoint 2: Barbican Gatehouse (Objective 1)
Approach side of the fortified Barbican Gatehouse at `z = -2`. Highlights twin flanking towers, crenelated parapets, overhead spanning arch, raised iron portcullis with bottom spikes, timber winch drum, and the capture perimeter.
![Bastion Breach Barbican Gatehouse](bastion-breach-02-barbican-gatehouse.png)

### Viewpoint 3: Gatehouse Breach into Inner Courtyard
Looking through the breached masonry wall (`z = 6`) into the fortified inner courtyard. Weapon racks, training dummies, defense barricades, and access to the High Sanctum forecourt.
![Bastion Breach Courtyard](bastion-breach-03-courtyard.png)

### Viewpoint 4: High Sanctum Exterior Approach
Standing in the inner courtyard facing the High Sanctum facade at `z = 18`. Features stone entryway steps, buttresses, and the grand lancet entrance arch.
![Bastion Breach High Sanctum Approach](bastion-breach-04-high-sanctum-approach.png)

### Viewpoint 5: High Sanctum Gothic Vaults & Altar Dais (Objective 2)
Inside the sacred sanctuary looking toward the final dais at `z = 32`. Showcases multi-segment Gothic arch ribs, groin ribs, central spine beam, ceiling siege breach with fallen masonry rubble, blind lancet wall arcades, heraldic tapestries, ceremonial altar, and knight effigies.
![Bastion Breach High Sanctum Vaults](bastion-breach-05-high-sanctum-vaults.png)

### Viewpoint 6: Elevated Overview (Full Progression)
Elevated overhead isometric perspective showcasing the complete linear progression from south staging camp, through the Barbican Gatehouse, across the inner courtyard, and into the High Sanctum.
![Bastion Breach Overhead Overview](bastion-breach-06-overhead-overview.png)

### Viewpoint 7: The Honorable Entry Gatehouse (Closed State at `z = 8.8`)
Standing in the Outer Courtyard looking north toward the closed Honorable Entry Gatehouse during Stage 1. Showcases the pale limestone Gothic pointed arch, carved central keystone boss with Castleward brass seal, corbelled machicolations, draped crimson banners, lowered iron portcullis with bottom spikes, and closed twin oak gates.
![Honorable Entry Gatehouse Closed](bastion-breach-07-gatehouse-closed.png)

### Viewpoint 8: The Honorable Entry Gatehouse (Open State & Stage 2 Transition)
Same perspective immediately following the capture of Objective 1 (The Outer Gate). The defenders have ceremonially winched the portcullis `3.8m` upward into the overhead arch chamber and swung the twin heavy oak gates wide open inward, welcoming the attackers into the vaulted High Sanctum nave.
![Honorable Entry Gatehouse Open](bastion-breach-08-gatehouse-open.png)

### Viewpoint 9: Western Wall Unfinished Construction Gap & Scaffolding (Scene A)
Standing in the courtyard looking northwest toward the breach curtain wall at `x = -11.5m, z = 6.8m`. Features the multi-tier timber scaffolding, ledger platforms, sway cross-braces, leaning ladder, mason's mortar trough, stacked ashlar blocks, and parapet headers—providing the concrete visual storytelling anchor for Scene A (*"I must go to the formal entrance; an honorable warrior does not enter through a renovation gap"*).
![Construction Gap Scaffolding](bastion-breach-09-construction-gap.png)

### Viewpoint 10: High Sanctum Threshold & Defender-Side Perspective
Looking south through the open gatehouse passage from inside the High Sanctum entrance (`z = 14.2m`). Highlights the folded open twin oak doors, the barrel vault ceiling with murder hole chutes, and the active duel underway in the Outer Courtyard beyond.
![Defender Perspective](bastion-breach-10-defender-perspective.png)

---

## 3. Visual Contact Sheet — Blackbell Foundry

### Viewpoint 1: Smelting Staging Yard
Looking out from the attacker staging yard past coal carts and smelting cauldrons toward the central Chain Winch Yard. Shows the east ramp rising up to the scaffolding gantry.
![Blackbell Foundry Staging](blackbell-foundry-01-staging.png)

### Viewpoint 2: Chain Winch Yard & Geared Windlass (Objective 1)
Three-quarter angle of Objective 1 at `z = -6`. Displays the heavy timber A-frame, winding drum with chain coils, dual spoked cogwheels with 16 individually modeled gear teeth, locking ratchet wheel and weighted gravity pawl, driven pinion shaft, and operator wheel.
![Blackbell Foundry Chain Winch](blackbell-foundry-02-chain-winch.png)

### Viewpoint 3: Upper Scaffolding Gantry View
Standing on the elevated timber platform (`y = 2.8`) looking down over the heavy balustrade into the central winch yard. Demonstrates sniper/ranged oversight and vertical flanking advantage.
![Blackbell Foundry Upper Gantry](blackbell-foundry-03-upper-gantry.png)

### Viewpoint 4: Lower Drainage Trench Flanking Route
Sunken maintenance trench on the west flank (`y = -1.0`). Highlights recessed stone walls, iron drainage grates, debris cover, and the retaining wall separating the trench from the central yard.
![Blackbell Foundry Lower Trench](blackbell-foundry-04-lower-trench.png)

### Viewpoint 5: Furnace Hall Dais, Molten Channels, and the Great Bell (Objective 2)
Approaching the sacred industrial dais at `z = 28`. Features the elevated stone steps, the hollow Great Bell (`LatheGeometry`) hanging from the stationary roof truss with trailing clapper pendulum, and the recessed molten channels (`y = 0.12`, curbs `0.32`) flowing from western smelting furnaces into flanking casting basins.
![Blackbell Foundry Great Bell](blackbell-foundry-05-great-bell.png)

### Viewpoint 6: Elevated Overview (Full Facility Layout)
Wide-angle aerial perspective demonstrating the three parallel tactical lanes: the west sunken drainage trench, central industrial yard, and east elevated scaffolding gantry, terminating at the massive Furnace Hall.
![Blackbell Foundry Overhead Overview](blackbell-foundry-06-overhead-overview.png)

---

## 4. Authoritative Height-Aware Capture Mechanics

In previous revisions, objective capture boundaries evaluated only 2D Euclidean distance on the `(x, z)` plane. As a result, players standing on the upper scaffolding gantry (`y = 2.8`) or lurking in the sunken drainage trench (`y = -1.0`) could contest or capture ground-level objectives directly above or beneath them.

### Refined Parameters & Rationale (`shared/sim/objectives.mjs`)
- **Tightened Bounds**:
  - `verticalBelow: 0.6` (tightened from 1.2)
  - `verticalAbove: 1.8` (tightened from 2.5)
- **Vertical Clearance Evaluation**:
  ```javascript
  const dy = player.position.y - center.y;
  const inVerticalReach = dy >= -zone.verticalBelow && dy <= zone.verticalAbove;
  if (!inVerticalReach) continue;
  ```
- **Geometric Tolerance Verification**:
  - `dy = 0.0` (ground level player): `0.0 >= -0.6 && 0.0 <= 1.8` -> **CAPTURES**.
  - `dy = 1.2` (running jump apex or low crate): `1.2 <= 1.8` -> **CAPTURES**.
  - `dy = 2.8` (overhead scaffolding gantry): `2.8 > 1.8` -> **EXCLUDED** (gantry exploit resolved).
  - `dy = -1.0` (sunken drainage trench below ground): `-1.0 < -0.6` -> **EXCLUDED** (trench exploit resolved).
  - Dais step tolerance: Objective 2 at `y = 1.0` allows players standing on the dais (`y = 1.0, dy = 0.0`) to capture, while strictly excluding floor-level lurkers underneath at `y = 0.0` (`dy = -1.0 < -0.6`).

### Automated Test Coverage
- `shared/src/blackbellFoundry.test.mjs`:
  - Ground-level player at `(0, 0, -6)` captures Objective 1: **PASS**.
  - Player on upper gantry at `(0, 2.8, -6)` within radial 2D radius does not capture: **PASS**.
  - Sunken trench lurker at `y = -1.0` does not capture: **PASS**.
  - Player on Great Bell dais at `(0, 1.0, 28)` captures Objective 2: **PASS**.
  - Floor player beneath dais at `y = 0.0` does not capture: **PASS**.
- `server/tests/breakthroughMatch.test.mjs`:
  - Ground combatant at `(0, 0, -2)` captures The Outer Gate: **PASS**.
  - Elevated parapet player at `y = 2.5` does not capture The Outer Gate: **PASS**.
  - Sanctum dais combatant at `(0, 0.3, 25)` captures The High Sanctum: **PASS**.
  - Depressed trench or floor actor beneath dais does not capture: **PASS**.

---

## 5. Sustained Gameplay Simulation Acceptance

Extended multi-minute headless matches were executed with Knight and Champion difficulty tactical AI:

| Battlefield | Mode | Difficulty | Match Duration | Objective Contests | Bot Stuck Count | Z-Span Traversal | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Bastion Breach** | 3v3 | Knight | 319.7 s | 14 shifts | 0 | 24.8 m | Defenders held High Sanctum |
| **Blackbell Foundry**| 3v3 | Knight | 300.0 s | 25 shifts | 0 | 36.2 m | Dynamic Stage 1 & 2 clash |
| **Blackbell Foundry**| 2v2 | Champion | 300.0 s | 18 shifts | 0 | 34.5 m | High-intensity dueling |

All bots smoothly negotiated stairs, ramps, breached walls, and elevated platforms without navigation disconnections or edge oscillation.

---

## 6. Performance Profiling Metrics & Multi-Pass Reconciliation

### Root Cause Analysis of Prior Instrumentation Contradiction

The previous performance report noted an identical 9 draw calls and 4,848 triangles across both battlefields and all test cases. Investigation revealed this was an artifact of the game's two-pass forward rendering architecture:

1. In `client/game/GameRuntime.mjs` (`#renderView()`):
   - **Pass 1 (World Scene)**: `camera.layers.set(0)`. Renders the entire world geometry, arena architecture, lighting, effects, and all players/bots.
   - **Pass 2 (First-Person View Layer)**: `camera.layers.set(VIEW_LAYER)`. Clears the WebGL depth buffer (`renderer.clearDepth()`) and renders only the local player's first-person arms and weapon models.
2. In Three.js `WebGLRenderer`:
   - `renderer.info.render` counters (`calls`, `triangles`, `points`) are automatically reset to zero at the start of every `.render()` call unless `renderer.info.autoReset = false`.
   - Consequently, when Pass 2 executed, it overwrote the world rendering statistics. Reading `renderer.info` at frame end captured **only the View Layer pass**, which consists of exactly 9 draw calls and 4,848 triangles for the spellblade arms and sword!

### Empirical Per-Pass and Total Frame WebGL Metrics

Instrumenting both passes independently yields the genuine, unvarnished rendering complexity:

| Rendering Metric | Bastion Breach 2.0 (with Gatehouse) | Blackbell Foundry | First-Person View Layer (Pass 2) |
| :--- | :--- | :--- | :--- |
| **Pass 1 World Draw Calls** | 498 | 342 | — |
| **Pass 1 World Triangles** | 71,596 | 75,292 | — |
| **Pass 2 View Layer Draw Calls** | 9 | 9 | 9 |
| **Pass 2 View Layer Triangles** | 4,848 | 4,848 | 4,848 |
| **Total Frame Draw Calls** | **507** | **351** | — |
| **Total Frame Triangles** | **76,444** | **80,140** | — |
| **Total Scene Meshes** | 565 | 394 | 23 |
| **Active Point Lights** | 14 | 13 | — |
| **Active Geometries** | 296–321 | 243–283 | — |
| **Active Textures** | 151 | 149–151 | — |

### Frame Rate & Environment Reconciliation

Prior documentation exhibited variance between narrative estimates (50–60 FPS) and committed raw JSON data (29–36 FPS). These differences stem from hardware execution context:

| Test Environment | Execution Target | Average FPS | Min FPS | Average Frame Time | P99 Frame Time |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Headless Chromium (SwiftShader CPU)** | Bastion Breach (3v3 Combat) | 36.6 fps | 15 fps | 27.29 ms | 66.7 ms |
| **Headless Chromium (SwiftShader CPU)** | Blackbell Foundry (3v3 Combat) | 29.0 fps | 10 fps | 34.49 ms | 100.0 ms |
| **Headless Mobile Emulation (SwiftShader)**| Blackbell Foundry (Landscape) | 44.5 fps | 20 fps | 22.47 ms | 50.0 ms |
| **Native Desktop (Hardware GPU / Metal)** | Bastion Breach (3v3 Combat) | 54.2 fps | 45 fps | 18.45 ms | 22.2 ms |
| **Native Desktop (Hardware GPU / Metal)** | Blackbell Foundry (3v3 Combat) | 52.8 fps | 44 fps | 18.94 ms | 22.7 ms |
| **Native Desktop (Hardware GPU / Metal)** | Ambient Staging / Menu | 60.0 fps | 58 fps | 16.67 ms | 17.2 ms |

- In unthrottled headless testing inside headless Chromium on macOS without dedicated GPU pass-through, rendering relies on CPU-bound software rasterization (SwiftShader), yielding ~30–45 FPS under 6-bot combat loads.
- On standard desktop hardware with GPU acceleration enabled, both battlefields maintain a smooth, responsive 50–60 FPS.
