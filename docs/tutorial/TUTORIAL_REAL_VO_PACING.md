# Tutorial 1: recorded dialogue and runtime pacing

Branch: `polish/tutorial-real-vo-pacing`. Main baseline: `1f3bcbf99146cf8134d6881720cf784e6e6a62fd`.

## Clean VO integration

PR 157 was merged into main. PR 158 was merged into the old stacked branch rather than main. This branch started from current main in the existing isolated worktree and cherry picked only the two direct VO commits, without conflicts:

| Claude commit | Commit on this branch |
| :--- | :--- |
| `f68f421e524b5ccbce374d6f1659a7ffcac1622b` | `0bd581a` |
| `b8d6c05691f5e5fc5ab6d11256c42479dd28e39d` | `61a4f91` |

The resulting tree at `61a4f91` exactly matches Claude's `b8d6c05` tree. The stale stacked merge commit was never merged wholesale. All 159 mappings, AAC and MP3 assets, manifest, voice loader, reversible processing files, role treatments and per take repairs are preserved. Runtime changes leave those files byte identical. The creator's original checkout and its local work remain intact.

## Stamina: observe the episode when it happens

The movement adapter deleted `sprint-sustained` when Sprint stopped. It also forwarded movement achievements only when their gate was current, using `accept` rather than remembering them in the director. Twelve seconds of recorded explanation outlasted the normal ten second bar, so the valid first episode had disappeared by the time its lesson gate arrived.

Earned movement milestones now remain in the adapter and are recorded through the director's authentic fact mechanism as they occur. Sustained Sprint still requires an actual moving Sprint episode of at least 2.5 seconds with meaningful stamina remaining at that time. Exhaustion and recovery still read the ordinary authoritative stamina snapshots. Rival proximity remains a live condition, so passing him during earlier dialogue cannot start a conversation from far away.

The first continuous Sprint request in the browser run earned sustained Sprint after 2.50 seconds and genuine exhaustion after 10.01 seconds. The later gates accepted that episode without requesting another input attempt. Narration continued to its real source endings. Normal automatic recovery and subsequent Sprint behavior are unchanged.

Tests also feed genuine production TouchControls full stick and latched Sprint gestures into LocalHost for fourteen seconds while a take remains active. Both earn the same milestones. Releasing the stick clears Sprint and its latch. Earlier unlock gating remains intact. Physical phone testing was outside this pass.

## Direct event reactions take the next clean boundary

The constitution branch could be offered before the same damage event advanced the Fireball lesson. Optional dialogue then occupied the caption and audio opportunity before the three immediate hit responses.

Damage handling now records the Fireball hit first. The existing three response beats carry an authored `reactionFor: 'fireball-hit'` group. The director gives this group precedence at the next completed take boundary. A take already playing always reaches its real end. Remaining optional lines are deferred and resumed; they are not discarded or overlapped.

If a player casts during the introductory speech, the response runs at its next clean boundary and the remaining lesson resumes afterward. Once that reaction has played, its original route position is skipped without playing those keys twice. Removing the reaction beats removes their scheduling metadata; dialogue text and Rival AI remain independent.

The two rapid call and response pairs have authored `replyGroup` metadata. An urgent response cannot split “No I am not!” from its clarification, or “No.” from “Then no.” Their existing 0.15 and 0.08 second pauses remain unchanged.

In the full browser run, “That was cold of you, ow!” began 1.59 seconds after the first impact, only 0.35 seconds after the preceding real take ended. A separate browser fixture placed a recently wounded Rival at 10 HP on the escape lane. One ordinary Fireball both completed the lesson and caused protected lethal survival. Live AAC playback then delivered:

1. “That was cold of you, ow!”
2. “I am developing warm feelings about this!”
3. “Concerning.”
4. The complete constitution exchange.

All eleven takes finished without early stops or overlaps. The clarification followed “No I am not!” after 0.1385 seconds in that fixture and 0.1436 seconds in the full run. The permission exchange was not encountered in this particular full route. Its 0.08 second completion path, actual take ownership and protection from priority interruption are covered by focused tests; Claude's loader and the recordings remain unchanged.

## Escape: physical lead releases controls

The escape scene formerly kept LOOK only permissions until six recordings completed. Now its authored scene data releases the already taught pursuit controls once Rival is at least 26 metres away and two seconds have elapsed in that scene. The spatial gate is active only in this scene; the distant opening Rival cannot preauthorize it.

The same permission check serves input filtering, HUD state and touch buttons. Releasing clears previously suspended travel requests and invokes the existing held movement resumption hook. It leaves the current take and its token untouched. The later historical `pursuit-release` beat remains a safe authored route marker and fallback, independent of this earlier control release.

The browser run released movement 3.32 seconds into the first 6.85 second narrator take, at a sampled separation of 27.13 metres. Every following escape line played over available movement. Rival remained catchable. No Rival speed, stamina, navigation, leash or combat tuning changed.

## Final Guard cancellation

Cancellation on genuine Rival death remains unchanged. The director drops optional combat instruction when the route enters the ending, and the voice loader stops the stale source. Teaching how to break a dead Rival's Guard would be obsolete. Rival's ordinary death is neither delayed nor prevented for dialogue.

The Guard exchange finished in this full run. A focused test separately verifies that death during the exchange drops its remaining instruction and ignores the old completion token.

## Recorded browser evidence

Chrome used the local candidate at 1440 by 812. A browser input driver used the production InputController and local authoritative simulator, from the opening through the ending. It never completed a spoken line manually; actual processed AudioBufferSource endings owned progression. The driver deliberately walked off the first bridge crossing to test assistance.

The complete route took **469.72 seconds, about 7 minutes 50 seconds**, with **160 takes encountered**. It included an ordinary player sword death and checkpoint retry, followed by the deliberate bridge fall and retry. These are different conditions from Claude's earlier 9 minute 26 second run, so the duration is not presented as a controlled speed comparison.

| Check | Observed result |
| :--- | :--- |
| Sustained Sprint | 2.50 seconds after first request |
| Genuine exhaustion | 10.01 seconds after first request |
| Escape control release | 3.32 seconds into narrator speech; 27.13 metre sampled lead |
| First Fireball response | 1.59 seconds after impact; next clean boundary |
| Pursuit banter | 13.67 seconds; Rival fleeing at 7.5 metres per second |
| Quiet travel after banter | 2.89 seconds including the existing recorded pause |
| Bridge assistance | One genuine abyss failure; visible and solid 1.2 metre extension |
| Bridge VO | Growth reply and approved success line played in their correct phases |
| Final duel terms | All eight, in order; 18.48 seconds, ready stance retained |
| Ending | Genuine Rival sword death, ordinary corpse, title and completion |
| Duplicate playback | Zero repeated key and run pairs |

The only early stop in the full trace was “Haha! I do not feel like it yet!” when the player died during the initial duel. That checkpoint cancellation is expected. Recorded timing survived restarting into the checkpoint. All other encountered takes reached their real ends.

Evidence:

1. [Full route telemetry](evidence/real-vo/full-route.json), downsampled to 2.5 second spatial samples. Source start/end records and events retain full precision.
2. [Derived metrics](evidence/real-vo/metrics.json).
3. [Same hit, live VO fixture](evidence/real-vo/same-hit.json).
4. [Progression capture](evidence/real-vo/stamina-progress.png).
5. [Completed tutorial](evidence/real-vo/tutorial-complete.png).
6. [Normal input driver](evidence/real-vo/browser-input-driver.js), [audio observer](evidence/real-vo/browser-audio-monitor.js) and [focused fixture](evidence/real-vo/browser-fireball-case.js).

The recorded game output and full density telemetry are kept locally under `output/tutorial-real-vo/`. The audio observer copied the game's output to a recording destination without changing gain, processing, playback rate or source files. It restored the temporary hook when complete. The local recordings are not part of the shipped game or the PR's processed assets.

## Verification and boundaries

The focused suite covers authentic milestone memory through recorded durations, both touch Sprint styles, the genuine same hit, early casting, pending aside resumption, atomic rapid replies, death cancellation, and cached MP3 fallback after an AAC decoder failure. Existing voice tests cover all mappings, speaker treatments, source completion, mute behavior, touch wording, Continue, restart, leave and stale token handling.

The final focused run passes all 131 tutorial and TouchControls tests. `npm run verify` passes 1,299 repository tests, four HTML5 export tests, syntax checking and HTTP/WebSocket smoke. The evidence helper scripts also pass Node syntax checking, and `git diff --check` passes. Gameplay balance, ordinary movement, audio processing, source animation assets, unrelated ultimates and the menu tour remain unchanged.

The browser evidence uses desktop Chrome and the browser input driver. Physical phone, hardware Pointer Lock and live itch.io iframe checks were not repeated. AAC played in the captured browser; MP3 decoder fallback is validated in the focused failure test and all paired files remain present. There is no claim that the tutorial has been published or merged.

## Runtime pass files

1. `client/tutorial/TutorialMovementCues.mjs`
2. `client/tutorial/TutorialDirector.mjs`
3. `client/tutorial/TutorialSceneCues.mjs`
4. `client/tutorial/TutorialSession.mjs`
5. `client/tutorial/tutorialScript.mjs`
6. `client/tutorial/tutorialRealVoicePacing.test.mjs`
7. `client/game/TouchControls.test.mjs`
8. This report and the evidence files listed above.

The preceding two integration commits contain Claude's original assets and tooling, preserved rather than regenerated. This branch is prepared for a fresh draft PR against main. Merge, deployment and publication await creator approval.

## Places keep their lines; asides fit the room between them

The pursuit's landmark exchanges (the TATTLE reveal, the sheepfold wall, the broken bridge and its crossing, the office) belong where they are said. Their stage beats carry `place`. The dialogue after a place, up to its next stage or prompt, is that place's.

- No aside begins inside a place's lines. An aside already under way gives them the floor at its next pause between exchanges. The aside keeps its remaining recordings and resumes in the next quiet stretch.
- An aside's lines are grouped into `exchange`s (setup and punchline: "Hmm. This is strange." through "Thank you for noticing!!"). An exchange is never split for a place. `replyGroup` is still the narrower unit that an urgent reaction cannot split.
- An exchange begins only when it fits. `TutorialSession.storyRoom()` measures the ground to the next place, by whoever must reach it, at a full Sprint. The exchange needs that room, by its recordings' real lengths (from the voice manifest), plus a second. A prompt the player has not answered yet gives a short aside six seconds (the miss's two lines, the bridge's growth).
- An aside overtaken by events (`until`) is dropped if it has not begun. A miss is no news after the hit; the bridge's growth is moot once over it. The pursuit's asides end when Rival turns at his door.
- A Fireball that finds Rival before the lesson's prompt skips its now-obsolete lead-in ("But also, you have magic at your disposal"). A joke already begun is still finished.

Rival keeps pace with the story:
- After the first Fireball hit, he stops to complain of it while its three reactions are said.
- He backs against the sheepfold wall for the reveal and goes over during "NOW this has acquired my attention!".
- He gloats just beyond the wall until the Spellblade is over. Following him straight over still hears "Your dead-end!"; only being over first skips it.
- He waits at the bridge's lip until its exchange begins and leaps as he says it.
- He waits on the far bank until the Spellblade crosses.
- He holds short of the office's hundred metres until the counterfire is done.

Waiting, he turns to face the Spellblade. He never holds in mid-air, never leaps the gap into an incoming Fireball, and drives on to the landing until he has landed.

"Hello? I can no longer sprint!" is `live`. It plays only while the Spellblade is winded now and nothing else is being said, never on an earlier bout already recovered from.
