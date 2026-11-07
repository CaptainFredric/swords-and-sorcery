# Castleward game mode integration — Restless Day (phase 1)

Development branch: `feat/restless-day-phase-1-20261107`. **Draft PR only; do not merge or deploy.**

## Source of truth

Creator-authored mode descriptions remain in `docs/ideas/proposed-game-modes-2026-11-04.md` and `docs/ideas/renown-renowner-worldbuilding.md`. In particular, Renown Trials uses the *same monument* but may have different rules; never make its gameplay inherit the Restless Day victory conditions. **Restless Day's name, sundown duration, monument HP, ladder HP, attack cooldown and replacement delay are provisional playtest values.**

## Mode registration / Phase 1B contract

The authoritative, standalone contract for Renown Trials and Edge of Victory is **[mode-runtime-contract.md](mode-runtime-contract.md)**. It documents all registered optional lifecycle hooks, command rejection, time/structure arbitration, collision composition, bot occupation, authoritative snapshots, events and test requirements. Do not transplant the Restless Day handler into those unrelated modes. The initial Phase 1 contract below is superseded where it differs from the new document.


- `shared/src/modes.mjs`: register the id, policy, dedicated arena collection; keep public matchmaking gated until lifecycle/win condition passes.
- `shared/worlds/registry.mjs`: register the distinct world geometry and spawn points. Render it with `client/worlds/WorldRendererFactory.mjs` and the runtime's `WORLD_RENDERERS`.
- `shared/sim/modeRuntime.mjs`: import an existing handler module and insert `[GAME_MODES.NEW_MODE, NEW_MODE_HANDLER]` into the local map. **Never import future missing modules.**
- Handler contract is a frozen object of optional functions. `modeCall(room, hook, ...args)` passes the room first. Hook names:
  - `init(room)`: initialize state on room creation and mode configuration.
  - `reset(room, matchStartSec)`: reset all mode state, rewards, actors and timers on each match/rematch after standard combat resets.
  - `step(room, dt, nowSec, {damage})`: advance authoritative simulations after ordinary combat/physics; `damage` is ordinary `applyDamage` and enforces normal protection.
  - `onTime(room, nowSec)`: return **true** if a mode exclusively owns clock handling even when not expired; return false/undefined to inherit existing time rules.
  - `beforeStructureDamage(room, id, nowSec)`: return **false** to deny a health mutation at/after the authoritative deadline, before damage changes anything.
  - `ownsTeamObjectives(room)`: skip legacy Breakthrough capture only for this registered mode. `baseWorld`, `composeWorld`, `beforeSpawns` and `botOccupation` are specified in the full contract.
  - `onStructureDamage(room, id, nowSec)`: react to a validated structural damage event; protect against duplicate endings.
  - `spawn(room, player, allSpawns)`: return preferred valid spawn-point array for authoritative respawn.
  - `botGoal(room, actor)`: return a real (x,y,z) world destination or null. Hook from the shared bot AI rather than cloning it.
  - `command(room, actor, message, nowSec)`: validate mode-specific commands. Return rejected responses when illegal.
  - `serialize(room, nowSec)`: return safe, serializable mode state (for `snapshot.modeState`). This is the **sole** client source for timed objective progress.
- Rendered HUD hooks belong in dedicated pure modules such as `client/ui/restlessDayHudView.mjs`, not in authoritative simulation modules.
- Existing modes retain their legacy `Room`, `stepObjectives`, `stepHighGrounds` and HUD paths. New modes must remain isolated.

## Current playable scope

- 5 attackers versus 5 defenders, with bot seats and room join/replacement. Private match and Modes of Mettle solo-with-bots selection, no new public matchmaking queue.
- Two uninterrupted defensive curtain lines with actual stone collision, **destructible reinforced timber gates**, separate walkable defensive ramparts and rear ramps. Attacking infantry must climb ladders or open the gatehouses with structural damage.
- Two authoritative metal siege ladders: available / carrying / deployed / broken, placement and top-lip clearance validation, climbable height-field ramps, body collision rails, shoulder-carried beam clearance shared with local movement prediction, wall-top retrieval, damage through world sword/spell hits, delayed recovery when broken. Cached geometry and navigation preserve pathfinder identity at stable deployments.
- The Rightful Renowner remains fixed on a podium. The statue's hitbox is an ordinary destructible structure; sword and spell contact uses Castleward collision rules. The placeholder model can turn and make telegraphed downstrokes/sweeps and occasionally launch collision-resolved Renown coin projectiles; it is **not** the final Argon asset.
- No fatigue effects, countdown to sundown from match start, instant defending win and attacker sleep at the strict deadline, immediate attacker win on pre-deadline statue destruction, and reset-on-rematch.
- HUD displays daylight, Renowner HP, breached-wall phase and ladder states. Client prediction rebuilds from authoritative deployed ladder geometry, not a decorative ramp.

## Known gaps / follow-up priority

1. **Real browser 5v5 playtest required.** Geometry was analyzed separately, and repository test suites and the dedicated `Restless Day real Chrome staged acceptance` workflow were submitted, but a workflow that is queued or failing is not verified gameplay. The new Chrome script stages actor positioning and injects direct structure damage to test authority; it is not an unassisted full siege. Test at 30Hz in solo and several real browsers, especially mobile controls, collision between ladder and curtain, navigation routes and performance.
2. **Argon's Renowner model/animations not yet available here.** Procedural low-poly articulated placeholder preserves expected dimensions. Replace the visual without changing server structure IDs or state contract. Destruction still needs authored shattering effects and final sound.
3. **Machine integration is partial.** The map now places the existing Bi-Bye-llista and SO-FIST-ICATION as native emplacements rather than imitations, alongside breakable timber gates. SO-FIST-ICATION initial clearance and machine-vs-gate damage require real in-game testing. Fight-and-Flight mode-specific spawner and siege balance are not implemented; reuse its native physics/health rather than making an imitation.
4. **Bot pathing and ladder-tactical tuning require live tests.** Two attacking bots can pick/place ladders through authoritative interaction. Deliberate combat, better escort, retry and obstruction navigation should be tuned in real matches.
5. **Pavises/shield-bash interactions**, detailed surrender choreography, final recorded VO, bespoke collapse animation and extended audiovisual polishing remain future work, not claimed complete.
6. **Deadline resolution** uses authoritative timestamps (damage must register strictly before deadline). Contact sub-tick times for sword swings have not yet been plumbed through all structure damage paths; test cases cover exact timestamp ordering, not network latency rewind.
7. **Collision/visual accuracy** on wall lip and stair gradients, and mobile interaction button label, still require hands-on verification. Do not expose to public matchmaking until tested.

## Phase 1B regression results and CI classification

- Real two-parent Git merge of `main` at `8629628dab1d731ed264e010e2ae6c8424a0bf04` including merged PR #404 into this PR's existing head. Merge commit `e391d18d9dbb8e3a49432fcb6ac0cc02957e61f6`; no force push or rewrite.
- Original PR CI job `128326120158` (`42346769842`) showed **2691 tests: 2683 passing, 8 failing**. Four mode-specific failures were the stale private mode list, merlon-intersecting inner defender spawn, disconnected arbitrary navigation grid and a null-versus-undefined assertion. The implementation now has cleared spawn volumes, supported nav plus dynamic real-ladder path nodes, and updated mode/UI contracts. CI verification of these changes is still required; do not call them passing until a run completes.
- The other four failing tests are an SO-FIST-ICATION attached-fist Steel-repair assertion and three missing Argon GLB/.blend binaries. Baseline `main` job in run `42384114834` fails those **same four** tests, proving they are inherited. They remain unfixed, not ignored or skipped.
- External branch-level 5v5 nav calculation with both ladders deployed: **101 supported nodes, 329 bidirectional traversable edges, one connected component and zero isolated waypoints**. Static *closed* curtain graph is intentionally disconnected; a path through solid stone would be a game defect, not a success. New tests use the actual deployed ladder geometry.
- Added `server/tests/restless-day.test.mjs` 30Hz moving ten-actor and authority tests; `scripts/restless-day-browser.mjs` + `.github/workflows/restless-day-browser.yml` exercise the actual 3D browser with screenshots and distinguish staged vs unassisted actions. The workflow must pass before claiming browser acceptance.
- A separate existing 3v3 High Grounds browser job previously timed out entering a real 3v3 lobby (run `42346769846`). It is not proof of a Restless Day failure, nor a Restless Day browser success.

## Manual acceptance sequence

Enter Modes of Mettle → Restless Day → Play with Bots. The mode starts on the dedicated two-wall map, with one human and nine bots. Walk to a free ladder and press the existing **Interact / E** control (or the touch equivalent); carry it slowly to the outer wall, interact again to deploy and climb. Cross into the inner yard, relocate the ladder to the inner wall and climb again. Destroy the Renowner with actual combat before sunset: victory to attackers. Rematch, allow the deadline to expire: immediate defeat/sleep to attackers. As defenders, repel both ladders; after a delay they must be recoverable, not permanently gone. Verify separate Breakthrough and High Grounds still launch and synchronize.

## Dialogue candidates (unrecorded)

- Initial: “If I ever sleep, I'll surrender. Let this be a restless day.”
- At fading daylight: “Whether they win or they lose, I will rest just fine.”
- Defeat: “I'm too tired for this.”

Preserve the transition from swagger to acceptance to ordinary exhaustion. Subtitle events are not proof of recorded VO.
