# Spellblade refinement: evidence

Before is the source on main (the #371 build, which main never promoted: it still ships 78756b27). After is this
branch's build, loaded in game locally (bones `ankleL`/`ankleR` present, so the new model, not a cached one).

| Image | What it shows |
|---|---|
| `fp-arms-before-after.jpg` | First person, Guard (Blender, top before, bottom after): the right forearm was a brown lump with a tan piece standing out beside the fist; both forearms are now plate vambraces. |
| `fp-arms-in-game.jpg` | In game, first person on foot: rest, a three-cut combo, the Guard. |
| `right-gauntlet-before-after.jpg` | Third person, the sword hand from six sides (top before, bottom after): the old fist's remnants beside the grip are gone. |
| `fp-off-elbow-before-after.jpg` | In game, the heavy third cut's wind-up (top before, bottom after): the magic arm's elbow now hangs low instead of filling the lower left. |
| `right-boot-before-after.jpg` | The right boot in Idle, Guard and Run (top before, bottom after): heel, sole and toe cap stay rigid; the strapped cuff bends through the ankle's cop. |
| `mounted-sight-sequence.jpg` | In game, Fight-and-Flight sight: rest, a held three-cut combo, the Guard, rest again. |
| `third-person-in-game.jpg` | In game, third person: Idle (level helm) and Guard (right foot close up). |

## Measurements

| | Before | After |
|---|---|---|
| Mounted strike from rest: largest hand move in one frame | 12.4 cm | 2.9 cm |
| Guard raised while a cut is coming home (mounted): largest move in one frame | 23.3 cm | 4.5 cm |
| Largest one-frame move over taps, a held combo, Guard, Guard from rest, attack out of Guard | 23.3 cm | 7.2 cm (the Guard's own raise, as on foot) |
| Idle helm, mean turn from the chest (pitch, roll) | -4.5°, -6.0° | +2.0°, 0.0° |
| Cape hem swing on a quick about-face | 4 cm | 13 cm, one overshoot, settled in 1.5 s |
| Boot vertices wholly on the foot (sole, heel, toe) | shin weight reached 3 cm off the floor | 1124 of 1580 (L), 897 of 1287 (R) |

The right foot bends far more than the left because Rodin's model stands with the left shin leaning 16° forward and
the right upright: in Idle both shins lean about 30° over flat feet, so the right ankle turns 34° from its rest
(the left 13°), 55° in Guard's rear foot. Every clip carries this (the kit's own numbers are identical).
