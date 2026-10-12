# Tutorial dialogue, bridge retries and Rival finale

Base: `25a6d6b1b3a5bf2e08e6a8f4792a9a4672723527`, including merged PR 156. Branch: `polish/tutorial-dialogue-retries`.

## Findings and corrections

The optional exchanges used their own condensed utility paragraph. The ordinary caption container also remained visible when there was no speech. Both issues came from view state and markup. Optional speech now uses the ordinary speaker label and body. Instructions, denied action feedback and the narrative objective each retain their own content state. Empty speech and instruction containers are explicitly hidden. Reactions remain playable without Continue.

At TATTLE ON YOU, a proximity clamp reduced Rival's movement input to 0.48 near the entrance. That clamp is removed. The approach now uses normal movement input. Completing YOU's pride taunt enters the authored braking and turning scene. Rival then raises genuine Guard and waits in the new independent `duel-terms` segment. The existing greeting exchange and responsive final combat follow it. Collision was preserved.

Browser tuning moved the approach dialogue trigger from an initial candidate of 135 metres to 100 metres from the entrance. The 135 metre candidate left an unnecessarily long run after the short rehearsal taunt. In the final 100 metre run, Rival reached his settled ready state 4.5 seconds after the taunt completed. His settled position was approximately `(36, 0, -1071.65)`, about four metres from the entrance. The recorded trace shows continuous physical travel and a zero velocity ready state. Actual VO durations still require a listening and pacing pass once the files arrive.

## Bridge assistance

The first attempt uses the canonical world unchanged. A genuine player abyss death within the bridge crossing during the bridge chapter adds a visible lower destination deck extension after checkpoint restoration.

| Setting | Value |
| :--- | :--- |
| Extension per failed crossing | 1.2 metres |
| Maximum counted failures | 3 |
| Maximum extension | 3.6 metres |
| Lower destination deck height | 0 metres, unchanged |

Rendering and simulation consume the same additional floor definition. Local prediction receives the same tutorial snapshot count. The overlay adds one floor mesh only when needed; replacing or clearing it disposes the old geometry. Ordinary multiplayer snapshots remain unchanged.

Sword deaths, abyss deaths elsewhere and Rival falling do not grow the deck. Manual checkpoint retry and a fresh tutorial reset assistance. Automatic retries preserve existing assistance. The two bridge growth lines are offered only on the first extension and remain reactive. The replacement crossing line occurs after a genuine successful crossing. Movement, stamina, Jump and Dash values remain unchanged.

## Dialogue and recording handoff

The recording plan now contains 159 takes. Existing keys remain stable except the explicitly replaced crossing line. [The exact recording delta](../tutorial-polish-recording-changes.json) lists all 15 new keys with verbatim speaker and text. This is 14 additional takes plus one replacement.

| New recording key | Speaker |
| :--- | :--- |
| `tutorial.small-gaps` | YOU |
| `tutorial.bridge-senses-failure` | NARRATOR |
| `tutorial.hence-i-crossed` | RIVAL |
| `tutorial.blast-not-considered` | RIVAL |
| `tutorial.fine-we-duel` | RIVAL |
| `tutorial.if-i-win-tell` | RIVAL |
| `tutorial.if-you-lose-told` | RIVAL |
| `tutorial.when-i-win` | YOU |
| `tutorial.not-part-terms` | RIVAL |
| `tutorial.scripted-against-you` | NARRATOR |
| `tutorial.come-prove-it` | RIVAL |
| `tutorial.permission-stop` | RIVAL |
| `tutorial.no-longer-ruin` | YOU |
| `tutorial.permission-no` | RIVAL |
| `tutorial.then-no` | YOU |

`tutorial.surpass-obstacle` is retired in favour of `tutorial.small-gaps`. The subsequent maturity exchange and all other established dialogue remain intact.

The later permission exchange requires three genuine learner Fireball emissions after the introductory hit, during counterfire or the final pursuit. Each counted projectile must leave within 70 metres of Rival with a horizontal direction dot product above 0.7 toward him. Rejected requests and initial lesson casts do not count. The branch runs once per tutorial run and remains optional.

Recorded playback can register its active cue with the director. Its actual source completion owns duration, so text rehearsal cannot truncate a long take. The two local pauses begin after source completion: 0.15 seconds after `tutorial.not-strange`, and 0.08 seconds after `tutorial.permission-no`. Other recorded lines retain a 0.35 second conversational pause. Existing text rehearsal cadence is preserved. Restart, skip and checkpoint tokens prevent stale takes from advancing or replaying old speech.

The creator's finished recordings were not supplied during this pass. Ingestion, decoding and listening to the final takes remain the next task. The updated plan provides the exact additions for recording.

## Browser evidence

Chrome used the local candidate at `http://127.0.0.1:3170/?debug`. Checkpoint fixtures isolated the affected scenes. Movement, damage, stamina, spell cooldowns and bot combat then ran through the ordinary input and local authoritative simulation. No fake combat facts were injected into progression.

1. [Desktop frolic](evidence/polish/frolic-desktop.png) and [touch frolic](evidence/polish/frolic-touch.png) show ordinary spoken captions independent of the instruction. A genuine 45 metre lateral walk earned the frolic branch; its caption was replayed for the final touch capture. Touch was inspected at 667 by 375 with controls visible. The initial layout overlapped stamina; the corrected instruction sits below the bars.
2. [Desktop Fireball miss](evidence/polish/fireball-miss-desktop.png) shows the YOU reply alongside the cast prompt after a real missed cast. [Touch miss](evidence/polish/fireball-miss-touch.png) replays the earned reaction using touch presentation.
3. [Desktop empty panel check](evidence/polish/empty-panels-desktop.png) and [touch empty panel check](evidence/polish/empty-panels-touch.png) show the narrative objective without an empty speech or instruction strip.
4. [First bridge attempt](evidence/polish/bridge-first-attempt.png) and [after an actual fall](evidence/polish/bridge-after-fall.png) use the same comparison viewpoint. [Fall telemetry](evidence/polish/bridge-fall.json) records the ordinary walk off, abyss death, checkpoint restoration and 1.2 metre visible and solid extension.
5. [Final approach trace](evidence/polish/finale-approach-100m.json) records the normal counterfire pursuit through the taunt and ready state at 100 millisecond samples. [Ready pose](evidence/polish/rival-ready.png) uses the existing inspection freeze after Rival physically reached this state, followed by 15 ordinary simulation frames to settle Guard. Freeze is a capture aid, not tutorial behavior.
6. [Combat capture](evidence/polish/final-combat.png) and [playthrough telemetry](evidence/polish/pursuit-finale.json) show ordinary sword combat, Rival's real death and progression through the ending. This earlier complete run used the 135 metre candidate trigger; the final approach was separately repeated after tuning to 100 metres.
7. [Permission exchange](evidence/polish/fireball-permission.png) and [its trigger telemetry](evidence/polish/fireball-permission.json) record three legal qualifying Fireball emissions during real pursuit. The followup branch offer returns false, confirming it cannot repeat. The existing inspection freeze preserves the earned caption for capture.

## Verification

Focused tutorial tests cover view visibility, genuine bridge failures and resets, bounded geometry, approach input, completed taunt causality, readiness, legal Fireball branch triggers, scoped completion timing and stale audio. The final `node --test client/tutorial/*.test.mjs` run passes all 91 tests.

Final `npm run verify`: 1,273 repository tests and four HTML5 export tests pass. Syntax checks, HTTP assets, private path isolation, health and WebSocket smoke pass. `git diff --check` passes.

Actual itch.io iframe testing and physical phone testing were outside this focused pass. The touch evidence uses Chrome viewport and touch input emulation. Source Blender files, GLBs and authored animation clips are unchanged; this pass uses their existing Guard and locomotion presentation. Combat balance, voice content, unrelated ultimates and the menu tour remain unchanged. Tutorial chapter back and skip navigation are deliberately deferred as requested.

## Changed files

Runtime and UI:

1. `client/index.html`
2. `client/tutorial.css`
3. `client/game/GameRuntime.mjs`
4. `client/tutorial/TutorialView.mjs`
5. `client/tutorial/TutorialDirector.mjs`
6. `client/tutorial/TutorialSession.mjs`
7. `client/tutorial/TutorialRival.mjs`
8. `client/tutorial/tutorialScript.mjs`
9. `client/tutorial/tutorialRecordings.mjs`
10. `client/worlds/GreenerPasturesRenderer.mjs`
11. `shared/worlds/greenerPastures.mjs`
12. `shared/sim/wire.mjs`

Tests:

1. `client/tutorial/TutorialView.test.mjs`
2. `client/tutorial/TutorialRival.test.mjs`
3. `client/tutorial/tutorialChapters.test.mjs`
4. `client/tutorial/tutorialRecordings.test.mjs`
5. `client/tutorial/tutorialPolish.test.mjs`

Documentation:

1. `docs/tutorial-recording-plan.json`
2. `docs/tutorial-one-recording-changes.json`
3. `docs/tutorial-polish-recording-changes.json`
4. `docs/superpowers/plans/2026-10-12-tutorial-dialogue-retries.md`
5. `docs/tutorial/TUTORIAL_DIALOGUE_RETRIES.md`
6. The screenshots and telemetry linked above under `docs/tutorial/evidence/polish/`.

Prepared for creator review. Merge and release remain separate approval steps.
