# Tutorial dialogue and retries implementation plan

Goal: apply the creator's latest refinement brief on main 25a6d6b, preserving existing dialogue recordings and ordinary combat.

Architecture: independent spoken captions and instructional feedback; local world overlays for retry deck growth; authored finale staging and per beat pauses driven by actual audio completion when available.

1. Reproduce optional caption and empty container states in TutorialView tests. Share speech presentation and give prompts their own container. Hide empty containers explicitly.
2. Test authentic abyss failures, manual resets and the cap. Extend the local world's destination floor by 1.2 metres per failure, capped at three. Render that exact additional floor and update local prediction from the tutorial snapshot.
3. Test approach movement, taunt causality, braking, turning and waiting. Start approach dialogue earlier and remove the near destination speed clamp. Add a ready scene and independent duel terms module. Retain established greeting lines in their existing optional module.
4. Add stable recording keys for bridge and Fireball branches and duel terms. Count actual later Fireball emissions for the contextual once per run branch. Use per beat completion pauses for the two rapid replies.
5. Test recorded playback suppresses rehearsal advancement and stale tokens remain harmless. Regenerate recording plans.
6. Inspect affected scenes in the browser on desktop and touch. Capture visible deck growth, caption layout and finale continuity. Run focused tests, npm run verify, then commit and open a reviewable PR. Leave merge and publication to the creator.

Chapter navigation, combat balance, voice ingestion and external publishing remain outside this pass.
