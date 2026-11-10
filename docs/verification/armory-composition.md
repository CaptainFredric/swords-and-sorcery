# Armory and Rampage review

The Armory reserves separate regions for equipment, the model and its inspector. Its camera fits the measured model viewport. The Siege Workshop uses the same metre scale as gameplay and places a standing production Spellblade beside each machine.

The Court of Merit is the default on a fresh profile. An intentional Castleward selection persists. Judgment on Castleward cuts to a separate presentation scene using the same procedural Renowner as the Court battlefield. The fight, player transform and verdict remain in their original authoritative room. The trial results display the server ledger. An offline rehearsal carries no account Renown.

## Workshop animation handoff for Argon

The three loaded GLBs contain no embedded character skin or synchronized workshop performance. The preview uses machine idle clips where available and a standing Spellblade. Supply separate clip tracks on the canonical third person rig and the existing machine hierarchy. Work in metres, with the machine on the workshop floor and the game assets' forward axes preserved. Export synchronized event frames and prop, hand and machine attachment transforms. Start and end each vignette in compatible idle poses, and allow the player to pause or interrupt it to turn the model.

| Machine | Reusable asset motion | Required new tracks and event markers |
| --- | --- | --- |
| SO-FIST-ICATION | The rollback GLB contains `01_Ram_Strike_Full_Cycle` for mechanical travel reference. | Deliver the smithing hammer as a separate prop with a grip socket. Key the hammer contact, then the empty gauntlet contact with the armored fist, the hand shake and the return to work. The other hand and feet need support throughout. Keep the combat sword on its existing socket. |
| BI-BYE-LLISTA | `01_BiBye_LoadedIdle`, `20_BiBye_Coupled_Shot1_Trigger_And_Delay`, `21_BiBye_Delayed_Shot2_Release_And_Recoil`, `19_BiBye_Main_Winch_Reload_Only` | Key a resting palm contact and a single trigger per loop. Supply each bolt release frame and muzzle transform, corresponding recoil and both reload completions. The later repeated taps get a contact marker and a reaction only. Retain the knight's eyeline and the beat where he waits for another shot. |
| FIGHT-AND-FLIGHT | `Posture_01_Grounded_Idle` and `Rotor_Spin_Cycle_1Rev` provide rest and clearance reference. | Deliver a paired grasp and apparatus tilt, then a spring return, release and stagger into the table. Mark both grips, planted feet, release and table contact. Check that the rotor stays clear and that the recovery blends into the start pose. |

For review, include front and three quarter renders of each point of contact and the widest excursion of each prop. Record matching frame ranges for both rigs so a renderer can use one preview clock. Preview bolts and prop contact stay cosmetic. The missing elevating ram and detached fist remain a separate asset dependency.

## Opponent roster scope

Bot Duel keeps its existing real skill presets. A new roster needs server owned archetypes with distinct equipment and behavior, navigation checks on each eligible map, a difficulty progression and a decision about rewarded eligibility. First prototype this in an uncredited rehearsal, with the selected archetype visible in the authoritative snapshot. Fixed Rampage waves, overtime, victory and the reward ledger can stay on their existing contract until a distinct roster is ready.
