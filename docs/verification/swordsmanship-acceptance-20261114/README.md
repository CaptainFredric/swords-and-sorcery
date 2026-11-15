# Castleward — Spellblade swordsmanship acceptance (2026-11-14)

Base: `main` 69b03a35 (PR #495 merged). Branch `claude/spellblade-swordsmanship-acceptance`. Draft only: no merge, no deploy.
No binary was changed. Canonical assets (unchanged):

| Asset | SHA-256 | Joints | Clips |
|---|---|---|---|
| `spellblade.glb` (third person) | `161879e5a39cbcae004465163716e3a107816c960289e0611e117610918a4a83` | 66 | 89 |
| `spellblade-fp.glb` | `4f53671eadd8f706692f632c71892e78e92d38cfe06592c65b2254158c5953ce` | 41 | 25 |
| `spellblade-motion.glb` (PR #457 sidecar) | `fd67e1f2be80fe1f901b177522841e6a6f55c095bf2f5964c71e5d4b49a2a687` | built on `b43e5c3f…` (the 46-clip model) | 13 |
| `spellblade-fp-motion.glb` | `ff7b20dc333c6633cae58a587e7dd1c55945e66c4b002f85bafc3ec2be44a225` | built on `def9bf62…` | 12 |

The third-person knight in this report is always measured as the client composes it: the 89-clip model, with the sidecar's
Slash_1 upper body (`spellbladeClipInventory.withMotionClips`, mirrored by `scripts/lib/glbPose.mjs composeMotion`). The sword
point is read from the skinned HeroSword. It is skinned to `socket_sword`, and its point sits at (0.385, 0.051, −1.216) in that
frame. Headings are given in the knight's frame: 0° is his aim, + is toward the side the cut travels, 90° is straight out to
the side, and more than 90° is behind him.

---

## 1. Existing implementation confirmed

- **The 78-clip improvements are in the 89.** The 89 carries every channel of Argon's 78-clip set unchanged
  (`docs/spellblade/argon-89-25-reconciliation.md`). Measured on the 89 (`scripts/spellblade-footwork-audit.mjs`):
  - **Advancing footwork.** Slash_1/2/3 step: the pelvis travels 0.15–0.19 m and the feet 0.3–0.6 m, all returning to the
    start pose. No clip animates `root`, so this is weight transfer only.
  - **Mordhau steps.** All five Mordhau clips step: the feet travel 0.2–0.8 m.
  - **Recovery poses.** `Slash_Recovery`, `Slash_Whiff_Recovery`, `Guard_From_Cut`, `Guard_Parry_Recenter` and `Block_Impact`
    are present.
  - **Cut-to-cut bridges.** `Slash_1_to_2`, `Slash_2_to_3`, `Slash_2_to_1` and `Slash_1_to_3` are present.
  - **Greave alignment.** Not separately measurable from the binary; nothing here contradicts it.
- **Mobile attack/locomotion blending is the game's, not a clip.** While moving, the strike is layered: the legs keep the gait
  and the sword/posture/sorcery layers take the cut (`spellbladeAnimationPlan.mjs`, state `attack`). Standing, the strike has
  the whole body. Root motion is never applied.
- **First-person forehand.** The procedural path (`fpSlash.mjs`) is aimed at the server's blade and settles at 79° left, on
  the server's 75° arc. Its follow-through tests pass. The first-person flop is not reproduced.
- **Sword Techniques in real Chrome** (`scripts/swordsmanship-capture-browser.mjs`, desktop, Practice yard, branch build;
  `pageErrors: []`):

  | Scenario | Phases shown by the third-person animator | Authoritative result |
  |---|---|---|
  | Rigid Riposte | Enter → Interception → Thrust → Recovery → Idle | 1 technique hit (not clean), 4.7 m travelled |
  | Whirl (held 2.6 s) | Revolution → Exit → Idle | 5 clean hits, 1 stagger-break |
  | Whirl + Gale | Revolution → GaleLift → Revolution → AirRecovery → Air → Idle | 1 hit, **climbed 20.4 m** |

  Technique hits generate no Prowess: the meter never moved. **Spend could not be observed in browser**, because Practice pins
  Prowess full (`shared/sim/Room.mjs:305`). It is covered only by unit tests, and one of those ("Whirl … spends Prowess on one
  bounded extra revolution") is among main's inherited failures. Sheets: `branch-riposte.jpg`, `branch-whirl.jpg`,
  `branch-whirl-gale.jpg`.

## 2. Defects reproduced

Measured with `scripts/spellblade-chain-sync-audit.mjs`: the real sim and the real animation plan over the composed model,
compared with `shared/src/blade.mjs bladeDirection`, the blade the server sweeps for hits. On main 69b03a35, over every scenario:

| Cut | Shown blade vs server blade at contact (mean / max) | Worst 3-D angle in the swing window | Follow-through reaches |
|---|---|---|---|
| Forehand (Slash_1) | 16.3° / 23° ahead | 95° (tap) | **123°** |
| Backhand (Slash_2) | **69.8° / 81° ahead** | 84° | **139°** |
| Chop (Slash_3) | 36° / 49° behind (pitch) | 97° | 39° |

1. **The first cut flops left (the creator's report): reproduced, third person only.** The forehand came to rest at clip time
   0.533 s, and every forehand, tapped or chained, eased into that pose and held it until its slot ended at 0.72 s. That pose
   is the 89's most over-rotated frame: the blade 123° round, behind the knight's left shoulder and nearly level. Joint by joint
   (`scripts/spellblade-first-cut-probe.mjs --joints`):

   | Frame (s) | Pelvis yaw | Shoulders | Forearm.R | Blade | Wrist (forearm↔blade) |
   |---|---|---|---|---|---|
   | f12 0.400 (contact) | 0° | 42° | 19° | 18° | 2° |
   | f13 0.433 | 2° | 48° | 81° | 88° | 7° |
   | f14 0.467 | 3° | 51° | 91° | 103° | 13° |
   | f16 0.533 (old rest) | 3° | 40° | 99° | **124°** | **26°** |
   | f18 0.600 | 1° | 27° | 70° | 87° | 17° |

   Source, ranked:
   - **(a) Runtime presentation** chose the worst frame to rest on. Fixed (§3).
   - **(b) Authored keyframes.** The hips stay square (+3°) while the shoulders turn 51° and the arm another ~45–60°.
   - **(c) Wrist.** `hand.R` keeps folding 13°→26° after the forearm has stopped (f14→f16).

   Ruled out:
   - **Weapon socket:** unchanged rest transform, and the HeroSword is rigidly skinned to it.
   - **Two-handed grip:** the hands close to 0.20 m and the off hand follows; it does not drive the blade.
   - **Sidecar composition:** frames 9–16 are identical in the canonical and composed clips.
2. **Stale presentation timings.** `swordChainPresentation.mjs` was measured on the 46-clip model. The 89 moved every cut, with
   tips up to 1.6 m (Slash_1), 2.3 m (Slash_2) and 1.7 m (Slash_3) from the old poses at the same times. The 89's crossings are
   0.391 / 0.332 / 0.385 s, not 0.40 / 0.38 / 0.36. Hence the 70° backhand lead and the chop arriving late.
3. **The authored cuts sweep about twice as fast as the server's blade.** The forehand crosses the aim at 1,700°/s; the server
   sweeps 150° over the 0.2 s window (~750°/s). Played at the authored rate, the shown blade outran the hitbox right after
   contact.
4. **A cross-fade through the body between cuts.** A followed strike cross-faded over 0.16 s from the left-side rest straight
   to Slash_2@0.1, which on the 89 sits low on the *right*. That is a 3.1 m tip sweep inside the fade, while Argon's bridges
   meet both ends exactly. None of the 89's swordsmanship extras were used by gameplay (bridges, Alt cuts, recoveries, Mordhau,
   `Guard_From_Cut`, `Rise_1`, `Turn_Pivot_*`, `Brake_Stop`, `Sprint_To_Guard_Bridge`).
5. **Authored foot skating in the 89's cuts** (needs Blender, §4). Frames with a foot within 4 cm of its Idle height moving
   faster than 1 m/s: Slash_1 13 (peak 5.9 m/s), Slash_2 17 (5.5), Slash_3 13 (7.8). The 46-clip cuts had 4–8 frames at
   1.5–1.7 m/s. The right foot snaps 0.18 m in one frame at f3→f4 and back at f20→f21. In the real-sim loop audit, standing
   chains show feet sliding in 30–37% of planted frames.
6. **The 89's chop is a diagonal.** At its aim crossing the blade is 37° to the left (78° by contact on the old timing), and it
   stops 15° below the aim. The server's chop goes straight down to −50°.
7. **Smaller defects found, not fixed here.** All are also on main:
   - Riposte and Whirl out of the Guard snap 0.15 m, then 0.24 m, in an `Idle→Idle` time jump (t = 0.767 s, loop audit).
   - A one-frame Idle at every chain restart (Chrome: main 10.801→10.835, branch 11.166→11.183).
   - Moving backhands still lead/lag the server's blade by 13–21° (the torso is shared with the gait layer).
   - The Gale-assisted Whirl climbed 20.4 m in Chrome (`galeAscentPerRevolution: 5`, up to 5 revolutions). PR #457 already
     flagged ~12 m as probably too high. **Not changed:** it is a design call.

## 3. Code fixes completed

Commit `f00fc0d2`, presentation only. Server timings, damage, Guard windows, recovery, contact, Prowess and techniques are
untouched.

- **`client/game/swordChainPresentation.mjs`**
  - `STRIKE_CLIPS` re-measured on the 89 (contact 0.391 / 0.332 / 0.385).
  - Through each swing window the clip runs at the server blade's pace. `swing` holds the frames matching the server's blade
    at −0.09 s and +0.11 s; the joins are C¹ Hermite segments and never run backwards.
  - `far` = 0.467 s, the frame all four of Argon's bridges start on (0.000 m in every joint measured).
  - Followed strikes play `BRIDGES` (`Slash_1_to_2`, `Slash_2_to_3`, `Slash_2_to_1`, `Slash_1_to_3`), then pick up at the next
    cut's 0.2 s.
  - A let-go strike is handed back to the Idle stance (0.3 s) instead of swinging on round.
- **`client/game/spellbladeAnimationPlan.mjs`**
  - The let-go hand-back uses the stance's own Idle clock, so nothing jumps when the presentation ends.
  - Bridges carry `fallback` / `fallbackTime` for a model without them.
- **`client/game/spellbladeComposition.mjs`**: honours `fallbackTime`.
- **Tests:** the presentation tests are rewritten for the new behaviour. New: the shown blade against the server's at every
  contact, and the forehand's reach.
- **Tools**
  - `scripts/spellblade-chain-sync-audit.mjs` (new): the shown blade against the server's blade.
  - `scripts/spellblade-first-cut-probe.mjs` (new): the joint-by-joint decomposition.
  - `scripts/spellblade-footwork-audit.mjs` (new): skating frames per clip.
  - `scripts/spellblade-compat-check.mjs` (new): the gate for Argon's delivery (§5).
  - `scripts/sword-loop-audit.mjs` now samples the composed model and reads the contact frames from `STRIKE_CLIPS`.
  - `scripts/swordsmanship-capture-browser.mjs --clear-view` hides the recording client's own first-person arms.

After (branch), over every scenario:

| Cut | Contact error (mean / max) | Worst window angle | Follow-through reaches |
|---|---|---|---|
| Forehand | **4.9° / 5.5° standing** (30° max is the parried strike, which never lands) | **47°** (tap; was 95°) | **102–103°** (was 123°) |
| Backhand | **5.4° / 21°** (the max is a running chain) | **51°** | **125°** (was 139°; Argon's hand-over frame) |
| Chop | **3.1° / 4.9°** | 58° | 50° |

In Chrome the animator plays Slash_1 → `Slash_1_to_2` → Slash_2 → `Slash_2_to_3` → Slash_3, then the next (rising) chain's
Slash_2 and the let-go hand-back to Idle (`timeline.json`, branch held chain). Main plays the same chain as Slash_1 → Slash_2 →
Slash_3 with cross-fades. Both builds landed 3 hits and 1 miss in that held chain: gameplay is unchanged.

## 4. Changes that need Argon's Blender work

Third-person `spellblade.glb`, 30 fps. Frame numbers are 0-based (`time × 30`).

1. **`Slash_1`: the forehand follow-through, f13–f18 (0.433–0.600 s).**
   - `hand.R`: hold the wrist at about 10° from the forearm. It folds 13°→26° over f14–f16 while the forearm has stopped.
   - `upper_arm.R` / `forearm.R`: bring the forearm's heading back from 91–99° to about 75–80° (the end of the server's arc).
   - `pelvis` / `spine`: turn the hips 15–25° with the cut. The hips stay square (+3°) while the shoulders turn 51°; the turn
     should come from the hips.
   - Keep f14 (0.467 s) as the bridges' start, or re-author the four bridges' first frames to match.
2. **`Slash_2`: the backhand follow-through, f13–f17 (0.433–0.567 s).** It reaches 138° (behind the right shoulder) where the
   46-clip cut reached 94°. Bring it to about 90°, with the same hip drive.
3. **`Slash_3`: make the chop a chop.** f10–f14 (0.333–0.467 s): bring the blade down the aim, not 37–57° to the left, and on
   to about −50° pitch by f14.
4. **Footwork in `Slash_1/2/3` and the Alt variants: lift the stepping foot.**
   - The right foot snaps 0.18 m in one frame at f3→f4 (raise) and back at f20→f21 (recovery), lifted only 2.5 cm.
   - Either author real steps (lift ≥6 cm over ≥4 frames) or plant the feet and move only the pelvis.
   - Same for `Sunder_Strike` (13 frames, 7.6 m/s), `Brake_Stop` (15, 9.3), `Sprint_To_Guard_Bridge` (16, 7.4) and
     `Rise_1` (18, 5.1).
   - Full table: `footwork-audit-89.txt`.
5. **`Slash_2_to_1`: last frame (0.32 s).** It lands 0.34 m (tip) and 0.27 m (grip) off `Slash_1`@0.2; the hands are off, the
   feet are exact. Re-key it to land on `Slash_1`@0.2 like the other three bridges.
6. **Retiming instead of the runtime pace map (optional).** If Argon re-times the cuts so the blade crosses the 150° arc over
   0.2 s around contact, `STRIKE_CLIPS.swing` can be re-measured, and the runtime pace map then becomes a no-op.
7. **The sidecar is not rebuilt.** `spellblade-motion.glb` was built on the 46-clip model (`b43e5c3f`). Its Slash_1 upper body
   matches the 89 in the cut (f9–f16 identical) but not in the raise or recovery. A new Slash_1 from Argon should replace the
   sidecar's Slash_1 (drop it from `withMotionClips`) rather than be layered under it.

## 5. Compatibility requirements for Argon's update

Run `node scripts/spellblade-compat-check.mjs <candidate.glb>` (add `--fp` for first person). It must print `compatible`. The
46-clip predecessor, for example, reports 45 incompatibilities. Then re-run the chain sync audit and the presentation tests.

- **Clip inventory.** Every name in `manifest.json` `thirdPerson.clips` (89) and `firstPerson.clips` (25). New names are
  allowed and reported. A changed duration is reported. Re-measure `STRIKE_CLIPS` (`spellblade-chain-sync-audit.mjs`,
  `spellblade-first-cut-probe.mjs`) and `DISASTER_CLIPS` whenever one of those clips changes.
  - Restless Day: `Restless_Fall_Asleep_Standing_Slump`, `Restless_Fall_Asleep_Seated_Nod`, `Restless_Sleep_Breathing_Loop`,
    `Restless_Ladder_Carry_Idle` / `_March`; first person `FP_Ladder_Carry_Idle` / `_March`.
  - Armory: the six `Armory_*_Showcase` clips.
  - Disaster: `AllNatural_*` (6 + 3), with the blade in the ground at 0.85 / 0.33 / 0.085 / 0.85 s.
  - Techniques: still the sidecars' 12 + 12 phase clips (`Technique_RigidRiposte_*`, `Technique_Whirl_*`, `FP_Technique_*`).
    The 89's combined `Rigid_Riposte_*` and `Whirl_Wind_*` clips are not what the server's phases play.
- **Skeleton and inverse binds.** 66 joints (first person 41): same names, order and parents, and inverse bind matrices within
  1e-3. The sidecars, the siege poses (`biByeOperatorPoses`, `flightRiderPosture`) and the composition bind by name.
- **Materials.** Third person needs `VisorGlow` and `SorceryAccent` (cloned per instance); first person needs `SorceryAccent`.
  Textures stay divided by the game light (0.727, 0.671, 0.474) with low metalness.
- **Blade sockets and contact trajectories.**
  - `socket_sword` stays under `hand.R` at t (−0.0152, 0.0776, −0.0302), r (0.6290, −0.0011, 0.1406, 0.7646).
  - The HeroSword stays rigidly skinned to it, with its point at (0.385, 0.051, −1.216).
  - `socket_sorcery` stays under `hand.L`.
  - Every audit measures the blade from these.
- **First-person wrist and two-handed grip.**
  - The first-person HeroSword is skinned to `hand.R` (point 0.417, 1.017, 0.213).
  - PR #457's provisional wrist join (`joinSwordWrist`) stays until a continuous wrist inspection in gameplay passes.
  - The chop's off-hand grip in first person is procedural (`fpSlash.mjs`); authored first-person cuts are only shown when no
    combo path runs.
- **Root motion and rotation ownership.**
  - `root` is never animated.
  - `pelvis` translation is weight transfer and must return to its start in every in-place clip; bridges excepted.
  - Bone owners: `upper_arm|forearm|hand|finger|thumb.R` + `socket_sword` → sword; `.L` + `socket_sorcery` → sorcery;
    `spine|chest|neck|head|clavicle` → posture; everything else → locomotion.
  - While moving, the cut's legs and pelvis are discarded for the gait, so cuts must read with their upper body alone.

## 6. Browser-tested outcomes and remaining failures

Real Chrome (`/Applications/Google Chrome.app`, headless, Metal), real game server, Practice yard, real mouse and keyboard
input. Main was recorded from a detached worktree at 69b03a35, interleaved with the branch runs. Videos (normal speed plus a
quarter-speed copy) for each run are in the session notes folder `evidence/`. Sheets in this folder:

- **`tap-remote-main-vs-branch.jpg`.** One tap, seen by a **second client** in the same Shared Practice room, with its own
  arms hidden (`--remote --clear-view`). On main the knight rests with the blade flung out to his left for longer; the branch
  settles sooner. From the front, heading toward or away from the camera is hard to judge, so the numbers in §2–3 carry the
  geometric claim.
- **`branch-held-chain-split-view.jpg`.** The local first-person view beside the third-person view, held chain. No clipping or
  wrist break was seen at sheet resolution.
- **`branch-riposte.jpg`, `branch-whirl.jpg`, `branch-whirl-gale.jpg`**: see §1.

Not verified in this pass:
- A real phone (emulated landscape only, in earlier PRs).
- Sound.
- Mounted siege poses, the Armory, Restless Day and the menu tours, in browser. They don't go through the ordinary chain
  (`chainPresentation` is used only by `spellbladePose` and `attackPlan`), and their unit tests are unchanged.
- First-person wrist continuity frame by frame.
- Moving attacks in Chrome. Measured in the Node sim only: running and sprinting chains stay layered, and contacts are within
  2–21°.

**Tests.** `PATH=~/.nvm/versions/node/v24.15.0/bin:$PATH npm test`:

| Build | Tests | Pass | Fail |
|---|---|---|---|
| main 69b03a35 | 3,212 | 3,192 | 20 |
| branch | 3,213 | 3,193 | 20 |

The failing set is identical. One of the inherited failures is in this area: "the corrected first cut uses the newer grounded
legs…" (`server/tests/spellblade-motion-sidecar.test.mjs`). On main it fails at its footwork assertion. With the re-measured
contact it now trips earlier, because it samples the sidecar's *whole-body* Slash_1 (`overlayMotion`), which the client never
plays. Left as inherited.

**Commands**

```
node scripts/spellblade-chain-sync-audit.mjs [--scenario 'one tap'] [--json out.json]
node scripts/spellblade-first-cut-probe.mjs --joints
node scripts/spellblade-footwork-audit.mjs [clip-regex] [--model other.glb]
node scripts/spellblade-compat-check.mjs [candidate.glb] [--fp]
node scripts/sword-loop-audit.mjs
node scripts/swordsmanship-capture-browser.mjs --scenario slash-tap|slash-chain|riposte|whirl|whirl-gale [--remote] [--clear-view]
```
