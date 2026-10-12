# Tutorial dialogue, bridge retries and Rival finale

Base: `25a6d6b1b3a5bf2e08e6a8f4792a9a4672723527`, including merged PR 156. Branch: `polish/tutorial-dialogue-retries`.

The focused followup from `c5b3340` is complete. The six older greeting lines now belong to moving pursuit, and the eight new duel terms remain at the finale. See the followup below for exact text corrections, browser evidence and current verification. The earlier evidence remains labelled with its original candidate and scope.

## Findings and corrections

The optional exchanges used their own condensed utility paragraph. The ordinary caption container also remained visible when there was no speech. Both issues came from view state and markup. Optional speech now uses the ordinary speaker label and body. Instructions, denied action feedback and the narrative objective each retain their own content state. Empty speech and instruction containers are explicitly hidden. Reactions remain playable without Continue.

At TATTLE ON YOU, a proximity clamp reduced Rival's movement input to 0.48 near the entrance. That clamp is removed. The approach now uses normal movement input. Completing YOU's pride taunt enters the authored braking and turning scene. Rival then raises genuine Guard and waits in the new independent `duel-terms` segment. The eight duel terms now lead directly into responsive final combat. The older greeting exchange takes place during the moving pursuit; the followup below records that relocation. Collision was preserved.

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

Claude owns processing and ingestion of the creator's recordings. This branch provides stable runtime keys and corrected text for that integration. Recorded playback timing still requires listening once his assets are integrated.

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

## Focused followup: pursuit banter and recorded wording

The optional `final-confrontation` segment is now `pursuit-banter`, in the pursuit chapter after the genuine Jump crossing and before Fireball instruction. Its six beat IDs, recording keys, filenames, speakers and text remain stable. `tutorial.final-hello` intentionally retains its historical name for Claude's audio mapping.

The entry waits for genuine player travel past the named orchard lane landmark at z = minus 220 metres. Rival uses the existing escape behavior. Look, movement, Sprint, sword, Guard and Jump stay available. Spell and Dash keep their progressive lesson unlocks. No route geometry, combat tuning or movement values changed.

The exchange ends with 2.5 seconds of quiet travel before Fireball instruction. This belongs to an authored stage beat, with ordinary movement continuing. Recorded playback completes naturally before the quiet stage begins; its existing conversational pause is also preserved. Removing or disabling the segment removes its spatial gate and quiet stage together. A queued constitution reaction drains before the next main caption, which then receives its full reading time. New constitution reactions are deferred to the later eligible scenes during this exchange.

The final route now goes from the completed pride taunt through physical braking and turning, genuine Guard readiness, the eight new duel terms, and directly into ordinary final combat. Rival remains protected during pursuit and becomes normally killable at final combat. All existing bridge assistance, permission reactions, rapid reply exceptions and ending behavior are preserved.

### Exact wording and recording contract

| Stable key | Previous text | Current authoritative text |
| :--- | :--- | :--- |
| `tutorial.truly-look-around` | No. Truly look around. | With your eyes. |
| `tutorial.remains-ahead` | I would like to keep attacking, but he remains ahead! | My reputation will become dead if he remains ahead! |
| `tutorial.what-condition` | This one is tougher than usual. What is his condition? | Perhaps his armor is better tailored than yours. What is his condition? |

The approved `tutorial.small-gaps` line remains “Small gaps have never stopped anybody important.” The plan still has 159 takes. This followup adds no spoken lines or recording keys. The generated plan and recording change reports reflect the new chapter, segment and exact text. The `followup` section in [the recording delta](../tutorial-polish-recording-changes.json) provides Claude's mapping. Raw VO, processing tools, audio manifests and the concurrent checkout were left under Claude's ownership.

### Actual browser progression

Chrome rendered the candidate at 1440 by 812. A checkpoint fixture started at the Jump lesson. The existing browser input driver then used real Jump, movement, Sprint, Fireball, Dash, Guard and sword actions through the ordinary local simulation. Progression facts, damage, health, stamina and cooldowns were never fabricated.

The observed route had approximately 12.4 seconds of travel between the last Jump reply and “Hello!” The six captions occupied about 14.1 seconds, then 2.55 seconds of quiet travel preceded Fireball instruction. Across the six lines, Rival travelled 105.75 metres and the player travelled 105.25 metres. Every sampled Rival velocity was nonzero, every sample remained in escape mode, and movement/Sprint permissions stayed available. Each of the six spoken IDs occurred once. The genuine constitution reaction queued afterward without replacing a main line midway through its caption.

The same run crossed the bridge, continued through counterfire, reached TATTLE ON YOU, triggered the pride turn, delivered all eight duel terms in the ready stance, defeated Rival through ordinary sword combat, and completed the authored ending. Rival's corpse remained about 7.6 metres from the entrance.

1. [Relocated chase caption](evidence/pursuit-banter/chase-caption.png).
2. [Distinct final duel terms](evidence/pursuit-banter/final-duel-terms.png).
3. [Settled ordinary Rival death](evidence/pursuit-banter/rival-defeated.png).
4. [Tutorial completion](evidence/pursuit-banter/tutorial-complete.png).
5. [Movement, speech and combat trace](evidence/pursuit-banter/browser-playthrough.json).

The existing inspection freeze was used only to save earned chase, ready stance and death screenshots. Thirty six ordinary inspection frames settled the real death pose. Normal simulation resumed after each capture. These pauses are capture aids, not tutorial behavior. The trace records them explicitly. Dialogue pacing was inspected with caption rehearsal; listening to the newly processed VO remains a separate integration check. Physical keyboard/Pointer Lock, touch and itch.io iframe checks were not repeated for this script and runtime followup.

### Current verification

All 96 focused tutorial tests pass, including five new pursuit placement, movement, wording, recorded completion and branch queue checks. Full `npm run verify` passes 1,278 repository tests, four HTML5 export tests, syntax checking and HTTP/WebSocket smoke. Complete simulation playthroughs also pass with this optional exchange omitted. `git diff --check` passes.

### Files changed in this followup

1. `client/tutorial/tutorialScript.mjs`
2. `client/tutorial/TutorialDirector.mjs`
3. `shared/worlds/greenerPastures.mjs`
4. `client/tutorial/tutorialPursuitBanter.test.mjs`
5. `client/tutorial/TutorialAuthoring.test.mjs`
6. `client/tutorial/tutorialChapters.test.mjs`
7. `client/tutorial/tutorialGameplay.test.mjs`
8. `client/tutorial/tutorialPlaythrough.test.mjs`
9. `client/tutorial/tutorialRecordings.test.mjs`
10. `client/tutorial/tutorialRefinementAuthoring.test.mjs`
11. `docs/tutorial-recording-plan.json`
12. `docs/tutorial-one-recording-changes.json`
13. `docs/tutorial-polish-recording-changes.json`
14. `docs/tutorial/TUTORIAL_DIALOGUE_RETRIES.md`
15. `docs/tutorial/evidence/pursuit-banter/chase-caption.png`
16. `docs/tutorial/evidence/pursuit-banter/final-duel-terms.png`
17. `docs/tutorial/evidence/pursuit-banter/rival-defeated.png`
18. `docs/tutorial/evidence/pursuit-banter/tutorial-complete.png`
19. `docs/tutorial/evidence/pursuit-banter/browser-playthrough.json`

The draft PR remains open for creator review. Merge, deployment and publication await creator approval.
