# Fight-and-Flight mainline recovery audit (2026-10-31)

This repair is based on main at `a6bcd30e388815d344621c9ae014c21d4d83cd74`. PR #297 was merged in its own stacked branch history; merging a PR does not imply its complete patch survived onto the separately updated main. PR #300 was merged after that and is the canonical reference for cockpit/controls/aim.

## Differential disposition

| Files | PR #297 status on audited main | Resolution |
| --- | --- | --- |
| `shared/sim/fightFlight.mjs` | Rotor power/spool/RPM/lift suppression, hover servo, hop and airborne ejection missing | Recover PR #297 authoritative simulation; **retain PR #300 4.2 rad/s airborne turn** |
| `shared/sim/fightFlightRotor.mjs` | Angular slowdown, translation threshold and lift penalty missing | Recover single-episode masonry impact response |
| `shared/sim/fightFlightWeapons.mjs` | Real-muzzle blocked/limited state reporting missing | Recover aim metadata; retain existing weapon concurrency, damage and cooldown logic |
| `shared/sim/wire.mjs` | `flightEject` command missing | Restore server-authoritative press/release/cancel; **retain PR #300 network `siegeTarget` routing** |
| `shared/src/flightRepeaterAim.mjs` | 18-shot capacity and reachability feedback missing | Retain newer PR #300 solver, widened yaw/pitch and v2.6 transform; add capacity and truthful path mismatch feedback rather than replace it with older PR #297 solver |
| `shared/sim/practiceFightFlight.mjs`, `shared/src/movement.mjs` | In-flight construction restriction and ejection landing flag reset missing | Restore |
| `client/game/InputController.mjs`, `client/game/TouchControls.mjs` | Press/release/cancel flight eject lifecycle missing | Restore without replacing PR #300 LMB repeater/RMB sword, held input release, mobile controls |
| `client/ui/HUD.mjs`, `client/ui/fightFlightHudView.mjs` | Hardcoded 14 and missing rotor RPM/ejection instructions | Dynamic capacity, real rotor RPM, aim-limited warning; preserve PR #300 LMB/RMB mapping |
| `client/game/GameRuntime.mjs` | PR #297 reticle delivery patch is not textually identical | **Superseded by PR #300:** current game already computes `flightSiegeTarget`, sends it with movement input and passes it to the local flight renderer; no downgrade |
| `client/worlds/FightFlightRenderer.mjs`, `client/game/RemotePlayers.mjs`, `client/game/SpellbladeAnimator.mjs` | PR #300 cockpit/remote animation behavior present | Leave untouched |
| `server/tests/fight-flight-*.test.mjs`, `client/game/InputController.test.mjs`, `client/ui/fightFlightHudView.test.mjs` | PR #297 regressions missing from main | Restore; preserve PR #300 convergence and weapon mapping tests, add explicit mainline invariants |
| `scripts/fight-flight-browser.mjs`, `scripts/fight-flight-terminal-browser.mjs`, `scripts/practice-siege-browser.mjs` | PR #297 checks missing or still used 14 | Restore real-Chrome acceptance assertions |
| `scripts/siege-armory-cold-browser.mjs` | No outstanding divergent change found | No rewrite |
| `server/tests/practice-siege-operators.test.mjs` | Lost practice assertions | Restore |

The original approved v2.7 GLB **is not part of this PR**. The solver and renderer continue using existing v2.6 rig geometry.

## v2.7 articulated repeating crossbow: required integration contract (separate PR)

Known legacy reference only: pivot local `(+0.650, +1.050, +0.220)` metres. Proposed new pivot near `(+0.590, +1.215, +0.330)` metres is **unverified** until approved Argon v2.7 GLB arrives. Do not substitute the proposed numbers as real measurements.

Establish and validate a single canonical joint hierarchy from the actual GLB:

```text
MachineRoot (world translation + machine heading + offensive run pitch)
 └─ YawGimbal (authored base transform, driven local yaw)
     └─ PitchCradle (authored base transform, driven local pitch)
         ├─ CrossbowAssembly / three-stage cocking animation
         ├─ MuzzleLocator (actual bolt spawn, oriented local firing vector)
         └─ GripLocators (mounted operator hand constraints)
```

Names must be read from the approved asset; these labels are descriptive rather than assumed literal node IDs. Capture baseline local matrices, axis conventions (including any mirrored axes), parent order and scale. The shared aim solver and renderer must reproduce *the same* composite transform; no approximation using only a changed single pivot. Let `T_world_muzzle = T_machine_world * T_gimbal_base * R_yaw * T_cradle_base * R_pitch * T_muzzle_local` in the measured authored frame. Transform the muzzle's **orientation** with the same hierarchy to produce a unit launch direction. The server projectile origin and velocity, local reticle truth marker, remote visual muzzle and shot effect must derive from that one contract. Model-space +Z is the current v2.6 forward convention, **not** a license to assume the new mesh's axes.

After asset receipt:
1. Verify named nodes, the three-stage mechanism's animation, and limits with the actual model, including yaw and pitch simultaneously at both extremes, run pitch, and mixed parent rotations.
2. Measure geometric clearance of bolt, string, grip, torso and chassis at every limit (Issue #299); software clamping does not establish physical clearance. Reduce unsupported limits rather than silently letting bolts travel through the model.
3. Solve camera-to-true-muzzle convergence at 3/8/20/50 metres and close / unreachable targets, including rotor run pitch. Display the reachable ray if camera reticle cannot be met.
4. Assert both client renderer and authoritative simulation produce matching joint axes, muzzle world position, and velocity; compare real network snapshots from two connected clients.
5. Validate both local and remote Spellblade gripping and real right-hand sword `Slash_1/2/3` during mounted firing, including interruption, Chivalry overlap and correct release.
6. Integrate the approved GLB in a **new PR based on repaired main**, after this branch is reviewed and merged.

## Verification policy

Required before merge: `npm run check`, `npm test`, `npm run test:html5`, `npm run smoke`; PR-triggered Chrome flight and terminal browser acceptance, plus practice siege browser checks. Record workflow run IDs and actual conclusions, not the last feature-branch test count. A two-real-network-client replication test is still necessary before claiming multiplayer verification. No merge/deploy from this recovery PR.
