# Castleward world audit — November 2026

Base: `origin/main` at `02246f74` (after #414, which already carries #408 Restless Day, #409 Edge of Victory and
#410 Court of Merit). Every number below is measured, not estimated:

- `node scripts/world-audit.mjs [world]` floods each world with the authoritative collision (`surfaceHeightAt`,
  `resolvePlayerWorld`) for a standing (1.8 m) and a crouched (1.2 m) body from its spawns. It reports every void a knight
  can run, crouch or hop into, and replays each one with `movePlayer` to confirm the fall. It also reports standing under a
  floor or ramp (head clipping), spawn support, sword room (share of floor with ≥3 m clear around it), projectile cover
  (share of floor within 2.5 m of a ≥1.6 m solid), running time to objectives, and the bot graph (components, waypoints
  off their floor, spawn-to-objective routes). For Edge of Victory it traces each contraction stage, checking connected
  floor and whether a knight overtaken by the ring can get back in without stepping outward.
- `scripts/world-bot-match.mjs` runs a whole authoritative bot match (the server's 30 Hz loop, bots, machines, mode
  rules) and reports phases, structures, falls and stuck bots. `--root` runs the same seeded match on another checkout.
- `scripts/world-capture-browser.mjs` launches an arena through the real menus in Chrome (Metal GPU) and records draw
  calls, triangles, frame times and fixed viewpoints. `SS_PERF=1` uncaps the frame rate; `SS_CPU_THROTTLE=4` slows the
  main thread for a phone-class run.

## Decision matrix

Scores are 1–5 (5 = no problem found) across: purpose, combat space, traversal, identity, scale, verticality,
sightlines, objective readability, bot navigation, siege compatibility, visual quality, performance, render/collision
agreement. Only the weakest criteria are named in each row.

| Map | Strengths | Weaknesses (measured) | Intervention | Why it's justified | Opportunities | Risks to mechanics | Priority |
|---|---|---|---|---|---|---|---|
| **Restless Day** (5v5 siege) | Strong concept; authoritative ladders, gates, Renowner and sundown already exist; the clock is authoritative | Both curtains could be **walked round** (a 3.4 m gap at x ±24..27.4). The field's rear was open to the void (140 cells). Knights could walk in under the dais (320 head-clip cells). Bot graph had 3 islands and 1/6 routes. **In a 7-minute bot match the bots never reached the wall.** Flat box rendering on a void; sky stepped in three jumps. SO-FIST-ICATION **could not be mounted at all** in this mode | **Rebuild** (data + renderer) inside the mode's fixed lines | Mode-breaking bypass and falls; the brief's mustering, approach, wall-walk, courtyard and inner-court requirements were missing | Wall-walk fights at marked landings; a working bailey; a ceremonial court | Ladder placement is now limited to four marked landings per wall (the mode's own lip rule enforces it); bot carriers aim at landings (±6, ±10) | **P0** |
| **Court of Merit** (Renown Trials) | Judgment ceremony fully wired; the Renowner effigy is fixed | **Crouching under the gallery parapets fell out of the world**; void beside the tribunal and in the Grand Portal (134 cells); a head-height slab over the portal (170 cells). Four 2×2 m pillars a knight could circle indefinitely; walk-on galleries the bots cannot reach (an evasion cheese). Boxes on a black void | **Restructure** | Fall-outs plus indefinite evasion contradict "combat-first" | A stadium identity; the judgment readable from every spawn | Spawns, Renowner and podium coordinates unchanged (tested). The galleries are no longer walkable | **P0** |
| **Edge of Victory** (Ruined Keep) | Self-imposed, non-damaging boundary with authoritative stages; the keep is well built | At the 11 m stage the authoritative corrector **holds knights outside for good** in two pockets (24 cells). The final circle has 12 m² of ≥3 m sword room. The boundary is a 1-px hairline | **Refine** | Softlock risk; a cramped duel at the end | Inlaid heraldic boundary | Ruined Keep FFA shares the geometry (two crates, the drums, a heap's foot, the north breach jamb: all tested) | **P1** |
| **Bastion Breach** | Strong gatehouse centrepiece; clear two-objective flow | An **open pit** either side of the gatehouse back to the sanctum (63 cells; the valley visible through it). Knights could walk under the gallery stair (56 cells). 5 waypoints off their floors | **Refine** (closures only) | Fall-outs | — | Closed with masonry, not floor, so no new ground route round the gatehouse; objective times unchanged | **P1** |
| **Blackbell Foundry** | Distinct industrial identity (bell, gantry, trench); no new hazards needed | **Voids** beside the blast portal and under the east gantry and its stairs; a knight in the trench could walk in under the yard's paving; a 1 m gap at the gantry stair's foot (128 cells) | **Refine** (closures only) | Fall-outs | — | The trench lips stop at yard level, so a jump still exits the trench; objective times unchanged | **P1** |
| **Outerworks** | Largest Breakthrough field; ballista terrace; sally trench | Floors stop short of their walls in 8 places: west of the bailey (an 8 m strip), behind the inner curtain, beside and under the terrace and its ramp, beyond the parapet's north end, the trench mouth, and beside both trench ramps (309 cells). The paving overhangs the trench at head height (430 cells) | **Refine** (closures only) | Fall-outs | — | The defenders gain a forecourt behind the inner curtain (enclosed); objective times unchanged | **P1** |
| **Castleward** (main arena) | Clear identity (green, village, bailey, tourney field); quick encounters (median 3.5 s spawn-to-spawn); modest verticality (9 levels: bailey, walks); 37% projectile cover | Only the intended broken-bridge fall; 2 stair waypoints 0.13 m off | **Preserve** | Meets the brief already | Wall-walk ↔ bailey sightlines are fine | — | — |
| **High Grounds** | Elevation decisive; four ascents plus two crown ramps (more than one ascent ✔); deliberate bottomless shortcuts | 4,064 void cells along bridges and canopies (**intended**: "apparently shortest but actually bottomless"; the root shelf catches some); 696 cells of standing under its long ramps; 5% cover | **Preserve** (propose ramp footings) | Falls are the map's design; the head-clipping is cosmetic | Ramp footings; some cover on the crown span | Changing falls changes the mode | P3 (proposal) |
| **Practice / Shared Practice** | Runs on Castleward or the Ruined Keep | Inherits those maps | Preserve (covered by the above) | — | — | — | — |
| **Siege workshop (Armory), menu scenes** | Menu scenes (Codex's area) | Not a play space; outside this audit's collision scope | Not touched | Ownership | — | — | — |
| **Greener Pastures** (tutorial) | Authored chase | Shares `botNav` (both changes are covered by the tutorial and Greener tests) | Not touched | — | — | Route-start change verified: all tutorial and Greener tests pass | — |
| Shattered Keep | Graybox fixture | — | Not a production map | — | — | — | — |

## Before → after (measured)

| World | void cells (walk+crouch+hop) | confirmed falls | head-clip cells | bot graph comps / bad waypoints | sword room % | cover % | objective / spawn running time |
|---|---|---|---|---|---|---|---|
| Restless Day | 140 → **0** | 1 → 0 | 320 → **0** | 3/3 → 3/0 static (joins as ladders deploy; tested) | 69 → 56 | 14 → **24** | walls no longer bypassable; gates down: muster→outer gate 8.3 s, →inner gate 14.4 s, →dais 18.7 s |
| Court of Merit | 134 → **0** | 6 → 0 | 170 → **0** | 1/1 → 1/0 | 49 → 54 | 18 → 21 | median 2.3 → 2.2 s |
| Edge of Victory, final ring | — | — | — | — | 12 → **20 m²** (largest clear 4.2 → 5.2 m) | — | trapped cells at 11 m stage 24 → **0** |
| Bastion Breach | 64 → **0** | 3 → 0 | 56 → **0** | 1/5 → 1/0 | 26 → 25 | 42 → 45 | 4.3 / 7.9 s (unchanged) |
| Blackbell Foundry | 128 → **0** | 5 → 0 | 0 → 0 | 1/0 → 1/0 | 28 → 28 | 33 → 34 | 4.0 / 7.8 s (unchanged) |
| Outerworks | 309 → **0** | 6 → 0 | 430 → **0** | 1/5 → 1/0 | 42 → 43 | 19 → 21 | 5.2 / 11.3 s (unchanged) |
| Castleward | 8 (bridge, intended) | 1 | 0 | 1/2 | 37 | 37 | median 3.5 s, max 6.5 s |
| High Grounds | 4,064 (intended) | — | 696 | 1/0 | 56 | 5 | 2.5–18.4 s |

Restless Day's sword-room share falls because the bailey and the approach now have buildings and cover where there
was open sand. Its largest clear circle is still 22 m (the muster), and the final court keeps a 14 × 14 m dais.

### Bot matches (authoritative, seeded, one idle human, 7–10 minutes)

| Restless Day | main | this work |
|---|---|---|
| outer curtain breached | never | 12.6 s (ladder placed and climbed) |
| inner curtain breached | never | 370 s |
| Renowner engaged | never | yes (21 sword contacts, 6 coin hits at the dais) |
| bots lost to the void | 0 | 0 |
| bots stuck ≥15 s | 9 of 9 (from 60 s on) | carriers and the attack flow; see the mode issues below |

## Remaining limitations and hand-offs

These are mode rules or bot logic (Codex's area), seen in the Restless Day bot matches and not changed here:

- The spare ladder's bot carrier is `rivalIndex 0`, which is the human's slot; two bots wait by it for good if the human
  never carries it.
- After the inner breach (phase 2), carried ladders are dropped every tick and re-picked (about 5,800 events in one
  match).
- `constrainRestlessCarry` reverts the height too, so a carrier whose ladder touches anything while airborne hangs in
  mid-air.
- Carriers walk off the wall-walk with the ladder.
- Non-carriers are stranded outside once the only ladder moves to the inner wall.
- SO-FIST-ICATION could not be mounted in Restless Day; fixed with `?? 0`, matching Room's own placement check.
  Flagged for review.

Environment items proposed, not done:

- High Grounds: done in the follow-up geometry pass (footings and piers under its ramps and canopy roads, the crown
  ramps moved clear of the centre bridge and opened through the Blooms' decks, the root ramps started at the forward
  decks' edges, two mantlets at the Crown Span's road mouths). Head-clip cells 696 → 0; cover 5% → 6%; running times
  and the bot graph's routes unchanged.
- Castleward: two stair waypoints 0.13 m off their floor (harmless).
- The renderers' monuments (Restless Day's Renowner effigy) are box assemblies; an authored model is Argon's call.
- Mobile numbers come from desktop Chrome with phone-sized emulation and 4× CPU throttling, not a phone. A
  real-device run is still owed.
