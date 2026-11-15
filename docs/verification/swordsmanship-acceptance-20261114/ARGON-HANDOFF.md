# For Argon: the Spellblade's ordinary sword cuts (third person)

Model: `spellblade.glb` (89 clips, `161879e5…`), 30 fps. Frame numbers are 0-based (`time × 30`). The skeleton, binds,
sockets, materials and every clip name must stay as they are. `node scripts/spellblade-compat-check.mjs <your.glb>` must
print `compatible`.

| # | Clip / bones / frames | Now | Wanted |
|---|---|---|---|
| 1 | `Slash_1`, `hand.R`, f13–f18 (0.433–0.600 s) | the wrist keeps folding 13°→26° after the forearm stops | hold the fold at about 10° |
| 2 | `Slash_1`, `upper_arm.R` / `forearm.R`, f13–f17 | the blade goes 124° round, behind the left shoulder | about 80–90°, out to his left |
| 3 | `Slash_1`, `pelvis` / `spine`, f10–f16 | the hips stay square (+3°) while the shoulders turn 51° | hips turn 15–25° with the cut |
| 4 | `Slash_2`, f13–f17 (0.433–0.567 s) | follow-through to 138° (behind the right shoulder) | about 90° |
| 5 | `Slash_3`, f10–f14 (0.333–0.467 s) | a diagonal, 37° to the left at the aim, stopping 15° below it | down the aim, to about −50° |
| 6 | `Slash_1/2/3` (and the Alt cuts), feet; worst at f3→f4 and f20→f21 | the stepping foot slides up to 0.18 m in one frame, lifted 2.5 cm | lift ≥ 6 cm over ≥ 4 frames, or plant it and move only the pelvis |
| 7 | `Slash_2_to_1`, last frame (0.32 s) | lands 0.34 m (tip) / 0.27 m (grip) off `Slash_1`@0.2 | land on `Slash_1`@0.2 exactly, like the other three bridges |

Keep these exactly:
- Every bridge starts on its cut's 0.467 s frame. If that frame changes, change the bridges' first frames with it.
- No clip animates `root`. Pelvis travel returns to its start, because the server moves the knight.
- The cuts' contact frames can move: the game re-measures them. The faster the cut through contact, the more the game slows
  it to the server's blade (about 750°/s).

Check your file: `node scripts/spellblade-candidate-acceptance.mjs <your.glb>`. Each line above becomes a "meets" or
"misses" with the number measured. The PR's report has the full reasoning
(`docs/verification/swordsmanship-acceptance-20261114/README.md`).
