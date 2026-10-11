# Tutorial One Implementation Plan

Goal: Finish a continuous local Tutorial 1 in Greener Pastures, preserving authored dialogue and ordinary combat.

Architecture: Chapter, segment and beat metadata drive a local session controller. Existing combat and movement adapters observe genuine facts. A tutorial actor policy owns staging and checkpoints, while the ordinary simulator owns contacts, stamina, projectiles and cooldowns. Browser progress stores only skipped or completed status.

Specification: The creator supplied the full Greener Pastures handoff on October 10, plus the continuity correction. Combat and pursuit captions are reactive. Only stationary rehearsal dialogue waits for Continue. No publication or merge is authorized.

Global constraints: Preserve all established recording keys, saved loadouts, local responsiveness, multiplayer, ordinary 100 HP, stamina, Fireball and Dash cooldowns. No production Blender edits or replacement VO. Tutorial Rival survival is an explicit session staging exception. No Renown.

Risk checks: Early attacks cannot destroy conversations. Cooldowns cannot inherit Practice recast gates. Failed traversal restores a nearby checkpoint. Missing or muted VO cannot block combat. Invite and debug landings retain their destination.

1. World: Add shared/worlds/greenerPastures.mjs and client/worlds/GreenerPasturesRenderer.mjs; register through existing world and renderer factories. Exclude it from public arena choices. Test spawns, collision, navigation and the real bridge route.
2. Authored route: Extend client/tutorial/tutorialScript.mjs into declared segments while preserving beat IDs. Regenerate recording data from actual dialogue. Test segment removal, stable keys and branch ordering.
3. Director: Add reactive caption timing as rehearsal presentation metadata, remembered gameplay facts, segment entry and checkpoint restart. Test stale run tokens, missing audio and uninterrupted progression.
4. Session: Extend TutorialSession and cue adapters; introduce a focused Rival controller for Guard, postscript, real combat, escape, counterfire and final stand. Use real contact events. Add the smallest local room policy for real cooldowns and phase survival; test ordinary Practice remains unchanged.
5. Entry and view: Add TutorialProgress persistence, first visit choice and responsive compact combat captions. Restore loadouts on leave and support actual rebound/touch prompts. Test invite bypass, replay and completion precedence.
6. Verification: Run focused tests then npm run verify. Play desktop and touch browser paths, capture major stages and timings, test miss and checkpoint recovery. Report cold player friction and the four published judging dimensions. Commit and open a reviewable PR without merging or publishing.

## October 11 refinement

The newest authoring brief extends the route to 928.892 m of continuous pursuit, replaces holding patterns with named waypoint traversal, adds the physical TATTLE ON YOU destination and pride turn, and strengthens Rival decision quality using ordinary bot mechanics. Chapter → Segment → Beat compilation now supplies insertion defaults and explicit provider dependencies. Optional final Guard reactions preserve recording IDs without controlling lethal progression. An explicit local corpse death clock keeps the authored Death action settled during the ending. No merge or publication is authorized.
