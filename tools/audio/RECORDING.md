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

## Lines already in the game

These came from your two recorded clips, already helm-treated (the "veteran" profile, 4.5 semitones down), so they
are not run through the tool again. Each one plays only at its moment and only now and then. The rules are in
`client/game/sound/voiceRules.mjs`.

| Line | Take | When |
| --- | --- | --- |
| `sorcery` | "SORCERY!" ×2 | A spell is cast (1 in 12, not again within 45 s). |
| `magicDefeat` | "I don't believe in magic." | Killed by a spell or its burn (about 1 in 3, 90 s apart). |
| `defeat` | "What? But I am a knight!" ×2 | Every lost match; now and then when felled. |
| `killTaunt` | "Good knight? That will not be you." and a laugh | Over someone you felled, if they said nothing. |
| `breakTaunt` | "You should have hired a REAL guard!" | After breaking a guard, now and then. |
| `victory` | "Might makes… KNIGHT!" | Winning a match. |

The voiced contact effects (your TING on a blocked blow, PERCUNK when a guard breaks) sound every time over the steel.
Settings › Sound › Voiced guard hits turns them off.

Processing any of the tool's own lines (`sorcery`, `victory`, …) replaces that line's takes; the other lines and the
effects are kept.

## How to record

- Voice Memos or QuickTime (File › New Audio Recording) is fine. Use a quiet room with soft furnishings.
- Stay a hand's width or two from the mic, a little off to the side so plosives don't pop. For the SORCERY cry, lean
  back to arm's length so the loud part doesn't clip.
- Leave a short pause before and after each take. The tool trims silence.

## Turn the takes into the knight

```bash
python3 tools/audio/knight_voice.py ~/Desktop/knight-takes --preview
```

- Every line you process replaces that line's earlier takes.
- `--preview` also writes each take with the in-game echo to `artifacts/voice-preview/` so you can listen first.
- `--semitones -1.5` goes less deep and `--semitones -4` goes deeper (the default is about -2.5).
- `--drive 1.5` gives less grit and `--drive 3` gives more.
- The takes land in `client/assets/voice/` with `manifest.json`. Commit that folder and they are in the game.

In the game, the knight grunts on some heavy swings and cries out when hurt or slain. About one cast in twelve gets
SORCERY!, never twice within 45 seconds. Other players hear your knight from where you stand, each at a slightly
different pitch.
