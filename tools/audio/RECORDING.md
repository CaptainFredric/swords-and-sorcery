# Recording the Spellblade's voice

The Spellblade is a hardened battlemage: controlled, chesty, economical. He grunts from the gut rather than yelling
from the throat, and he saves his breath for the one cry that matters. Record your own takes, then let
`knight_voice.py` put him in his helm: the room it was recorded in taken out, then deeper, closer, a little grit, a
touch of steel around the face, with the dry performance leading. The game adds only a little of the courtyard, and only
for other knights near you: your own knight is heard as he is.

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

These came from your second recorded clip (the master is in `artifacts/spellblade-voice-handoff.zip`, under
`source/recording-2-master.wav`). Every line is processed from the master by the close helm (below), from these
windows. Each one plays only at its moment and only now and then. The rules are in `client/game/sound/voiceRules.mjs`.

| Line | Take | Window (s) | When |
| --- | --- | --- | --- |
| `sorcery` | "SORCERY!" ×2 | 0.38–1.93, 3.15–4.71 | A spell is cast (1 in 12, not again within 45 s). |
| `magicDefeat` | "I don't believe in magic." | 5.15–7.25 | Killed by a spell or its burn (about 1 in 3, 90 s apart). |
| `victory` | "Might makes… KNIGHT!" | 8.15–10.72 | Winning a match. |
| `killTaunt` | "Good knight? That will not be you." and a laugh | 23.62–26.42, 11.87–13.91 | Over someone you felled, if they said nothing. |
| `breakTaunt` | "You should have hired a REAL guard!" | 14.2–17.04 | After breaking a guard, now and then. |
| `defeat` | "What? But I am a knight!" ×2 | 18.35–20.16, 20.58–23.04 | Every lost match; now and then when felled. |

To redo them all (for example after changing the chain):

```bash
M=recording-2-master.wav
python3 tools/audio/knight_voice.py --line sorcery $M:0.38-1.93 $M:3.15-4.71
python3 tools/audio/knight_voice.py --line magicDefeat $M:5.15-7.25
python3 tools/audio/knight_voice.py --line victory $M:8.15-10.72
python3 tools/audio/knight_voice.py --line killTaunt $M:23.62-26.42 $M:11.87-13.91
python3 tools/audio/knight_voice.py --line breakTaunt $M:14.2-17.04
python3 tools/audio/knight_voice.py --line defeat $M:18.35-20.16 $M:20.58-23.04
```

Blows on a guard and guards breaking are steel only (`blockRecipe` and `guardBreakRecipe` in
`client/game/sound/soundRecipes.mjs`); there are no voiced contact effects any more.

Processing a line replaces that line's takes; the other lines are kept. A new spoken line gets a camelCase name in
the game (`killTaunt`) and a hyphenated file name (`kill-taunt-1.m4a`); add it to `LINES` and `PRESETS` in the tool.

## How to record

- Voice Memos or QuickTime (File › New Audio Recording) is fine. Use a quiet room with soft furnishings: a closet of
  coats beats a bare room. The less room the recording has, the less the tool has to take out.
- Stay a hand's width or two from the mic, a little off to the side so plosives don't pop. For the SORCERY cry, lean
  back to arm's length so the loud part doesn't clip.
- Leave a short pause before and after each take. The tool trims silence.

## Turn the takes into the knight

```bash
python3 tools/audio/knight_voice.py ~/Desktop/knight-takes --preview
python3 tools/audio/knight_voice.py recording.wav:0.38-1.93 recording.wav:3.15-4.71 --line sorcery
```

The close helm is the standard chain for every line (`--profile close`, the default):

| Step | What it does | Why |
| --- | --- | --- |
| declip | Rebuilds peaks the recorder flattened, with a curve through each flat top | Clipped shouts crackle, and grit makes it worse |
| dereverb | Estimates how long the recording room rings (T60, capped at 0.85 s) and subtracts that late reverberation band by band, never more than 18 dB | The room's echo is what makes a take sound "stitched in from outside" |
| expand | Sinks whatever is 30 dB under the loudest moment, 2.5 to 1 | The last of the room between and after the words |
| pitch | 4.5 semitones down (the veteran's depth), same length | Deeper and bigger |
| EQ | Proximity +3.5 dB at 150 Hz, chest +1.5 dB at 260 Hz, room boxiness −1.5 dB at 620 Hz, helm ring +1 dB at 1250 Hz, clarity +1.5 dB at 2.7 kHz, bite −1.5 dB at 4.5 kHz, lowpass 8 kHz | Close and chesty, a hint of steel, every word clear |
| helm | Three faint reflections at 1.1, 2.3 and 3.7 ms (a tenth of the voice and less) | A touch of the great helm; the dry performance leads |
| compress | 3 to 1 above 18 dB under the peak, 4 ms attack, 80 ms release | A shout is dense, not spiky |
| grit | Gentle saturation (drive per line, about 2.5) | Battle-worn |
| loudness | Matched per line (−15 to −20 dB RMS), peaks under −1 dBFS | Every line sits at the same place in the mix |

In the game: your own knight's lines are heard as they are (dry, full level). Other knights' are heard only near them
(full level within 2.5 m, falling off with distance, silent beyond 16 m: `VOICE_HEARING` in
`client/game/sound/voiceRules.mjs`), with a touch of the courtyard and no echo.

- Every line you process replaces that line's earlier takes.
- `--preview` also writes each take as another knight a few metres away hears it (a touch of the courtyard) to
  `artifacts/voice-preview/`, so you can listen first.
- `--semitones -3` goes less deep and `--semitones -5.5` goes deeper (the default is -4.5).
- `--line sorcery` names the line for inputs whose file names don't (a window of a longer recording, `path:start-end`).
- `--profile classic` is the earlier chain, without the declip, dereverb, expander and compressor.
- `--drive 1.5` gives less grit and `--drive 3` gives more.
- The takes land in `client/assets/voice/` with `manifest.json`. Commit that folder and they are in the game.

In the game, the knight grunts on some heavy swings and cries out when hurt or slain. About one cast in twelve gets
SORCERY!, never twice within 45 seconds. Other players hear your knight from where you stand, each at a slightly
different pitch.
