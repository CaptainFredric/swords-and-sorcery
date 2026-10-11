# Tutorial 1 refinement

This pass makes Greener Pastures a continuous authored pursuit with progressive controls, two distinct traversal lessons, clearer objectives and reliable Rival bridge traversal. It uses the ordinary local authoritative simulator throughout.

Base: `2c193aff3738eec0587148fdb3992dc8a0f43a6c`, the merged PR 153. Branch: `feat/tutorial-one-refinement`. Remote main remained at that revision when checked again before handoff. The creator controls merge and publication.

## Playable scope and authoring

All twelve existing chapter records remain playable, including the ending. The main route now has 21 independently authored segments and 163 beats. The recording plan has 144 spoken keys. All 118 previous spoken keys remain present.

Opening look remains fixed until LOOK. Locomotion remains locked until WALK, and Sprint opens at its own prompt. Desktop movement held during a denied lesson must be released before it can start walking. Touch look and stick gestures likewise need a new contact after the initial unlock. Mouse input discards the first stale delta. Escape and tutorial options remain available. After the brief escape head start, previously taught held movement can resume naturally.

The escape head start, Jump obstacle, tattle reveal and constitution reaction are distinct modules. Gameplay uses named landmarks and genuine facts. Optional constitution dialogue queues after the current caption, holds the main caption clock while it speaks and leaves gameplay running. Removing an optional scene or the final greeting exchange is covered by the complete route tests.

The latest creator correction is verbatim:

> And thus the Spellblade had successfully convinced the meddlesome miscommunication Rival to return to sender

The scene has a persistent narrative objective independent of temporary Jump, Fireball and Dash instructions. Touch places that objective below the shared stamina bar. The arena entry card now identifies Greener Pastures and Tutorial 1.

## Physical world and pacing

Initial separation is 175 m. A real full first Sprint in the rendered test left 61.16 m to Rival at zero stamina. This is just above the suggested range and leaves useful space for the winded exchange and recovery. Global movement and stamina tuning are unchanged.

The chase is 1,169.31 m along the authored route. Named scenery includes old field walls, a western orchard, farm and granary remnants, hedges, a sheepfold, a small stone stile, the raised broken crossing and a complaint office. The destination uses actual distance, fog and size. Its building can be faintly visible before its sign is readable.

The latest render exposed a 21 second wait at the bridge while queued speech reached Dash. This pass adds 220 m of physical route before the crossing and begins the bridge dialogue at its approach, approximately 90 m before the edge. The final rendered run reached the Dash prompt at z = -647.62, about 15 m before takeoff, then crossed while the dialogue continued. It reached the ending after ordinary combat and one genuine player death/checkpoint retry.

| Rendered comparison | Earlier route | Final route |
| --- | --- | --- |
| Get over this begins | Player already waiting at the edge | Player at the bridge approach |
| Dash prompt position | z = -441.5, at the old edge | z = -647.62, before the new edge |
| During the exchange | Stationary at the gap | Moving toward and across the gap |
| Ordinary Rival final death | Sword contact | Sword contact |

The developer driver began at the normal Jump checkpoint for this comparison. It sends ordinary movement, attack, Guard, spell and Dash inputs. It changes no health, damage, cooldown, collision or combat rules. The route data and screenshot captures are in `evidence/refinement`.

## Bridge correction and deliberate deviation

The broken span is 12.5 m wide. The takeoff bank is 2 m above the landing bank. Ordinary walkoff, standing Jump, running Jump, Sprint Jump and edge Jump were tested against normal mechanics. A genuine Sprint Jump followed by descending airborne Dash crosses at the tested simulation rates.

A pure walkoff followed by Dash cannot be made categorically better than the optimal Sprint Jump with the existing movement values. Jump supplies more air travel than that walkoff Dash supplies. The lesson therefore asks for Sprint, Jump and then Dash while airborne. The earlier small stile teaches Jump alone. This preserves established combat and movement values.

There is a real western footbridge bypass. Running that route takes more than 30 seconds. It is intentionally traversable instead of hidden behind an invisible barrier. The tutorial still requires a genuine Dash crossing for the authored traversal gate.

Rival previously attempted the gap while winded or with Dash cooling. He now waits on supported ground until ordinary Dash is ready and stamina is at least 45, comprising the normal 25 restart threshold plus 20 for approach and flight. Readiness is latched for the crossing so the reserve check cannot make him oscillate at the bank. No resource is refilled. If combat genuinely knocks him into the abyss, the existing nearby checkpoint restores the encounter with an explicit message. That event never counts as the final duel victory.

The final fight remains tethered to the entrance area. In the last rendered encounter, the ordinary sword kill left the corpse 7.35 m from the door. The settled corpse remained visible through the title and completion state.

## Verification and limits

Focused movement, touch, authoring, world, route, Rival and view tests passed. The final focused world/session/traversal group passed all 35 tests. Full `npm run verify` passed syntax validation, 1,263 game tests, four HTML5 export tests and HTTP/WebSocket smoke checks.

The final world was measured in the actual browser at 151,273 builder triangles and nine draw calls, within the existing 155,000 triangle and nine draw call budgets. Coarser overlapping hedge foliage keeps the longer landscape within that budget.

Actual browser review included physical opening input checks, genuine stamina exhaustion, the rendered Jump checkpoint through ending, moving destination dialogue, both bridge crossings, ordinary responsive final combat and persistent corpse. This combines rendered automated ordinary inputs with physical control checks. It is not an unfamiliar human playtest.

At 667 × 375, emulated touch controls showed the proper Jump instruction and a clear objective below stamina. A touch stick gesture and Jump button generated actual `jump-used` and `jump-crossed` facts and advanced the exchange. Touch behavior is emulated on this Mac; a physical phone remains a useful follow up.

The 530 file HTML5 archive is 22.72 MB compressed and passed ZIP integrity validation. The exported game loaded and rendered in a sandboxed local iframe. Physical Pointer Lock worked there. Holding W before WALK left the player at z = 160. At the normal WALK cue, a physical 850 ms W press advanced the player to z = 153.5. Escape released capture. This confirms the local sandboxed export, while actual itch.io hosting remains a separate approval controlled check.

Recorded tutorial takes and authored action choreography are still future work. The caption rehearsal timing remains temporary until recordings arrive. Efficient play can trigger reactive asides at different points. A fresh human pass with the recordings should decide final pacing. Shared combat balance, models, rig, authored animation assets, voice systems, ultimate tuning, multiplayer rewards and publication were preserved.

## New recording keys

| Stable key | Speaker role | Creator text |
| --- | --- | --- |
| `tutorial.successful-expulsion` | narrator | And thus the Spellblade had successfully convinced the meddlesome miscommunication Rival to return to sender |
| `tutorial.not-admired` | spellblade | He did not admire me. |
| `tutorial.minor-obstacle-gloat` | rival | Ahahaha! You cannot overcome this! |
| `tutorial.what-should-do` | spellblade | What should I do? |
| `tutorial.minor-ledges` | narrator | The Spellblade's journey is not impeded by minor ledges. |
| `tutorial.what-does-mean` | spellblade | What does that mean? |
| `tutorial.rises-occasion` | narrator | He rises to the occasion, climbs the ranks, and bounds onward toward greater glory. |
| `tutorial.jump-no-hints` | spellblade | I do not get hints. |
| `tutorial.jump-instruction` | narrator | Jump. |
| `tutorial.took-us-long` | spellblade | Haha! Took US long enough. |
| `tutorial.us` | narrator | Us? |
| `tutorial.minor-tactical-regret` | rival | No! I should not have stopped running for such a minor tactical advantage! |
| `tutorial.matter-settled` | rival | I know exactly how this matter must be settled. |
| `tutorial.how-settled` | narrator | How? |
| `tutorial.utmost-dignity` | rival | It will be at a place of utmost dignity! |
| `tutorial.rightfully-condemned` | rival | Where you will be rightfully condemned! |
| `tutorial.told-on` | rival | ...and be told on. |
| `tutorial.acquired-attention` | spellblade | NOW this has acquired my attention! |
| `tutorial.constitution-strange` | narrator | Hmm. This is strange. |
| `tutorial.not-strange` | spellblade | No I am not! |
| `tutorial.not-fallen` | narrator | Your rival appears not to have fallen yet. |
| `tutorial.thank-noticing` | rival | Thank you for noticing!! |
| `tutorial.what-condition` | narrator | This one is tougher than usual. What is his condition? |
| `tutorial.current-constitution` | spellblade | What is your current constitution!? |
| `tutorial.constitution-amended` | rival | My constitution... has been amended many times. |
| `tutorial.cannot-settled` | narrator | Ah... then it appears it cannot be settled. |

The regenerated recording plan contains every line and speaker directory. Caption attribution remains YOU for the player character and RIVAL for the opponent. Existing keys retain their identities. Five existing lines received the requested wording or punctuation updates listed in `tutorial-one-recording-changes.json`.

## Visual evidence

| File | What it shows |
| --- | --- |
| `evidence/refinement/moving-tattle-reveal.png` | Actual rendered pursuit during the destination exchange |
| `evidence/refinement/touch-jump-prompt.png` | Active 667 × 375 touch layout before the Jump |
| `evidence/refinement/touch-jump-crossed.png` | Actual ordinary touch Jump advancing the lesson |
| `evidence/refinement/completed-encounter.png` | Ordinary final corpse beside the building and completed tutorial |
| `evidence/refinement/route-before-spacing.json` | Rendered run exposing the old bridge wait |
| `evidence/refinement/route-after-spacing.json` | Rendered completed route after the physical pacing correction |
| `evidence/refinement/refined-bridge.png` | Static production renderer geometry inspection of the raised crossing |
| `evidence/refinement/refined-reveal.png` | Static production renderer distant destination inspection |
| `evidence/refinement/refined-destination.png` | Static production renderer entrance composition inspection |
| `evidence/refinement/exported-iframe-opening.png` | Actual exported HTML5 opening inside the local iframe |
| `evidence/refinement/exported-native-input.json` | Physical W movement and Escape result inside the iframe |

The static renderer views were captured before the final route extension. The bridge geometry and destination structure are the same; their route positions changed. They are development evidence rather than live gameplay screenshots. Earlier Fireball and completion captures remain labeled as earlier evidence.

## Exact changed files

| File |
| --- |
| `client/game/InputController.mjs` |
| `client/game/InputController.test.mjs` |
| `client/game/TouchControls.mjs` |
| `client/game/TouchControls.test.mjs` |
| `client/index.html` |
| `client/main.mjs` |
| `client/tutorial.css` |
| `client/tutorial/TutorialAuthoring.test.mjs` |
| `client/tutorial/TutorialDirector.mjs` |
| `client/tutorial/TutorialRival.mjs` |
| `client/tutorial/TutorialRival.test.mjs` |
| `client/tutorial/TutorialSession.mjs` |
| `client/tutorial/TutorialView.mjs` |
| `client/tutorial/TutorialView.test.mjs` |
| `client/tutorial/tutorialChapters.test.mjs` |
| `client/tutorial/tutorialPlaythrough.test.mjs` |
| `client/tutorial/tutorialRecordings.test.mjs` |
| `client/tutorial/tutorialRefinement.test.mjs` |
| `client/tutorial/tutorialRefinementAuthoring.test.mjs` |
| `client/tutorial/tutorialScript.mjs` |
| `client/worlds/GreenerPasturesRenderer.mjs` |
| `client/worlds/greenerPasturesDecor.mjs` |
| `client/worlds/greenerPasturesDecor.test.mjs` |
| `docs/superpowers/plans/2026-10-11-tutorial-refinement.md` |
| `docs/tutorial-one-recording-changes.json` |
| `docs/tutorial-recording-plan.json` |
| `docs/tutorial/TUTORIAL_ONE_REFINEMENT.md` |
| `docs/tutorial/evidence/browser-input-driver.js` |
| `docs/tutorial/evidence/refinement/completed-before-spacing.png` |
| `docs/tutorial/evidence/refinement/completed-encounter.png` |
| `docs/tutorial/evidence/refinement/exported-iframe-opening.png` |
| `docs/tutorial/evidence/refinement/exported-native-input.json` |
| `docs/tutorial/evidence/refinement/fireball-introduction.png` |
| `docs/tutorial/evidence/refinement/moving-tattle-reveal.png` |
| `docs/tutorial/evidence/refinement/refined-bridge.png` |
| `docs/tutorial/evidence/refinement/refined-destination.png` |
| `docs/tutorial/evidence/refinement/refined-reveal.png` |
| `docs/tutorial/evidence/refinement/route-after-spacing.json` |
| `docs/tutorial/evidence/refinement/route-before-spacing.json` |
| `docs/tutorial/evidence/refinement/touch-jump-crossed.png` |
| `docs/tutorial/evidence/refinement/touch-jump-prompt.png` |
| `shared/src/greenerPastures.test.mjs` |
| `shared/worlds/greenerPastures.mjs` |

## Next useful work

1. Creator playtest of the full route, concentrating on the escape head start, Jump joke and descending Dash timing.
2. Record and ingest the authored takes using the regenerated stable plan, then replace rehearsal pacing with the recordings.
3. Verify on a physical phone and the actual private itch.io iframe before approving publication.
