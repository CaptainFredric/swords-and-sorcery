# Greener Pastures: First-Time Player Experience & Gameplay Polish

This document details the first-time player experience (FTUE) refinements, navigation enhancements, and browser verification methods for Tutorial 1 (Greener Pastures) on branch `feat/greener-pastures-ftue-polish`.

## 1. Ergonomic and Navigation Refinements

1. **Solo Menu Entry**: When launching the tutorial directly from the Solo play menu (`client/main.mjs`), empty or whitespace-only player names default to `'Spellblade'`. This eliminates validation rejections before entering the world.
2. **Dialogue Advance Ergonomics**: `Space` key support was added alongside `Enter` for dialogue continue buttons (`client/tutorial/TutorialView.mjs`), allowing desktop players to advance opening dialogue without shifting hands from WASD / mouse.
3. **Contextual Passage Waypoints**: `computeRivalWaypoint` (`client/tutorial/rivalWaypoint.mjs`) categorizes navigation waypoints into distinct passage types (`'gate'`, `'lane'`, `'bridge'`). The HUD renderer (`client/ui/HUD.mjs`, `client/styles.css`) displays contextual amber badges (`GATEWAY TO RIVAL`, `MILL LANE`, `BRIDGE CROSSING`) when guiding through terrain obstacles, switching to crimson `RIVAL` when tracking the adversary directly.
4. **Meadow Gate Finials**: Visual wayfinding timber finials (`client/worlds/GreenerPasturesRenderer.mjs`) were added atop stone gateposts, allowing players to spot distant slalom openings from across the meadow.
5. **Chasm Dash Clarification**: The broken bridge traversal prompt (`client/tutorial/TutorialSession.mjs`) explicitly instructs: *"Sprint and Jump from the high broken deck. Dash toward the lower bank while airborne: E. (Jump first, then Dash mid-air!)"*, preventing players from expending Dash prematurely on the solid ramp.

## 2. Test Harness Separation

Two distinct browser test harnesses exist for different verification purposes:

### A. Staged Inspection Harness (`scripts/test-tutorial-ftue-full.mjs`)
- Rapidly evaluates visual UI layouts, typography, captions, and chapter-specific elements across all 12 chapters.
- Uses director checkpoint jumps and completion facts to inspect downstream scenes quickly (~15s runtime).
- Useful for rapid layout regression checks; clearly identified as a staged inspection harness.

### B. Authentic Continuous Playthrough Harness (`scripts/test-tutorial-ftue-continuous.mjs`)
- Executes an uninterrupted end-to-end playthrough driven solely by simulated player input: camera rotation, movement intent, jump, dash, attack swings, guard deflection, and spellcasting.
- Does not inject director facts or skip chapters.
- Traverses all 1,282 meters of authored terrain from spawn (`z = 210`) to the final encounter at Tattle On You (`z = -1072.6`).
- Earns all 52 tutorial director facts naturally across 330 seconds of live simulated gameplay.

## 3. HUD Waypoint Scale and Readability Review

At 1280x720 resolution:
- Waypoint badges measure ~85–95px × 26px (under 0.27% of screen area).
- Typography uses `700 8.5px/1.1 Georgia, serif`, `letter-spacing: .14em`.
- Passage gates use warm amber-gold (`rgba(235, 192, 107, .8)`), contrasting clearly with the crimson `RIVAL` target badge.
- Off-screen targets clamp neatly to the viewport perimeter (`transform: scale(0.95)`) with directional pointer arrows.
- Center-screen combat reticle `(640, 360)` remains completely clear of waypoint badges during traversal and combat.
