# Tutorial 1 Refinement Implementation Plan

**Goal:** Refine the merged Greener Pastures tutorial into a continuous, spatially authored pursuit with genuine progressive controls and distinct traversal lessons.

**Architecture:** Keep Chapter → Segment → Beat, normal local simulation and stable recording keys. Input gates control introduced actions, scene metadata connects named world landmarks to genuine facts, and Rival policy supplies ordinary movement/combat intent. Implementation proceeds in independent input, landscape and authoring tasks followed by session integration and browser play.

**Baseline:** origin/main 2c193aff3738eec0587148fdb3992dc8a0f43a6c. Existing isolated checkout /Users/erendiracisneros/swords-and-sorcery-polish, branch feat/tutorial-one-refinement. Focused baseline: 73 tests passed.

**Constraints:** Preserve combat balance, local authority, onboarding, checkpoints, corpse handling, existing recording identities and protected parallel workspaces. No automatic reviewer agents. Prepare one PR; creator approval controls merging and publication.

## Task 1: Fresh opening controls

Files: InputController, TouchControls, their tests, TutorialSession and its tests.

1. Reproduce early look/movement and preheld input leakage.
2. Gate look and move through current authored permissions. Look unlocks at LOOK; walking unlocks at WALK; Sprint unlocks at its own prompt.
3. Require neutral/release before a denied held movement or touch look gesture can become active. Discard stale mouse delta when look opens.
4. Sanitize local session input as well as client presentation. Preserve Escape/menu behavior.
5. Verify ordinary controls without tutorial gates and rebound/touch controls.

## Task 2: Named physical route

Files: shared/worlds/greenerPastures.mjs, GreenerPasturesRenderer, greenerPasturesDecor and world tests.

1. Stage a 175 m opening separation and measure genuine first exhaustion.
2. Add authored farm/orchard/field zones and a 0.8 m stone stile for ordinary Jump.
3. Expose jump takeoff, landing, waitPoint and obstacleBounds plus jump checkpoints/waypoints.
4. Build a higher broken bridge and lower landing. Validate ordinary, running, Sprint and edge Jump against airborne Dash with unchanged movement.
5. Keep natural distant destination/sign readability and coherent navigation.

## Task 3: Editable narrative modules

Files: tutorialScript, TutorialDirector, authoring/recording/continuity tests and generated recording plans.

1. Add brief escape head start, Jump, constitution branch and moving tattle reveal using the supplied text.
2. Preserve stable existing IDs. Add independent IDs for new material.
3. Use beat permission overrides, persistent objective metadata and named gameplay gates.
4. Queue reactive asides so they cannot erase an active spoken line; allow scene facts to accumulate without truncating dialogue.
5. Test disabled optional scenes, retries and stale recording tokens. Regenerate recording plan.

## Task 4: Rival and session integration

Files: TutorialSession, TutorialRival, TutorialView, tutorial.css, index.html, main.mjs and integration tests.

1. Lock locomotion briefly when genuine initial duel damage triggers escape, and release through authored pursuit metadata.
2. Make Rival physically jump the stile, stop and face the player, then resume on genuine player Jump/crossing.
3. Emit constitution fact after genuine otherwise lethal pursuit punishment.
4. Observe airborne Dash/crossing, recover nearby on failure and hold Rival safely without teleporting.
5. Keep pride stop and responsive final fight within a few steps of the entrance.
6. Display the narrative objective independently from temporary prompts.

## Task 5: Experience evidence and handoff

1. Run focused integration tests and full npm run verify.
2. Play through the actual browser using ordinary input and local simulation. Inspect opening locks, stamina spacing, landmarks, Jump, airborne Dash, dialogue continuity and final corpse.
3. Capture desktop and touch layouts and export HTML5 checks.
4. Record any physical limitation or meaningful deviation, exact files, new recording keys and outstanding creator recordings.
5. Commit, push and prepare an attached PR for approval.
