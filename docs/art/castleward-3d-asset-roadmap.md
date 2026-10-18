# Castleward — next 3D models and siege asset roadmap

**Status:** design/production queue, not a list of shipped assets. Updated 2026-10-18.

[Back to project README](../../README.md)

This list collects near-term **authored 3D assets** from the Castleward discussions. It is distinct from simulation features, placeholder shapes, existing procedural world geometry, and fully imported/verified in-game models. Check the actual Blender/GLB source and build branch before marking any asset as production-ready.

## Art direction and acceptance rules

- **Style:** stylized low-poly medieval siege fantasy, chunky readable silhouettes, broad bevels, restrained detail, pale/weathered stone, timber, iron, brass-gold, rope and beige canvas; crimson heraldry with the established trident insignia. Cyan arcana only where justified by the design.
- **A little insane, in the right way:** major machines or set pieces may have one credible but extravagant operating principle. Ordinary props need not all have a gag. The machinery should be physically legible and usable in the game world.
- **Production:** maintain correct scale relative to the Spellblade; make sensible pivots, collisions and animation subassemblies; optimize for browser/mobile; visually inspect from normal player height, not just in the asset viewer. Keep source files and export candidates identifiable, and do not claim deployment merely because a GLB was produced.
- **Game world:** authored detail must respect objective sightlines, spawn safety, floor/ramp collision, readable routes and bot navigation.

## Existing / needs integration or validation

| Asset | Current status and immediate next step |
| --- | --- |
| **Spellblade armored-fist battering ram** | **Already exists. Not a new modeling commission.** Argon reports a separate animation-ready review candidate with improved mechanical hierarchy and four embedded clips. Inspect and validate the actual files, animation tracks, UV/material quality, clipping, pivot axes, file size and performance before game integration. The reported external exports are `BattleRam_Spellblade_Improved_PBR.glb` and `BattleRam_Spellblade_Improved_Shaded.glb`; **neither export is currently in the checked-in `main` source tree**. Preserve the independent, forward-launched fist. |
| **Standby / Travel Tent** | A source/design candidate exists outside the confirmed production assets. Finish a small, mundane beige wedge-shaped military tent with a genuine usable doorway and dark interior concealing the transition/control swap. **Entry:** `STANDBY, SPELLBLADE` and a small `ENTER` placard. **Destination/exit:** same practical tent design with only a small `EXIT` placard on the actual usable doorway. Do **not** use `STANDOUT, SPELLBLADE`. Inspect doorway clearance, signage, character scale and game integration. |

## Near-term model builds (in priority order)

| Priority | Model | Specific brief / role |
| --- | --- | --- |
| **1** | **The Rightful Renowner** *(Wardstone / Renown Dispenser direction)* | Imposing knight statue and ceremonial stone-and-brass pedestal, articulated sword, red trident banners, cyan-lit mechanism and a comically modest coin tray. Normal automated knighting, occasional fatal judgment and the Spellblade's coin-projectile reversal are **future animation concepts**, not shipped functionality; see [worldbuilding and gag notes](../ideas/renown-renowner-worldbuilding.md). Review actual source geometry and articulation before integration. |
| **2** | **Outer Gate & gatehouse objective set** | A convincing heavy gate/portcullis, frame, beams, hinges, winch, damaged/breached states and objective-adjacent architecture for Bastion. Coordinate the visual opening/break with authoritative collision and navigation, not just an uncollided cosmetic swap. |
| **3** | **Bi-Bye-llista** — the **Two-Bolt Ballista** | Official provisional pun name. An overbuilt fantasy ballista with two deliberately unequal, clearly separate firing assemblies. It is grandly marketed as **“Fires TWO bolts instead of one!”** The **small, fast enchanted conditioning bolt** (frost or fire, causing a visible weak point/mark) launches almost immediately on triggering **while the massive primary bolt is finishing its final draw**. The **giant, predominantly physical finishing bolt** launches a fraction of a second later, along the committed firing line. Keep the interval short enough to justify the conditioning shot; avoid a lengthy second charge, target-homing, or an obvious cartoon warning that replaces the in-world tell. Visibly distinguish the two bolts and preserve fair anticipation via orientation, sound and windup. The first strike helps weaken material; the second remains dangerous even if it misses the mark. |
| **4** | **Siege Ladder / rampart access set** | Modular siege ladders, hooks, support braces and a credible fortified-wall approach. Only label access climbable if gameplay truly supports it; otherwise integrate a usable ramp/stair route and collision. |
| **5** | **Siege barricades and cover modules** | Timber palisades, pavises, reinforced low walls, broken parapets and battle debris sized deliberately for sword, spell and projectile sightlines. Several clearly different cover heights; no accidental invisible walls. |
| **6** | **Supply wagon / logistics cart** | Readable wheel/axle/cart construction, timber crates, straps, canvas and limited heraldic markings. Useful as grounded, movable-looking world dressing or cover; only simulate mobility if required. |
| **7** | **Practice-yard training dummy / target props** | Authored timber-and-straw physical targets and sparring-yard fixtures to supplement the **existing functional Practice Yard dummies**; do not inadvertently duplicate or replace the existing bot training system. |
| **8** | **Heraldic notice board** | An in-world wood-and-iron notice/challenge board suitable for announcements or Renown flavor, with readable sign surfaces and discreet trident heraldry. UI/gameplay integration can come later; first make a good prop. |
| **9** | **Objective banner standards** | Reusable physical poles, bases, brackets, banners and finials for contested areas and camps. Existing heraldic UI/world decoration is not itself unfinished; these are additional authored 3D assets. |
| **10** | **Small camp dressing kit** | Reusable crates, rope coils, stakes, supplies, bedrolls, cooking gear and support pieces to make assault staging feel occupied without excessive prop clutter. |
| **11** | **Reinforcement / field tent** | A distinct, slightly larger military support tent for troop reinforcements and objective staging; do not confuse its purpose/signage with the mundane Standby/Travel Tent. |

**Later, contingent on the new map being implemented:** Blackbell Foundry should get its own signature **colossal suspended bell, chain/winch assembly, foundry furnaces, casting channels and walkable gantry kit**. These are map-specific architectural set pieces, not higher-priority than completing the immediate Castleward asset queue.

## Bi-Bye-llista: animation and gameplay notes

1. **Ready:** main projectile is already present and substantially tensioned. Small auxiliary enchanted launcher is also ready.
2. **Trigger:** the auxiliary conditioning dart fires immediately, ideally with a sharp small report. **At the same time**, the larger mechanism performs its brief final retraction/tension movement.
3. **Follow-through:** the first dart marks or compromises an area in a way that is visible but very brief. The main bolt discharges promptly afterward—**not after a separate, conspicuous 1–2 second charging ritual**.
4. **Impact:** destruction primarily comes from the main bolt's mass; frost causes brittle fracture, fire weakens the struck material. The finisher does not need magic to be powerful.
5. **Player readability:** mechanical alignment, preceding tension noises and the conditioning dart give telegraphs; avoid homing after commitment. Test distance, projectile travel time and collision, especially on mobile.

The joke should largely come from the engineer's completely serious sales pitch and the visual difference between the two shots; the world need not point out the discrepancy.

## Review checklist for each asset

- [ ] Source model preserved; separate review candidate available.
- [ ] Shape, materials and real animation visibly inspected from useful angles.
- [ ] Gameplay scale, orientation and moving pivots confirmed.
- [ ] No obvious clipping, floating pieces, visual/collision mismatch or unreadable small details.
- [ ] Appropriate optimization for browser/phone and a real in-game render check.
- [ ] Only mark **integrated** after the scene actually loads and uses the asset in tested gameplay.
