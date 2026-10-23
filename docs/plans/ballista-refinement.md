# Bi Bye llista refinement

Goal: extend PR 218 with corrected source geometry, authoritative localized durability, readable mechanical failure, comfortable motion and siege audio.

The creator's supplied handoff is the specification. Execute inline on feat/ballista-v32. Keep the controller and existing projectile combat values. No automatic review, merge, deployment or publication.

1. Verify corrected GLB checksum and source contract. Retain the previous candidate outside the served export and update the asset identity test.
2. Add shared component metadata and oriented damage volumes, plus deterministic tests for first contact, cover, area budget, team eligibility, steering articulation and failed components. Hull 650, wheels 120 each, stabilizers 150 each. Separate movement collision from attack volumes.
3. Derive degraded operation from component health. Prove wheel thresholds, immobilized upper aim, stable support failure and cancellation of unreleased siege bolt. Serialize component clocks and state, reset cleanly.
4. Use the actual component nodes for damage, interpolate vehicle snapshots, retain exact release clocks, and extend third person camera to 6.7 m with obstruction checks. Add presentation tests.
5. Add mechanical recipes and stoppable movement/reload loops through SoundEngine. Deduplicate authoritative event audio, test pause, owner, destruction and exit cleanup.
6. Exercise actual desktop and touch gameplay, damage individual components through ordinary attacks, capture each degraded configuration, compare mobile frame distributions, run verify and exported client checks. Extend the same draft PR with exact evidence and limitations.

Policy decisions: a direct attack damages one first component only. Blast damage is a single capped budget distributed across visible component surfaces by falloff; a direct component receives the direct portion and is excluded from splash. Failed parts stay solid, receive no further damage and continue to stop projectiles. Only hull death destroys the machine. Support loss folds from current deployment and parks main articulation while retaining upper aim.

Progress: corrected source verified; localized durability, degraded operation, rendering, cameras, audio and focused regression tests implemented. Actual desktop damage configurations, persistent wreck, touch operation and repeated frame comparison captured. Final verification passed: 1,640 game tests, 19 HTML5/release tests, syntax and smoke. The actual nested static export, server hosted damaged wheel/volley, two client matchmaking cleanup, browser reload and fallback also passed. Draft PR delivery remains subject to creator merge and release approval.
