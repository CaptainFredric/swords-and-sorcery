# THE HIGH GROUNDS
## Castleward — bidirectional territory war (draft, October 31, 2026)

**Name:** The High Grounds. *Floral Footholds*, *Perilous Perches*, and *The Teetering Edge* can name individual districts, not the map.

### The battlefield

A huge, inhabited sky frontier: two competing camps anchored to colossal flowering trees, wide timber-and-stone bridges, treetop military perches, and lower root shelves suspended above an abyss. The vistas should be beautiful, not safe. Low-poly Castleward style: broad silhouettes, substantial timber and pale stone, visible iron/brass joints, banners. No dense foliage obstructing sword hits, flight corridors, or HTML5 rendering.

Authoritative world bounds **156 × 234 metres**, three tiers: machine road / capture deck **Y=0**, canopy bridges and perches **Y=12**, root shelves **Y=−9**. Abyss defeat below **Y=−52**. Six giant flowering trees create landmarks. Primary road runs the full 220m between camps; bridges and side ramps create viable alternate rotations.

Navigation philosophy: every team's ordinary infantry can cross the centre without jumping an abyss. Edge routes take risks for height/tempo advantage. The ram and ballista have wide, continuous support; the flyer gets vertical approach lanes and aerial flanking, **not effortless hovering above captures**. Lower shelves preserve a subset of falls as counterplay while other drops remain lethal.

### Sites and scoring

Five **simultaneously** contested, recapturable sectors:
- **Azure Forward Camp** (homeward, Azure initially held): secure spawn approach.
- **Western Bloom** (west canopy, Azure initially held): elevated flank route.
- **Crown Span** (centre ground, neutral): wide central clash.
- **Eastern Bloom** (east canopy, Crimson initially held): elevated flank route.
- **Crimson Forward Camp** (homeward, Crimson initially held).

Both teams attack and defend. Nobody has exclusive capture rights. One team inside a valid horizontal radius *and* vertical slab progresses capture; mixed opponents contest and halt progress. Initial unowned site: ~12s (centre 15s). An enemy-owned site must be **neutralized over 9s**, then captured from neutral over ordinary capture duration. Extra bodies improve capture 25% per additional fighter (not exponential). An airborne Fight-and-Flight does not count; it must actually land or the pilot must occupy the ground. Holding each **uncontested** zone generates 1 point per second. First to 900 wins; 720s hard match timer, higher score wins, tied scores stalemate. Points remain banked after losses; territory advantages may change hands. No one-way Breakthrough phase progression or defender default victory.

A surviving forward camp permits forward respawns only while held uncontested and no enemy stands within 18m of its pads; otherwise spawn at the home camp. Bases remain traversable, and camps cannot be permanently spawn-locked through objective ownership.

### Siege foundries

At each home camp, a **physical foundry console** controls production of a team-owned machine. Choose Bi-Bye-llista, SO-FIST-ICATION, or Fight-and-Flight. The first living dismounted player physically at the friendly console who successfully claims the cycle decides the model; an accepted selection commits immediately, cannot be overridden, and the team sees the newly produced machine and its cooldown. No phantom machine, no client-authoritative spawning.

**120 seconds** cooldown begins only after a validated machine successfully materializes. Maximum **one alive active siege machine per team**, and (due to the existing simulation singleton architecture) **one alive instance of each machine type per room** in this draft. If the opposing side already operates that type, the request is rejected with a clear message; the player may choose a different class. This is a temporary limitation, not the intended final rule: matching siege machine classes on both teams must eventually work. Fleet-ready final version needs ID-indexed machine collections and collision/weapon/renderer/snapshot loops for every live instance, replacing the global room singletons. Do **not** hide the limitation or swap machine type behind the player's back.

The machine itself retains HP, rotor condition, ammo and cooldowns through any operator handoff. Enemy players may destroy a machine; replacement requires an eligible foundry after cooldown. Foundry output must pass real terrain support, clearance, dismount, and object collision checks. No repair function in this first version: damage and mechanical failure matter, avoiding fortified repair stalemates. A future repair mechanic could be capped, exposed, consumable, and distinct from production.

### Design risks and acceptance gates

1. **Density:** 156×234m is huge for 2v2/3v3; in playtests the central Crown Span should be an unmistakable magnet and forward spawns should reduce empty running. This *is a deliberate experiment*, not a proven population scale. For final 3v3 tune sprint/respawns and consider 5v5 after simulation/HTML5 performance profiling.
2. **Navigation:** bot AI needs meaningful route graph for canopy and lower ramps; direct homing toward objectives is insufficient where the straight line crosses an abyss.
3. **Siege symmetry:** per-type singleton limitation must be removed before production release. Never let global turret controls or team identity transfer across teams.
4. **Flight fairness:** hovering above an objective gives reconnaissance but no scoring; airborne threats must have sightline exposure to ballista. Measure rotor hazard and airborne attack options, not simply flight speed.
5. **Mobile:** foundry buttons in landscape within thumb range, normal melee controls still reachable; validate pointer lock and press on actual mobile.
6. **Collision:** every decorative tree trunk is a real authoritative solid. Flyers must collide with trunks; legs cannot clip the bridge; reliable landing on canopy and lower root shelf; drowning in the abyss triggers a proper death/respawn.
7. **Authoritative multiplayer:** confirm 2v2/3v3 local bot matches, live room join/rejoin, rematch, state snapshots, contest and no resource reset. Check 30Hz simulation/HTML5 budget and render snapshots under load.

This document describes the first playable implementation and remaining acceptance work. **No merge or deployment without explicit approval.**
