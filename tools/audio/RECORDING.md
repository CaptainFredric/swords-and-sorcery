# Recording the Spellblade's voice

The Spellblade is a hardened battlemage: controlled, chesty, economical. He grunts from the gut rather than yelling
from the throat, and he saves his breath for the one cry that matters. Record your own takes, then let
`knight_voice.py` put him in his helm (deeper, a little grit, the boxy ring of steel around the face). The game adds
the echo off the castle walls live.

## What to record

Record each take as its own file and name it after its line (`effort-1.m4a`, `effort-2.m4a`, `sorcery-1.m4a`, …).
Two to six takes of a line keep it from repeating.

| Line | Takes | What it is |
| --- | --- | --- |
| `effort` | 4–6 | The breath behind a heavy swing: "hnh!", "hah!", "rrah!". Short (under half a second), from the chest. |
| `hurt` | 4–6 | Taking a blow: "ugh!", "hrk!", "nngh". Sharp, short, no screaming. |
| `death` | 2–3 | Going down: a heavier groan that cuts off. Up to a second; not theatrical. |
| `sorcery` | 3–4 | The battle cry, **SOURCE–CERYYYY!** Hit "SOURCE" hard, then hold the "-ryyyy" for about a second and let it fall away. |
| `dash` | 2–3 | A quick exhale as he lunges: "hff!". |
| `victory` | 2 | A low, satisfied "Hah!" or a short laugh. |

## How to record

- Voice Memos or QuickTime (File › New Audio Recording) is fine. Use a quiet room with soft furnishings.
- Stay a hand's width or two from the mic, a little off to the side so plosives don't pop. For the SORCERY cry, lean
  back to arm's length so the loud part doesn't clip.
- Leave a short pause before and after each take. The tool trims silence.

## Turn the takes into the knight

```bash
python3 tools/audio/knight_voice.py ~/Desktop/knight-takes --preview
```

- Every line you process replaces that line's earlier takes, including the placeholder SORCERY.
- `--preview` also writes each take with the in-game echo to `artifacts/voice-preview/` so you can listen first.
- `--semitones -1.5` goes less deep and `--semitones -4` goes deeper (the default is about -2.5).
- `--drive 1.5` gives less grit and `--drive 3` gives more.
- The takes land in `client/assets/voice/` with `manifest.json`. Commit that folder and they are in the game.

In the game, the knight grunts on some heavy swings and cries out when hurt or slain. About one cast in twelve gets
SORCERY!, never twice within 45 seconds. Other players hear your knight from where you stand, each at a slightly
different pitch.
