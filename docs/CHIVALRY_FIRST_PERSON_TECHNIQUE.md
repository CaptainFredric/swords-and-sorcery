# First person Chivalry guarded sword technique

Chivalry's guarded strikes are the ordinary sword cuts. Strike 1 is the right-to-left forehand, strike 2 the left-to-right backhand, and strike 3 the descending strike. Each blade follows the ordinary path through its contact, so it crosses the view where and when the ordinary blade does, and the player aims it the same way. An earlier pass replaced these cuts with forward "defensive beats" that never crossed the view. That was a misreading: Guard restrains the body, not the blade.

What Guard restrains (`fpGuardedSlash.mjs`):

1. A shorter cock before the forehand, and a short dip, not a drop to the hip, before the backhand.
2. The shoulder opens 0.65 as far as in the ordinary cut. The carried torso and the view lean are kept to 0.4.
3. The free gauntlet takes no part. There is no counterbalance and no second hand on the descending strike, so it keeps its Guard or its spell.
4. Each finish stops higher and sooner: the forehand on the left at chest height, the descending strike at the waist instead of the ground. Each returns to the angled hold within about 0.25 s.
5. With less shoulder, the hand cannot go as far as the ordinary hand. A hand asked for beyond the arm's reach is brought in, and the blade is turned in the hand to pass through the same place. The cut stays where it was, and the elbow travels less.

Contact times remain 0.40, 1.10 and 1.80 seconds from the start of the chain; its restart remains 2.08 seconds. Server combat, the authoritative blade sweep, hit windows, reach, damage, stamina and movement rules are unchanged.

## Transitions

Guard has a persistent first person target while Chivalry is active, including between chains. The existing Guard blend eases the ordinary path into the defensive path when raised and back when deliberately lowered. Ending a chain follows its own short recovery, preserving outgoing wrist velocity and settling into the same defensive hold. Repeating a chain returns to the hold before the restart, so blade lag creates no loop reset.

Casting owns the other gauntlet independently. The ordinary combo, its two hand heavy strike, Sunder's authored targets, Vortex poses, view motion and Dash logic retain their accepted implementations. The Vortex presentation still bypasses the guarded path. Voice, sound recipes, music, ultimate startup and gameplay tuning are unchanged.

## Source and assets

This is a runtime first person authoring pass. The existing first person sword and recovery paths are authored as view space key poses in `fpSlash.mjs` and solved against the physical grip with `swordArmIK.mjs`. `fpGuardedSlash.mjs` uses that same curve and grip machinery. Its cutting keys are the ordinary chain's keys, held back; only the windups, finishes and the angled hold are its own.

Blender sources, exported GLBs, rig, geometry, materials, third person clips and asset budgets are unchanged. There is no Blender rebuild in this pass because the live first person path is owned by the existing runtime hand solver.

## Verification and proof

`fpGuardedSlash.test.mjs` checks the following in the same view and aim frame as the authoritative blade (`shared/src/blade.mjs`):

- Strike 1 travels right → centre → left, strike 2 left → centre → right, and strike 3 above → centre → below. Each crosses the middle of the view on its own axis at its contact, as the ordinary cut does.
- At each contact the blade lies within 15° of the ordinary blade and is seen within 0.04 of it on screen. It is no further off the authoritative blade than the ordinary cut, and it moves across the view the way the authoritative blade moves through its contact.
- The torso and view commit less than half as much, the shoulder less than 0.75. The free gauntlet never joins or counterbalances, and the finishes stop higher and sooner.
- The hand never snaps or flips, and release carries its velocity into the short return to Guard.

These tests fail against the earlier beats.

`checkGuardedFirstPerson()` in `client/game/fpGuardedPresentation.browser.mjs` runs the production WeaponView with the exported arms. Maximum hand error is 5.2 mm, maximum hand step 23.6 mm per 1/120 s frame, and the spell hand still gathers mid-chain.

Third-person `GuardCut_1/2/3` were reviewed, not changed. Within ±0.13 s of each contact the exported blade tip travels:

| Clip | Across | Height | Ordinary Slash, for comparison |
|---|---|---|---|
| GuardCut_1 | 0.6 m (right to left) | 1.39–2.06 m | 2.5 m across, 0.84–2.65 m high |
| GuardCut_2 | 0.8 m (left to right), contact at the right edge | 1.85–2.41 m | 2.6 m across |
| GuardCut_3 | stays central | from 2.45 m, stops at 1.38 m (chest) | from 2.84 m down to the ground |

Another player sees a defended forward beat for strike 1 more than a cut across them. Strikes 2 and 3 read as cuts, but short ones. Re-authoring GuardCut_1 (and lengthening 2 and 3) is a Blender source change and is left for that pipeline.

## Changed files

1. `client/game/fpGuardedSlash.mjs`: the guarded hold, the three ordinary cuts with the body restrained, and direct recovery.
2. `client/game/fpSlash.mjs`: shared curve authoring helper; ordinary and Sunder paths retain their existing keys.
3. `client/game/chivalryMotion.mjs`: blends the ordinary pose into the complete guarded path.
4. `client/game/WeaponView.mjs`: presents the hold, accepted chain clock and recovery in the actual first person view.
5. `client/game/fpGuardedSlash.test.mjs`: cut direction, contact crossing and authoritative-blade agreement, body restraint, continuity, recovery velocity and Guard transition tests.
6. `client/game/chivalryMotion.test.mjs`: guarded contacts keep the ordinary blade; persistent hold.
7. `client/game/fpGuardedPresentation.browser.mjs`: focused check against the exported rig and production WeaponView.
8. `docs/art/chivalry-technique/first-person-guarded.webm`: capture of the earlier forward beats, now superseded (kept for comparison).
9. `docs/CHIVALRY_FIRST_PERSON_TECHNIQUE.md`: this handoff.
