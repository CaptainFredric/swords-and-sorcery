# For Argon: revision request against de8c8655 (2026-11-16)

`de8c8655` is now the production Spellblade (third person 90 clips, first person `80de8aee`, 25 clips). Keep everything
it improved: the forehand's follow-through, all four bridges landing exactly, and no blade under the floor. Make the
changes below in **a new revision**. The game measures every revision before it is used:
`node scripts/spellblade-candidate-acceptance.mjs <file.glb>`.

Clips are 30 fps, frames 0-based (`time × 30`). Headings are measured from the aim, positive along the direction of the
cut.

## 1. The Blender source (blocking)

Please send the `.blend` that exported `de8c8655`. The source listed for it, `spellblade-third-person.blend`
`a33f5a94…`, is byte-identical to the 14 Nov file, so it can't have produced these clips. Without it the next revision
can't be reproduced or checked against its source.

## 2. Backhand `Slash_2`: follow-through and wrist

| Frame | 12 (0.400) | 13 | 14 | 15 | 16 (0.533) | 17 | 18 (0.600) |
|---|---|---|---|---|---|---|---|
| Blade heading | 92° | 112° | 127° | 134° | **139°** | 124° | 109° |
| Wrist fold (forearm to blade) | 21° | 21° | 22° | 23° | **25°** | 22° | 20° |

- **Wanted:** ≤ 95° (the server's arc ends at 75°), with the fold ≤ 12°. Keep the hips' turn (they already reach 33°).
- **Keep:** f14 (0.467 s) is where `Slash_2_to_3` and `Slash_2_to_1` start. If that frame changes, change the bridges'
  first frames with it.

## 3. Forehand `Slash_1`: hips

The arm and wrist are right: the follow-through peaks at 52° with a 3–4° fold. But the pelvis stays square through the
cut (0–3°, f11–f16) while the shoulders turn 46°. Wanted: the hips turn 15–25° with the cut, and keep the blade path.

## 4. Chop `Slash_3`: still a diagonal

| Frame | 11 (0.367) | 12 (0.400) | 13 | 14 | 15 (0.500) |
|---|---|---|---|---|---|
| Blade heading (to the side) | 15° | **60°** | 53° | 43° | 37° |
| Blade pitch | 25° | −15° | −15° | −19° | −27° |

The server's chop comes straight down the aim, from +60° to −50° pitch. Wanted: the blade within 12° of the aim through
f11–f14, reaching −40° to −50° pitch by about f14.

## 5. Foot skating in the cuts

| Clip | Skating frames | Peak speed |
|---|---|---|
| `Slash_1` | 13 | 5.9 m/s |
| `Slash_2` | 17 | 5.5 m/s |
| `Slash_3` | 13 | 7.8 m/s |

Same in the Alt cuts. Skating means a foot within 4 cm of the ground moving faster than 1 m/s. The stepping foot slides
up to 0.18 m in a single frame (worst at f3→f4 and f20→f21). Either lift it at least 6 cm over at least 4 frames, or
plant it and move only the pelvis. Target: ≤ 8 frames, peaking ≤ 2 m/s.

## 6. Ground, fast and Steel slams don't reach the ground

| Clip | Low point | Height above the floor there |
|---|---|---|
| `AllNatural_Ground_DualSpin_Slam` | f29 (0.983 s) | 0.20 m |
| `AllNatural_FastLightning_DualSpin_Slam` | f18 (0.600 s) | 0.21 m |
| `AllNatural_Steel_Infusion_Slam` | about f28 (0.933 s) | 0.17 m |
| `AllNatural_Full_Steel_Eruption_Slam` | about f32 (1.050 s) | 0.15 m |

Bring each blade down to within 2 cm of the floor at its low point, as `Sunder_Strike` (0.03 m at 0.45 s) and the
Lightning arrival (0.02 m at 0.167 s) already are, without going under. Keep each clip's low-point time, or tell us the
new one; the game times the impact effects to it.

## 7. Questions

- **`AllNatural_Lightning_Arrival_Slam_1H_Alt`:** it's in the model but nothing plays it. Is it meant to alternate with
  the two-handed arrival, or is it an archive? The game won't use it until that's decided.
- **`AllNatural_Forceful_Strike_Recovery`:** it ends 0.22 m from where its pelvis began. Intended?

## Don't change

The skeleton, inverse binds, sockets, the sword's skin and point, material names, and every clip name.
`spellblade-compat-check.mjs` has to print `compatible`. Keep the root unanimated.
