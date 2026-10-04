# First person Chivalry guarded sword technique

The previous first person implementation compressed the ordinary combo toward a center point and kept its ordinary blade directions. This pass gives Chivalry its own angled defensive hold and three compact forward strikes. It follows the guarded third person pass from main at 6db134c.

1. Hold the sword diagonally across the defensive line with a bent elbow.
2. Drive a diagonal forehand beat forward while the blade continues to cover the body.
3. Return along the other upper line with a distinct backhand beat.
4. Finish with a short point forward descending beat, then settle directly into the angled hold.

The shoulder drives the hand forward within the rig's reach. The free gauntlet remains available for Guard and spell gathering. Camera movement is restrained and cosmetic. Contact times remain 0.40, 1.10 and 1.80 seconds from the start of the existing chain; its restart remains 2.08 seconds. Server combat, hit windows, damage, stamina and movement rules are unchanged.

## Transitions

Guard has a persistent first person target while Chivalry is active, including between chains. The existing Guard blend eases the ordinary path into the defensive path when raised and back when deliberately lowered. Ending a chain follows its own short recovery, preserving outgoing wrist velocity and settling into the same defensive hold. Repeating a chain returns to the hold before the restart, so blade lag creates no loop reset.

Casting owns the other gauntlet independently. The ordinary combo, its two hand heavy strike, Sunder's authored targets, Vortex poses, view motion and Dash logic retain their accepted implementations. The Vortex presentation still bypasses the guarded path. Voice, sound recipes, music, ultimate startup and gameplay tuning are unchanged.

## Source and assets

This is a runtime first person authoring pass. The existing first person sword and recovery paths are authored as view space key poses in `fpSlash.mjs` and solved against the physical grip with `swordArmIK.mjs`. The new `fpGuardedSlash.mjs` uses that same curve and grip machinery with independent key poses. It replaces the previous ordinary swing compression.

Blender sources, exported GLBs, rig, geometry, materials, third person clips and asset budgets are unchanged. There is no Blender rebuild in this pass because the live first person path is owned by the existing runtime hand solver.

## Verification and proof

Focused tests check all contact directions, the persistent angled hold, smooth hand orientation throughout the chain, direct recovery with preserved wrist velocity, ordinary behavior at zero Guard blend, and the unchanged contact clock. Existing first person motion, ordinary sword, local chain, animation plan, Chivalry presentation and runtime asset tests are included.

`checkGuardedFirstPerson()` in `client/game/fpGuardedPresentation.browser.mjs` runs the actual production WeaponView with the exported arms. Across 433 frames it checks hand continuity and arm reach, samples all three contacts, gathers a spell during the chain, retains Guard and Sprint carriage, and verifies deliberate Guard release. Maximum target error is 2.90 mm; maximum hand movement per sampled frame is 12.61 mm.

[Practice Yard motion capture](art/chivalry-technique/first-person-guarded.webm) shows activation, the defensive hold, the three strikes, a Fireball cast and return to Guard. This was captured from the game's actual renderer and ordinary authoritative practice session. Sampled authoritative snapshots kept Guard active throughout the capture. Temporary browser capture UI and input instrumentation were removed after inspection.

All 61 focused Node tests and the changed module syntax checks pass. The full gameplay suite was omitted at the user's request for efficient verification.

## Changed files

1. `client/game/fpGuardedSlash.mjs`: independent guarded hold, three strike paths and direct recovery.
2. `client/game/fpSlash.mjs`: shared curve authoring helper; ordinary and Sunder paths retain their existing keys.
3. `client/game/chivalryMotion.mjs`: blends the ordinary pose into the complete guarded path.
4. `client/game/WeaponView.mjs`: presents the hold, accepted chain clock and recovery in the actual first person view.
5. `client/game/fpGuardedSlash.test.mjs`: sampled continuity, recovery velocity and Guard transition tests.
6. `client/game/chivalryMotion.test.mjs`: defensive contact and persistent hold tests replacing the previous compression assertion.
7. `client/game/fpGuardedPresentation.browser.mjs`: focused check against the exported rig and production WeaponView.
8. `docs/art/chivalry-technique/first-person-guarded.webm`: live visual proof.
9. `docs/CHIVALRY_FIRST_PERSON_TECHNIQUE.md`: this handoff.
