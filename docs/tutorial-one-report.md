# Tutorial 1: Greener Pastures

Review branch: `feat/tutorial-one-greener-pastures`. Baseline: `8c075930f836dfeb71c5f50d60c15620b7dcc13e`, also the remote main revision verified at the end of implementation. This branch prepares a complete captioned Tutorial 1 for review. Publication remains a separate creator decision. No changes to the live itch.io project are part of this branch.

## What is playable

The opening, meaningful look, approach, Sprint, genuine exhaustion and recovery, introductions, sword contact, Guard, voluntary Guard release, ordinary surprise damage, regeneration, responsive duel, escape, Fireball, bridge traversal, moving counterfire, responsive final stand, optional Guard reactions, Rival defeat, title exchange and departure are implemented.

All twelve chapters and eighteen interchangeable segments are available. The route contains 140 main beats and five optional branches. Six dialogue beats form an optional final confrontation exchange. The final authored title/departure sequence is the completion boundary. The former preview cutoff is removed. Tutorial 2 remains outside this pass.

The chapter titles appear during early conversation and disappear from moving captions. Combat begins during “Things do not always go according to plan.” The escape begins as soon as genuine cumulative damage reaches the encounter threshold. Later dialogue continues while the player moves, attacks, casts and chases. Continue serves the early text rehearsal; later captions advance automatically.

## Mechanical contracts and staging

| Area | Implementation |
| --- | --- |
| Hosting | LocalHost owns the tutorial even while multiplayer is online. Greener Pastures is excluded from public arena selection. |
| Opening | Player and Rival begin 135 m apart. Genuine aim travel unlocks LOOK; progress toward Rival unlocks walking. |
| Stamina | Existing Sprint, Guard stamina, exhaustion and restart threshold are observed. No second stamina model. |
| Player | Ordinary 100 HP, contact damage, stagger, knockback and regeneration. |
| Fireball | Ordinary gather, release aim, burn and 4 second cooldown. Tutorial cannot use Practice's accelerated recast gate. |
| Dash | Ordinary 5 m Dash and 5 second cooldown. |
| Guard | Genuine block/parry, followed by voluntary release. The ordinary postscript strike stops after its first damaging contact while the player reads. |
| Duel | Existing Squire bot controller with a sword/Guard encounter profile. Damage and movement stats remain ordinary. |
| Rival survival | An explicit local encounter flag preserves one positive HP until the final responsive fight begins. Damage events and physical response remain ordinary. Other rooms and targets receive no protection. |
| Chase | Continuous 928.892 m authored route, with the bridge takeoff 514.105 m from the meeting. Rival follows named waypoints without circling or holding patterns. Sprint and Dash respond with delay to closing pressure; all speeds and cooldowns remain ordinary. |
| Bridge | Real missing floor. Walking into it falls. Ordinary Jump can also cross; the route accepts that crossing and still observes a genuine Dash use. |
| Recovery | Session checkpoints before introductions, real duel, pursuit, bridge and final stand. Retry clears projectiles, recreates exactly one Rival and invalidates stale dialogue tokens. |
| Progress | Only unseen/skipped/completed is saved. Checkpoints stay in the session. Full completion is recorded only after departure and the final line. No server Renown is awarded. |
| Early abilities | Visible availability and rejection feedback prevent early spells, attacks and Ultimates from destroying conversations. Learned actions use ordinary input and combat. |
| Presentation | Production models and authored clips remain intact. Rival's sword is hidden initially and raised through an existing Guard transition when drawn. A bespoke unsheathing clip remains future work. |

## Actual browser evidence

The full desktop route completed through the actual renderer, InputController and local simulator. An input harness performed movement, aim, Guard, sword, Fireball and Dash. It acknowledged early text at readable rehearsal intervals. It did not fabricate damage, cooldowns, gameplay facts or completion gates.

The refined full run took 296.16 seconds and used one final checkpoint retry after an ordinary sword death. The completion followed a real Rival kill. The death pose then received a separate rendered checkpoint regression after fixing its retained timestamp. This represents practiced scripted play. The requested 6 to 10 minute first time human target still requires unfamiliar player testing.

| Observation | Measured result |
| --- | --- |
| Initial spacing | 135 m |
| WALK prompt | 36.15 s into run |
| Sprint begins | About 46.48 s |
| “I can do this all day!” | 54.65 s, approximately 8.2 s into Sprint, 17 stamina remaining |
| Genuine exhaustion | 56.40 s, approximately 10 s into Sprint, Rival 20.8 m ahead |
| Arrival | 61.43 s into run |
| Surprise contact | 30 ordinary sword damage; player 70 HP |
| Render frame time | Median 16.7 ms; 95th percentile 18.6 ms; 17,760 samples; two frames above 50 ms; maximum 98.5 ms |
| Completion | Actual Rival death, title exchange, departure and completed browser status |

The full rendered run includes the continuous route, destination approach, pride stop and optional final exchange. Its final checkpoint retry is reported rather than hidden. Frame samples include a late 25 second canvas recording. They are evidence of this run, not a comparison establishing a performance gain. The corpse defect found during that run was corrected and checked separately at the final checkpoint.

Current evidence is saved under `output/tutorial-one/refined/`. Selected captures and a compact factual run log are included under `docs/tutorial/evidence/`. The late 25 second canvas recording remains local as `output/tutorial-one/refined/finale.webm`; it helped reveal the old corpse timing defect and is not presented as final promotional footage.

## Desktop and touch

Desktop Continue and Restart were exercised through actual UI buttons. The exported HTML5 tutorial was then checked inside a local sandboxed iframe with Chrome raised to the foreground: Pointer Lock, native held W movement, Escape release, native canvas recapture and Return to Solo all succeeded. The 800 ms W check moved the ordinary player about 5.75 m. Native automation drag reported zero relative movement; trusted browser mouse protocol events exercised turning and advanced the real LOOK cue instead. The complete rendered route used the input harness, so a complete human mouse/keyboard playthrough remains pending.

Touch emulation at 667 × 375 verified device specific prompts, Continue activating on screen controls, and an early Fireball tap producing truthful unavailable feedback with Rival still at 100 HP. A bridge checkpoint advanced through real movement/Dash using the same input harness. This verifies device UI integration rather than thumb proficiency.

The isolated responsive layout fixture passed 35 states across 667 × 375, 740 × 360, 844 × 390, 390 × 844, 1024 × 768, 1366 × 768 and 1920 × 1080, plus the rotated shell. Controls met the 44 px floor. A compact fullscreen capture in an earlier pass showed a scaling anomaly shortly before Chrome disconnected. A fresh 667 × 375 windowed touch replay fits correctly. Physical fullscreen device fit remains unverified. Actual itch.io iframe validation remains pending. No live upload occurred.

## Cold player pass

The normal landing was tested after clearing only the local tutorial progress key. Begin Tutorial and Skip Tutorial appeared after loading. The established duel, open rooms and private room actions remain reachable immediately through Skip. Explicit invites and development destinations bypass the offer, retaining their destination. Replay remains available from Solo.

| Moment where purpose could be unclear | Finding and response |
| --- | --- |
| First landing | A visitor must choose learning or the menu. The offer explicitly recommends Tutorial and explains immediate multiplayer access through Skip. |
| Name | Begin supplies a default name when empty; manual Solo entry uses the existing name field. |
| Early text | Continue and Enter are explicit. Recorded voices are still absent, so this opening requires reading. |
| LOOK | A tiny mouse twitch previously qualified. Meaningful accumulated aim travel is now required; prompt explains pointer capture. |
| Finding Rival | The distant knight is small, especially on a phone. A direction and distance hint was added to look/approach prompts. |
| Walking | Progress must be toward Rival. The prompt names current bindings or the touch stick. |
| Sprint | Shared Guard stamina is named in the prompt and shown by the existing HUD. |
| Winded recovery | Release Sprint/lower Guard is explicit. Holding Sprint can naturally delay recovery; controls remain live. |
| First sword contact | A swing alone does not advance. Move closer is included in the prompt. |
| Guard and follow up | Face Rival, Guard, then release are explicit. Remaining raised Guard is honored. |
| Regeneration | The normal five second damage free requirement is shown. Rival gives space. |
| Duel onset | Rival attacks at the authored line onset. The transition creates real danger; unfamiliar player difficulty still needs observation. |
| Escape | Moving captions replace early panels. Rival follows the continuous authored route toward TATTLE ON YOU. |
| First Fireball | Current binding is shown. A real impact miss or expired shot can trigger the one time authored reaction. |
| Bridge | The gap is physical. Dash is explained; Jump remains mechanically truthful. Falling restores the nearby checkpoint. |
| Counterfire | Evade and return fire is explicit; Rival continues moving while gathering/releasing. |
| Final stand | Normal responsive combat begins after the pride turn. Guard dialogue reacts to genuine Guard events and cannot keep Rival immortal. |
| Ending | The authored title sequence leads to an explicit completion panel with Restart and Return to Solo. |

The pass revealed and corrected Rival discoverability, repeated postscript attacks during reading, and an overly short pursuit, forward rather than backward counterfire aim, and the retained corpse timing defect. It does not substitute for a genuinely unfamiliar tester.

## Competition assessment

The [published official rules](https://go.joinhandshake.com/rs/390-ZTF-353/images/%5BAI_Skills_Studio_Challenge%5D_Contest_Official_Rules.pdf?version=0) give the four dimensions equal weight, 25 percent each. The assessment below is an implementation judgment, not a predicted score.

| Dimension | Strongest aspect | Remaining weakness |
| --- | --- | --- |
| Execution | Genuine local combat and movement drive a complete playable route, with checkpoints and preserved multiplayer access. | Physical touch, actual itch.io hosting and complete human control testing remain pending. Local sandboxed iframe capture and native keyboard input passed. |
| Creativity | Authored comedy becomes gameplay: the stamina boast, surprise postscript, running argument and final title exchange. | The opening's caption rehearsal has less personality than the eventual performed VO and choreography. |
| Usefulness / Value | New players practice real skills under increasing pressure, while experienced players can enter multiplayer immediately. | One unfamiliar player's first encounter has yet to establish actual teaching effectiveness and difficulty. |
| Polish & Thoughtfulness | Continuous later play, truthful cooldowns, early action feedback, current bindings, first miss handling and checkpoint recovery. | Compact fullscreen fit and authored unsheathing need further presentation work. |

The rules specify an entry deadline of October 30, 2026 at 11:59 PM PT. The mission landing advertises October 31. Treat the earlier official rule deadline as the submission planning date.

## Recording and authoring handoff

All 56 prior recording keys remain. The regenerated plan contains 118 spoken keys, including 62 additions and seven creator requested text revisions under stable old keys. Distinct narrator, spellblade and Rival roles remain. The exact additions, old/new wording and optional keys are in `docs/tutorial-one-recording-changes.json`; the full take plan is `docs/tutorial-recording-plan.json`.

No synthetic VO was created. Actual take ingestion, decoding, ended event playback and final performance timing await creator recordings. The director retains token validation for stale completion and checkpoint/restart. Reactive caption timing is isolated rehearsal data; the stamina exchange uses shorter caption slots so the boast precedes real ten second exhaustion. Recorded pacing will require checking that relationship again.

The current alternate outcome is checkpoint retry on player defeat, followed by the authored successful route. It adds no invented defeat dialogue. Tutorial 2, spell catalogues, prepared spells and Ultimates remain future content.

## Modular authoring and meaningful design corrections

Chapter, Segment and Beat metadata remain the authoring contract. Enabled routes compile their next links, defaults, control permissions, scene policies and explicit dependencies. New exchanges can inherit the preceding enabled scene's presentation and permissions. Unknown landmarks fail clearly. The tests insert a new scene, edit dialogue, remove a joke, disable a provider, omit the final exchange and still complete ordinary play.

`docs/tutorial-authoring.md` explains adding, replacing, disabling and reordering scenes, stable recording keys, spatial observations, branch membership, checkpoints and recording regeneration.

The final Guard exchange moved from a mandatory gate to optional reactions. Responsive AI can naturally lower Guard, so requiring one particular Guard break could leave an otherwise won encounter unfinished. Final fight entry now permits ordinary lethal damage. The original three lines and recording keys remain attached to actual Guard raising and Guard break. This follows the newest direction that the final fight should mostly be playing the game.

A complete rendered run revealed that an infinite respawn deadline made the Death clip repeatedly sample its opening pose. The local Rival now retains its actual death timestamp in snapshots; the existing authored Death clip advances and clamps at its settled end. Normal multiplayer respawn timing is unchanged. No corpse collision or targeting was added.

Backward Fireball aiming now uses the correct vertical sign toward the pursuing player. This fixes an ordinary shot aiming above its target. The gather keeps movement directed along the escape route.

## Verification

The final `npm run verify` passed: syntax checks, all 1,232 repository tests, four HTML5 export tests and the HTTP/WebSocket smoke check. The focused final regressions passed 35 tests. The ordinary simulation playthrough covers the complete route, genuine first Fireball miss and omission of the optional final exchange. Input, world geometry, scene compilation and checkpoint tests cover the surrounding contracts.

The HTML5 export contains 530 files, 22.71 MB zipped and 29.45 MB extracted; `unzip -t` passed. A local sandboxed iframe loaded WebGL, production models and the local Greener Pastures session through actual menu controls. The initial WrongDocumentError persisted after unlocking until the actual Chrome game window was raised. Capture then succeeded both in top level Practice and inside the sandboxed tutorial iframe. Native keyboard movement, Escape, recapture and Return to Solo passed; browser protocol mouse movement advanced LOOK. Native automated drag produced zero relative movement, so physical mouse motion remains a human test. This local frame is not a claim that the actual itch.io iframe is verified.

The GitHub Chrome capture initially timed out at Bot Duel Pointer Lock because its synthetic menu clicks bypassed the new first visit invitation. The capture script now waits for the loading veil, captures the invitation and chooses Skip Tutorial through its visible button before proceeding. A normal exported landing reproduced the invitation, saved the skip choice and successfully captured the pointer through Start Bot Duel. The complete CI capture result is recorded below when available.

The final corpse checkpoint replay killed Rival through four ordinary 30 damage sword contacts. His actual Death clip remained visible and sampled its settled 1.2 second end more than 170 seconds after the kill. A fresh compact touch replay again verified Continue, LOOK, ordinary controls and early Fireball rejection.

Standalone world captures measured at most nine draw calls and 144,763 visible triangles at the authored landmarks, within the 155,000 triangle world budget. Production character geometry and animation assets were unchanged.

Production Blender geometry, rig, materials and action assets were unchanged. Voice systems, Credits VO, menu music, Sunder, Vortex, rupture, rare encounters, Sky Bait and Slush choreography were intentionally left alone. Existing tests for those paths passed. The protected Claude workspace was untouched.

## Recommended next steps

1. Creator reviews the gameplay route and the authored take plan.
2. One unfamiliar player completes it on desktop while describing unclear moments.
3. Verify real mobile touch and fullscreen fit, then the private itch.io iframe.
4. Record the three speaker roles and replace rehearsal pacing with actual ended events.
5. Approve merging and publication when those release checks are satisfactory.


## Changed files

The complete source, verification and evidence inventory for this PR follows. Export ZIPs and exploratory captures remain local.

```text
client/game/GameRuntime.mjs
client/game/InputController.mjs
client/game/InputController.test.mjs
client/game/RemotePlayers.mjs
client/game/TouchControls.mjs
client/game/TouchControls.test.mjs
client/game/localActionPresentation.test.mjs
client/game/spellbladeAnimationPlan.mjs
client/game/spellbladeAnimationPlan.test.mjs
client/index.html
client/main.mjs
client/network/GameLink.mjs
client/network/LocalHost.mjs
client/tutorial.css
client/tutorial/TutorialAuthoring.test.mjs
client/tutorial/TutorialCombatCues.mjs
client/tutorial/TutorialDirector.mjs
client/tutorial/TutorialDirector.test.mjs
client/tutorial/TutorialMovementCues.mjs
client/tutorial/TutorialMovementCues.test.mjs
client/tutorial/TutorialProgress.mjs
client/tutorial/TutorialProgress.test.mjs
client/tutorial/TutorialRival.mjs
client/tutorial/TutorialRival.test.mjs
client/tutorial/TutorialSceneCues.mjs
client/tutorial/TutorialSceneCues.test.mjs
client/tutorial/TutorialSession.mjs
client/tutorial/TutorialSession.test.mjs
client/tutorial/TutorialView.mjs
client/tutorial/TutorialView.test.mjs
client/tutorial/tutorialChapters.test.mjs
client/tutorial/tutorialContinuity.test.mjs
client/tutorial/tutorialGameplay.test.mjs
client/tutorial/tutorialPlaythrough.test.mjs
client/tutorial/tutorialRecordings.mjs
client/tutorial/tutorialRecordings.test.mjs
client/tutorial/tutorialScript.mjs
client/ui/HUD.mjs
client/worlds/GreenerPasturesRenderer.mjs
client/worlds/WorldRendererFactory.mjs
client/worlds/greenerPasturesDecor.mjs
client/worlds/greenerPasturesDecor.test.mjs
client/worlds/worldRendererFactory.test.mjs
docs/superpowers/plans/2026-10-10-tutorial-one.md
docs/tutorial-authoring.md
docs/tutorial-one-recording-changes.json
docs/tutorial-one-report.md
docs/tutorial-recording-plan.json
docs/tutorial/evidence/README.md
docs/tutorial/evidence/bridge-progression.png
docs/tutorial/evidence/browser-input-driver.js
docs/tutorial/evidence/browser-run.json
docs/tutorial/evidence/corpse-regression.json
docs/tutorial/evidence/destination-preview.png
docs/tutorial/evidence/final-confrontation.png
docs/tutorial/evidence/html5-iframe.png
docs/tutorial/evidence/settled-corpse.png
docs/tutorial/evidence/touch-early-feedback.png
docs/tutorial/evidence/touch-look.png
shared/sim/combat.mjs
shared/sim/wire.mjs
shared/src/greenerPastures.test.mjs
shared/src/modes.mjs
shared/worlds/greenerPastures.mjs
shared/worlds/registry.mjs
```

## Desktop input follow up files

```text
scripts/capture-public-arena.mjs
docs/tutorial/evidence/html5-native-input.json
docs/tutorial/evidence/html5-native-input.png
docs/tutorial/evidence/first-visit-choice.png
```

The report and evidence index were updated alongside these files. This follow up changes validation and documentation; game code and combat behavior remain as tested in 28030f5.
