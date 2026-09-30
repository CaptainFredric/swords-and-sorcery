# Recording the Spellblade's voice

The Spellblade is a hardened battlemage: controlled, chesty, economical. He grunts from the gut rather than yelling
from the throat, and he saves his breath for the one cry that matters. Record your own takes, then let
`knight_voice.py` put him in his helm: the room it was recorded in taken out, then a little deeper, closer, a touch of
grit and of steel around the face, with every word left clear. The game adds only a little of the courtyard, and only
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
`source/recording-2-master.wav`). Every line is processed from the master by the clear helm (below), from these
windows. Each one plays only at its moment and only now and then. The rules are in `client/game/sound/voiceRules.mjs`.

| Line | Take | Window (s) | When |
| --- | --- | --- | --- |
| `sorcery` | "SORCERY!" ×2 | 0.38–1.93, 3.15–4.71 | A spell is cast (1 in 12, not again within 45 s). |
| `magicDefeat` | "I don't believe in magic." | 5.15–7.25 | Killed by a spell or its burn (about 1 in 3, 90 s apart). |
| `victory` | "MIGHT MAKES… KNIGHT!" | 8.15–10.72 | After force settles the argument (a Sundering kill, guard break or broken balance); now and then as Sunder is invoked. |
| `killTaunt` | "Good knight? That will not be you." | 23.62–26.42 | Over someone you felled, if they said nothing. |
| `laugh` | "AHHHhh, hahaHAH!" | 11.87–13.91 | The wildcard: rarely, at nearly anything ill-advised; once a life at most. |
| `breakTaunt` | "You should've hired a REAL guard." | 14.2–17.04 | After breaking a guard, rarely (the helping hand is likelier). |
| `defeat` | "What!? But I am a knight!" ×2 | 18.35–20.16, 20.58–23.04 | Now and then when felled; likelier on the fall that loses the match. |

Later recordings (each its own file, through the same clear helm):

| Line | What | When |
| --- | --- | --- |
| `galeTaunt` | "What did you say? Must have been the wind…" | After a Gale really moved someone, now and then. |
| `steelBoast` | "My armor works now!" | Sheathe in Steel turned a spell aside, rarely. |
| `sunderCall` | "Your integrity will not suffice!" | Most Sunders, as the brace begins (now and then MIGHT MAKES… KNIGHT! instead). |
| `knightFallen` | "The Knight has fallen!… no longer may day arrive…" | A rare fall; likelier after an overkill. |
| `fistThrow` | "I throw you my gauntlet." | Now and then as the fist lands. |
| `rebuttal` | "I present my rebuttal." | The fist, on a foe who just spoke and is nearly beaten. |
| `bladeCaught` | "Ah! My blade caught on the edge of a flower pot! …Quickly!" | Almost never, and only when the blade snags on a small furnishing. |
| `jump` ×3 | Jump grunts | Now and then on a jump, never the same take twice running. |
| `vortexUse` | Blazing Vortex's spin cry | Prepared for Blazing Vortex; not in the game yet. |
| `vortexDefeat` | "I was dizzy anyway." | Prepared: felled during Blazing Vortex (or its dizziness). |

Every line, recorded or still to come, can be heard from the game: Settings, then the quiet CREDITS button in its
footer (the voice library, `client/ui/voiceLibrary.mjs`, which is also where each line's exact moment is described).
A new line gets an entry there too (a test insists).

Lines have ranks (`VOICE_PRIORITY` in `voiceRules.mjs`): exertions never cut anything; situational lines wait their
turn; a death, a defeat or an ultimate's cry cuts through a lesser line. Only one sentence is heard at a time.

To redo them all (for example after changing the chain). The first master is
`artifacts/knight-voice-takes/source/recording-2-master.wav`; the later recordings are kept beside it in `source/later/`
(both local only, not in git):

```bash
M=artifacts/knight-voice-takes/source/recording-2-master.wav
L=artifacts/knight-voice-takes/source/later
python3 tools/audio/knight_voice.py --line sorcery $M:0.38-1.93 $M:3.15-4.71
python3 tools/audio/knight_voice.py --line magicDefeat $M:5.15-7.25
python3 tools/audio/knight_voice.py --line victory $M:8.15-10.72
python3 tools/audio/knight_voice.py --line killTaunt $M:23.62-26.42
python3 tools/audio/knight_voice.py --line laugh $M:11.87-13.91
python3 tools/audio/knight_voice.py --line breakTaunt $M:14.2-17.04
python3 tools/audio/knight_voice.py --line defeat $M:18.35-20.16 $M:20.58-23.04
python3 tools/audio/knight_voice.py --line galeTaunt $L/gale-taunt.mp3
python3 tools/audio/knight_voice.py --line steelBoast $L/steel-boast.mp3
python3 tools/audio/knight_voice.py --line sunderCall $L/sunder-call.mp3
python3 tools/audio/knight_voice.py --line knightFallen $L/knight-fallen.mp3
python3 tools/audio/knight_voice.py --line fistThrow $L/fist-throw.mp3
python3 tools/audio/knight_voice.py --line rebuttal $L/rebuttal.mp3
python3 tools/audio/knight_voice.py --line bladeCaught $L/blade-caught.mp3
python3 tools/audio/knight_voice.py --line vortexUse $L/vortex-use.mp3
python3 tools/audio/knight_voice.py --line vortexDefeat $L/vortex-defeat.mp3
python3 tools/audio/knight_voice.py --line jump $L/jump-1.mp3 $L/jump-2.mp3 $L/jump-3.mp3
```

(Use `/usr/local/bin/python3`, which has numpy.)

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

The clear helm is the standard chain for every line (`--profile clear`, the default). It replaced the close helm
on 2026-09-30, when players said they could not make out what he was saying: the close helm took the voice 4.5
semitones down with its formants (the vowels) going down too, and a heavy hand on the room left a watery warble.
Measured against the raw takes with STOI (how much of speech's short-time envelope survives, 0 to 1), the close helm
kept 0.70 of it on average and the clear helm keeps 0.86.

| Step | What it does | Why |
| --- | --- | --- |
| declip | Rebuilds peaks the recorder flattened, with a curve through each flat top | Clipped shouts crackle, and grit makes it worse |
| dereverb | Estimates how long the recording room rings (T60, capped at 0.85 s) and subtracts that late reverberation band by band, gently (at most 12 dB) | The room's echo is what makes a take sound "stitched in from outside"; a harder hand warbles |
| gate | Silences whatever lies more than 120 ms from the words (lead-ins, pauses, the room after the last word); nothing near the words is touched | Quiet between phrases, while a soft "s", "f" or a final "t" survives |
| pitch | 2 semitones down (same length), then the take's own spectral envelope put back | A little deeper, every vowel still the word it was |
| EQ | Proximity +2 dB at 150 Hz, chest +1 dB at 260 Hz, mud −1.5 dB at 420 Hz, room boxiness −1 dB at 620 Hz, helm ring +0.5 dB at 1250 Hz, presence +3 dB at 2.6 kHz, air +1 dB at 5 kHz, lowpass 11 kHz | Close and chesty, the consonants forward |
| helm | Three faint reflections at 1.1, 2.3 and 3.7 ms (six hundredths of the voice and less) | A touch of the great helm; the dry performance leads |
| compress | 3 to 1 above 18 dB under the peak, 4 ms attack, 80 ms release | A shout is dense, not spiky |
| grit | A touch of saturation (drive per line, about 1.7) | Battle-worn, not buried |
| loudness | Matched per line (−15 to −20 dB RMS), peaks under −1 dBFS | Every line sits at the same place in the mix |

In the game: your own knight's lines are heard as they are (dry, full level). Other knights' are heard only near them
(full level within 2.5 m, falling off with distance, silent beyond 16 m: `VOICE_HEARING` in
`client/game/sound/voiceRules.mjs`), with a touch of the courtyard and no echo, each knight within half a semitone of
the next. Under a spoken line the music and the wind give way a little (`VOICE_DUCK` in `SoundEngine.mjs`), and every
spoken line is written out at the foot of the view (Settings, Sound, Subtitles; on by default).

- Every line you process replaces that line's earlier takes.
- `--preview` also writes each take as another knight a few metres away hears it (a touch of the courtyard) to
  `artifacts/voice-preview/`, so you can listen first.
- `--semitones -1.5` goes less deep and `--semitones -3` deeper (the default is -2; the formants stay put either way).
- `--line sorcery` names the line for inputs whose file names don't (a window of a longer recording, `path:start-end`).
- `--profile close` is the earlier, deeper chain (−4.5 semitones, formants and all); `--profile classic` the one before.
- `--drive 1.5` gives less grit and `--drive 3` gives more (the clear helm uses four fifths of it).
- The takes land in `client/assets/voice/` with `manifest.json`. Commit that folder and they are in the game.

In the game, the knight grunts on some heavy swings and cries out when hurt or slain. About one cast in twelve gets
SORCERY!, never twice within 45 seconds. Other players hear your knight from where you stand, each at a slightly
different pitch.
