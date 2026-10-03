# Combat and menu polish handoff

Work starts at main c7fb12b in the isolated `polish/combat-menu` branch. Claude's working checkout remains separate. This document describes the resulting changes and validation, including the difference between source animation and runtime presentation.

## Animation

Guard's frame 8 hold key inherited an outgoing tangent from the raising gesture, while the frame 56 endpoint had a flat incoming tangent. Matching poses therefore had different loop velocities. Both saved Blender actions now have matching hold tangents, preserving the raising tangent. Runtime Guard starts at 8/30 rather than 7/30 seconds and keeps its existing 48/30 second hold period.

Idle's GLB begins at frame 1, or 1/30 seconds, and ends at frame 60, or 2 seconds. Its endpoint poses and velocities already match. Runtime sampling now loops within this actual keyed interval instead of inserting the constant export preroll every cycle. Menu and first person ordinary combo idle sampling use that same interval. These are clip boundary corrections, without runtime bone snapping or combat timing changes.

First person Slash_2 receives an outward left upper arm arc of up to 12 degrees, baked into the existing source action between frames 1 and 12. The third person Slash_2 already clears the offhand and remains unchanged. Geometry, materials, weights, rest rig and unrelated actions remain preserved.

The existing ordinary first person combo uses counterbalance and sword IK rather than playing the source Slash_2 directly. Its five second strike outward counterbalance keys were corrected as well. Sword target paths, contact times, recovery durations, drop/turn keys and ultimate motion keys remain unchanged. The real exported geometry is checked at 120 Hz from 0.72 to 1.32 seconds, before the intentional two hand grip, with zero triangle intersections across 72 samples.

## Exact gameplay values

| Value | Before | After |
| :--- | :--- | :--- |
| Frostfire direct damage | 15 | 16 |
| Frostfire edge damage | 11 | 11 |
| Fireball/Frostfire gather | 0.3 s | 0.3 s |
| Gale persistent gust | 1.0 s | 0.55 s |
| Gale fade | 0.30 s | 0.165 s |
| Gale wind / push / drag | 14 / 18 / 12 | 14 / 18 / 12 |
| Steel blast contact floor | Exposure reduced by 0.62, potentially zero | min(actual positive exposure, 0.001) at full strength |
| Steel sword damage floor | 19 | 19 |
| Steel full hold / fade | 5 s / 5 s | 5 s / 5 s |

Frostfire retains its edge damage endpoint, radius, cooldown and chill tuning. Gale's force, carry, deflection and recoil remain unchanged. Its animated front and ribbon timings follow the shorter shared duration, with a brief 0.08 second final visual fade. Free debris can settle afterward.

Fireball and Frostfire now sample current authoritative yaw, pitch and position after movement on their release tick. Origin uses the existing authoritative hand proxy, 0.7 metres along the current aim and 0.1 metres below the current posture eye height. The server does not evaluate Blender bones. Gather visuals follow the actual animated hand socket and current aim. Released projectiles retain their velocity; turning afterward cannot steer them. Existing Gale bending still applies. Bots update ordinary gathered aim between decisions to preserve their existing targeting behavior.

At full Steel, a legitimate blast hit resolves as a tiny positive edge contact. An outside blast remains zero, and a weaker than epsilon contact never gains exposure. Fade linearly blends this minimum toward actual exposure using current Steel strength. Fireball center contact resolves to 13 damage with no fresh burn; Frostfire resolves to 11 damage with edge chill, approximately 0.22033 slow for 1.5015 seconds. Fixed gauntlet hits and Gale's sting retain proportional blunting. Blast Stagger uses original exposure, so damage protection preserves physical balance loss. Knockback and Guard pressure remain intact. Activating Steel leaves already applied burn unchanged. Sunder meeting Steel still resolves as an ordinary unsteeled sword contact and leaves the Steel timer unchanged.

## Effects and selection feedback

Fireball now has a hot gathered core, irregular translucent flame shell, compact projectile, bounded short flame and ember trail, impact flash, sparse blast front at the gameplay radius, compact flame lobes, embers and residual smoke. Frostfire has an elongated pale core with crystals, cold wisps, shards, dust and mist. Victim crystals, dust and foot mist fade with actual chill strength. Removed victims release their attached effect resources. Shared conjured impact presentation scales from existing size and strength definitions; projectile mechanics remain unchanged.

A changed deliberate Armory choice equips once, plays one short identity cue through the existing UI sound bus and previews the live model for 850 ms. Fireball and Frostfire reuse the elemental core presentation. Gale shows wind, Steel uses Guard and an armor sheen, Sunder uses the existing downward strike, and Vortex uses a rotating fire cue and existing sword action. Rapid selections cancel previous audio nodes and timers. Restoration, rerendering and same item clicks remain silent. Leaving, switching tabs or disabling audio cancels feedback. Audio respects master, effects and mute settings. No VO is used.

The red/gold hanging panels and live Castleward scene remain. Armory header and tabs stay fixed over an internally scrolling choice list with a brass scrollbar and footer cue. Main menu shows equipped spell and ultimate. The manual groups Movement, Combat and Other and scrolls beneath its fixed heading at short heights. Practice tools use compact Self, Dummies, Ultimate and Session groups. Panel and press motion stays brief.

## Major UI wording

| Item | Before | After |
| :--- | :--- | :--- |
| Fireball | A roaring blast that catches everyone near it; whoever it lands close to keeps burning. | Explodes on impact and burns enemies caught near the blast. |
| Frostfire | A quick bolt of cold. Whoever it strikes turns sluggish, then thaws. | A fast bolt of cold that slows whoever it hits until they thaw. |
| Gale | Draw a breath of wind, then loose it in a cone: for a moment it carries off whoever stands in it, and bends any spell flying through it. It hurts far less than it moves. Into the ground, it throws you. | Release a cone of wind that carries enemies, bends projectiles, and can launch you when aimed at the ground. |
| Steel | Clench the magic hand and your plate hardens: every blow lands like a glancing one, less so as it wears off. | Harden your armor. While Steel holds, incoming hits land like glancing contacts. |
| Sunder | Every blow the most forceful it could be: the sword slams down with each strike and the ground ruptures under it; a guard pays double. | Every sword strike becomes a crushing downward blow. Hits interrupt actions, split the ground, and hammer through Guard. |
| Vortex | Spin into a close range storm of sword cuts and aimed fire. | Spin through enemies with your blade and aimed fire. Move faster and fall slowly. Hold Attack for stronger fire or Guard for faster cuts. |

Numeric rows use concise impact, chill, cooldown, reach and duration labels from shared data. How to Play includes R and the existing Q gauntlet behavior while a spell cools. Recorded dialogue, subtitles, jokes and characterful Credits copy remain intact.

## Verification

1. `npm run verify`: syntax checks, 705 passing tests and HTTP/WebSocket smoke checks.
2. Shared/server regressions cover clean/glancing swords, Fireball center/edge, Frostfire, proportional fixed hits, Steel fade, existing burn, physical displacement and Sunder versus Steel.
3. A real two client WebSocket test covers host and guest gathering Fireball/Frostfire, turning and moving before release, matching spawn events on both connections and current release origin. Unit tests confirm postrelease velocity independence.
4. Menu tests cover silent restoration and same choice, rapid cancellation, route/settings cancellation, all six identities and sound setting suppression. Elemental tests cover bounded trails, scaled profiles, thaw and Gale timing.
5. Blender preview build, source roundtrip, ordinary sole contact tests and the new source combat presentation tests pass. Scope comparisons preserve unrelated source geometry, rig, materials and actions. Existing exporter rotation continuity checks remain active.
6. Export validators pass for both promoted GLBs. Third person: 12,952 triangles and 2,174,016 bytes, within 35,000 / 2,400,000 budgets. First person: 4,572 triangles and 705,700 bytes, within 16,000 / 1,000,000 budgets. First person sword render has 6,139 visible pixels and passes its visibility threshold.
7. Browser geometry check: 72 ordinary first person second strike samples at 120 Hz, zero left arm intersections before the intentional grip.
8. Manual rendered inspection at 1280 × 720, 1440 × 900 and 900 × 420. Armory's final ultimate is reachable with Back/tabs fixed; the small height manual reaches its last rules by scrolling; Practice includes visible Settings and Leave. Actual Three.js elemental gather and impact rendering inspected. A transient scene harness also verifies following providers, disposal, five scaled impact profiles and victim thaw.

Screenshots and local build evidence are in `artifacts/combat-polish/`, which is ignored build output. The browser logged an internal Chromium UnknownError during testing, but rendered the scenes; no shader compilation error was reported. The identity cues still benefit from the user's subjective audition for timbre and mix.

## Concurrent work deliberately preserved

Voice logic, voice director, recorded lines, Credits VO, menu music and autoplay handling are unchanged. Sunder/Vortex mechanics and tuning, rupture behavior, ultimate startup, ultimate cameras and Vortex projectile logic remain unchanged. The requested Sunder and Vortex edits are Armory system prose and isolated menu previews. Shared conjured Fireball effects use existing variant data without editing ultimate behavior. The ordinary combo fix affects only normal combo keys. Claude's working checkout and uncommitted files remain separate.

## Changed files
1. `.github/workflows/spellblade-assets.yml`
2. `client/assets/characters/spellblade/manifest.json`
3. `client/assets/characters/spellblade/spellblade-fp.glb`
4. `client/assets/characters/spellblade/spellblade.glb`
5. `client/game/Effects.mjs`
6. `client/game/GameRuntime.mjs`
7. `client/game/RemotePlayers.mjs`
8. `client/game/WeaponView.mjs`
9. `client/game/combatPresentation.browser.mjs`
10. `client/game/elementalOrb.mjs`
11. `client/game/elementalVfxModel.mjs`
12. `client/game/elementalVfxModel.test.mjs`
13. `client/game/fpSlash.mjs`
14. `client/game/galeVolumeModel.mjs`
15. `client/game/galeVolumeModel.test.mjs`
16. `client/game/spellbladeAnimationPlan.mjs`
17. `client/game/spellbladeAnimationPlan.test.mjs`
18. `client/index.html`
19. `client/main.mjs`
20. `client/menu.css`
21. `client/menu/MenuScene.mjs`
22. `client/menu/armorySelection.mjs`
23. `client/menu/armorySelection.test.mjs`
24. `client/menu/armorySound.mjs`
25. `client/menu/armoryView.mjs`
26. `client/menu/armoryView.test.mjs`
27. `client/renown.css`
28. `client/styles.css`
29. `docs/combat-menu-polish.md`
30. `scripts/test-spellblade-combat-presentation.py`
31. `server/tests/bot-controller.test.mjs`
32. `server/tests/combat.test.mjs`
33. `server/tests/gale-wind.test.mjs`
34. `server/tests/integration.test.mjs`
35. `shared/sim/BotController.mjs`
36. `shared/sim/combat.mjs`
37. `shared/src/spells.mjs`
38. `shared/src/spells.test.mjs`
39. `shared/src/steel.mjs`
40. `shared/src/steel.test.mjs`
41. `tools/blender/characters/spellblade/kit/combat_presentation.py`
42. `tools/blender/characters/spellblade/promotion.json`
43. `tools/blender/characters/spellblade/source/README.md`
44. `tools/blender/characters/spellblade/source/spellblade-first-person.blend`
45. `tools/blender/characters/spellblade/source/spellblade-third-person.blend`
