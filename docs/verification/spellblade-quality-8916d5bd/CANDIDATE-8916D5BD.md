# Argon's 8916d5bd: kept as a candidate, not installed

**File:** `8916d5bd9cfc2af6c0988db0d922cad1cb6e8a8048ff5356e3c9be3d22a28d4e`, 13,782,696 bytes, 90 clips.

**Kept in two places:**
- Argon's Drive folder, as `spellblade_8916d5bd_glb_part1–3of3.zip`;
- the session notes folder, `evidence/spellblade-quality-8916d5bd/candidate-8916d5bd-spellblade.glb`.

Its geometry, skin weights, binds and joints are byte-identical to `de8c8655`. It differs only in 17 clips.

## Worth carrying into the next revision

| Clip | Why |
|---|---|
| `Slash_3` | A real downward chop: crosses the aim within 6° (de8c8655: 37° to the side). Still only −24° below the aim within 0.12 s (wanted −40° to −50°), and the torso barely leans |
| `AllNatural_Ground_DualSpin_Slam`, `AllNatural_FastLightning_DualSpin_Slam`, `AllNatural_Steel_Infusion_Slam`, `AllNatural_Full_Steel_Eruption_Slam`, `AllNatural_Lightning_Arrival_Slam` | The blade comes down to 1.8–2.2 cm above the floor (de8c8655: 17–22 cm), without going under. The low points moved (ground 0.967 s, fast 0.667 s, arrival 0.233 s) and the reach grew to 1.68–1.77 m: the game's contact times need re-measuring with them |
| The four bridges | Land exactly, but start at 0.533 s and land at 0.133 s (the game uses 0.467 / 0.167) |

## Not to carry

| Clip | Why |
|---|---|
| `Slash_2` | Meets the 82° reach target, but the arm locks straight out at shoulder height and stops dead for 0.2 s (elbow 30.2–31.3°, blade-to-forearm 75.4–76.1° unchanged over f13–f16) |
| Footwork in `Slash_1/2/3` | Synthetic: one five-frame 0.34 / 0.81 / 0.96 / 0.81 / 0.34 m/s glide at 1.4 cm lift in all three cuts, the other foot pinned at 0.000 m/s, knee pops to 43°/frame² |
| `Sunder_Strike` | Its 1.3 cm contact never reaches the game: Sunder's slams are the ordinary cuts |

## Rules for the next candidate

It must:
- carry the corrected gauntlet weights (`server/tests/spellblade-gauntlet-plates.test.mjs`);
- solve the wrist, shoulder, backhand, chop and footwork asks (`ARGON-REQUEST.md`);
- come with a `.blend` that reproduces it through Blender's own exporter.

It is never to be combined casually with `d4889a8a` or installed whole.
