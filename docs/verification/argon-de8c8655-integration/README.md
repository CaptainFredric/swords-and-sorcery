# Argon de8c8655 Spellblade: integration and acceptance (2026-11-15)

Draft only: no merge, no deploy. Base: `main` `a275ef07`, which already contains PR #497. This integration is kept
separate from #498 (gameplay follow-up), #499 (ceiling) and #500 (Valkyrie stalls).

## Provenance (verified, not read from Argon's manifest)

| | SHA-256 | Bytes | Clips |
|---|---|---|---|
| Third person, installed | `de8c86558a0e758254c4dab87ccc48788a7fc7b42a0b1d561e5f000ac0b0bda4` | 13,580,700 | 90 |
| First person, installed | `80de8aeef10268ae80498c1d587f8f02a8df702c58acd9076331a58e81a1971e` | 7,298,028 | 25 |
| Third person, production baseline | `161879e5a39cbcae004465163716e3a107816c960289e0611e117610918a4a83` | 13,542,132 | 89 |
| First person, production baseline | `4f53671eadd8f706692f632c71892e78e92d38cfe06592c65b2254158c5953ce` | 7,298,028 | 25 |

- **Source of the files:** Argon's Drive folder, downloaded 2026-11-15. `spellblade_de8c8655_glb_part1.zip` and
  `part2.zip` concatenate to the third-person GLB. `spellblade-fp.glb` was modified 12:02 AM that day. Both match Argon's
  stated hashes.
- **Argon's manifest is wrong about the baseline.** It names a production hash `161879e5a39cbcae56dc…`, a different file
  that shares the first 16 characters. Every comparison here is against the real production file,
  `161879e5…004465…`.
- **No newer Blender source.** Argon lists the third-person `.blend` as `a33f5a94…`, byte-identical to the 14 Nov
  source, so it is not the source of this GLB.
- **The `.gz` copies** were rebuilt with `gzip -9 -n`, as before, and decompress to the installed hashes.
  `tools/blender/characters/spellblade/promotion.json` is untouched, so no promotion runs.

## 1. Compatibility: `scripts/spellblade-compat-check.mjs`

Both files are **compatible**: the same 66/41 joints and parents, inverse binds within 1e-3, the same materials and
sockets, the same sword point, every clip the game names, and no root animation. Notes:
- New clip: `AllNatural_Lightning_Arrival_Slam_1H_Alt`.
- `AllNatural_Forceful_Strike_Recovery` ends 0.22 m from where its pelvis began.

## 2. What the candidate actually changes: `scripts/spellblade-candidate-diff.mjs`

- **Mesh geometry:** identical, all 17 meshes.
- **Third person:** 26 clips changed, with the sword point up to 4 m from production:
  - the cuts: Slash_1, Slash_2 and the Alt cuts;
  - all four bridges;
  - Walk, Run and Sprint;
  - the Disaster slams, Sunder, the Chivalry casts, Guard_From_Cut, Rise_1, Brake_Stop and Cast_Recovery.
- **Unchanged:** `Slash_3` (the diagonal chop), Guard, and the Mordhau clips. Mordhau isn't used by gameplay.
- **First person:** only `Slash_1` changed, by up to 0.14 m.

Per-clip table: `clip-diff-tp-vs-161879e5.json`.

## 3. The Slash_1 sidecar would have hidden the correction (verified, then fixed)

| Forehand (`scripts/spellblade-candidate-acceptance.mjs`, from #498's tools) | As Argon authored it | With production's PR #457 sidecar override |
|---|---|---|
| Follow-through reach from the aim | **51°** | 123° |
| Wrist fold after contact | **5°** | 26° |

- **The fix:** `manifest.thirdPerson.motionOverrides: []`. The model's own `Slash_1` plays; the sidecar's technique
  phases are still appended. Models without the field keep `['Slash_1']`.
- **In real Chrome** (`scripts/spellblade-composition-browser.mjs`), the live animator's `Slash_1` `hand.R` at 0.533 s
  is `[0.0695, −0.0233, 0.0334, 0.9967]`. That is the model's own value, not the sidecar's
  `[−0.1619, 0.12, 0.0749, 0.9766]`. First person matches the first-person model too.

## 4. Retiming: only where the new poses demonstrably needed it

Measured with `scripts/spellblade-chain-sync-audit.mjs`: the shown blade against the server's blade, through the real
sim and plan, as the game composes this model. Before and after: `sync-before-retiming.json`,
`sync-after-retiming.json`.

| Cut | Contact error with the old timings | After |
|---|---|---|
| Forehand | 3.0° mean | 3.0° (**not retimed**) |
| Backhand | **27.3° mean, 32.7° max** | **4.8° mean** (`Slash_2` contact 0.332 → 0.297 s, swing frames [0.2, 0.38]) |
| Chop | 3.1° | 3.1° (**not retimed**) |

- **Bridges:** all four start on 0.467 s and now land at **0.167 s**, 0.000 m off in every joint measured, including
  `Slash_2_to_1` (0.77 m off on the 89-clip model). The pick-up moved 0.2 → 0.167 s and `Slash_2_to_1`'s blend went back
  to 0.05 s.
- **Snaps:** two appeared with the new poses and are fixed.
  - *Guard into attack* (0.52 m in one frame) and *Dash mid-chain* (3.0 m in one frame).
  - Cause, a latent flaw in #497's presentation: a cut's own short hand-over blend was applied whatever the outgoing
    clip was. `blendFrom` now limits it to the clip it was authored from.
- **Moving attacks** (Node sim): running and sprinting chains, forehand −5° / −3.5°, backhand −12° to −18°, chop +3.5°.

## 5. Disaster and Sunder: terrain contact

| Clip | Production (89): lowest point | Candidate: real low point |
|---|---|---|
| Sunder_Strike (plan 0.44 s) | 0.54 m into the floor | **0.03 m at 0.45 s**: on time, touching |
| Lightning arrival | 0.53 m in | **0.02 m at 0.167 s** |
| Ground dual-spin | 0.60 m in | 0.20 m *above* the floor at 0.983 s |
| Fast dual-spin | 0.60 m in | 0.21 m above at 0.6 s |
| Steel infusion / full eruption | 0.60 m in | 0.17 / 0.15 m above |

- **Penetration** is gone everywhere.
- **The contact frames were stale even on production:** at the planned times the blade was still overhead (2.0 m at
  0.85 s on the 89), which is why that test was already failing on `main`. They now follow the candidate's real low
  points: ground 0.983 s, fast 0.6 s, arrival 0.167 s. The test now checks the low point's timing, and that the blade
  never goes more than 2 cm under the floor; it passes.
- **Real Chrome** (`scripts/disaster-capture-browser.mjs`, Castleward Practice, no page errors):
  - **Ground:** the clip was at 1.017 s on the first frame after the commit. That frame came 0.28 s late because of a
    285 ms frame hitch at the commit, the same shader-compile pattern #500 removes for the Valkyrie dive. It's a separate
    effects issue, not fixed here.
  - **Fast:** at 0.651 s, 45 ms after the commit.
  - **Arrival:** started 45 ms after the commit.
  - The ground and fast impacts struck the dummy.

## 6. Real-Chrome gameplay (this branch, no page errors)

| Run | Result |
|---|---|
| Held chain, local split view (58.6 fps) | Slash_1 → Slash_1_to_2 → Slash_2 → Slash_2_to_3 → Slash_3 → (rising chain) Slash_2 → Slash_2_to_1 → Slash_1 → Slash_1_to_3 → Slash_3 → Slash_1 → Idle |
| Held chain seen by a **remote second client**, viewer's arms hidden (60 fps) | the full chain; follow-throughs end low on his left, not behind him (`chain-remote.jpg`) |
| Held chain, **emulated landscape phone**, touch ATTACK (57.9 fps) | chain and first-person arms as on desktop (`chain-phone.jpg`) |
| Rigid Riposte | Enter → Interception → Thrust → Recovery; 1 hit |
| Whirl | Revolution → Exit; 5 hits, 1 stagger-break |
| Gale Whirl | Revolution → GaleLift → Revolution → AirRecovery → Air |

Videos are in the session notes folder, `evidence/argon-de8c8655/`.

- **First-person wrists:** `Arm.R` is one welded mesh, with 118 edges crossing the wrist and 1,934 vertices weighted to
  both sides (`scripts/fp-wrist-seam.mjs`), so it can't separate. Only the first-person `Slash_1` changed.
- **Not verified:** a real phone (emulated only), sound, and siege or Armory presentation in Chrome. Those clips are
  unchanged apart from the Chivalry casts.

## 7. Remaining asset-authoring work for Argon (measured on de8c8655)

1. **Backhand (`Slash_2`):** the follow-through still reaches 137° with a 24° wrist fold (target ≤ 95°, fold ≤ 12°).
   Its hips already turn 33°.
2. **Forehand:** the hips stay square (+3°) while the shoulders turn 44°. Target hips ≥ 15°.
3. **Chop (`Slash_3`):** unchanged; a diagonal, 37° to the side where it crosses the aim and reaching only 27° below
   it (server: straight down to −50°).
4. **Foot skating:** unchanged in all three cuts: 13 / 17 / 13 frames, peaking at 5.9 / 5.5 / 7.8 m/s.
5. **Ground slams:** the ground, fast and Steel slams stop 15–21 cm above the floor. Bring them down within 2 cm, as
   Sunder and the arrival are, without going under.
6. **Source file:** please send the third-person `.blend` that produced `de8c8655`.

## Tests

`npm test` (Node 24): 3,219 tests, 16 failing. That's `main` `a275ef07`'s 17 minus the Disaster test, which now passes;
no new failures. The inherited "corrected first cut … PR #457" test still fails: it samples the sidecar's whole-body
`Slash_1`, which this model no longer uses.
