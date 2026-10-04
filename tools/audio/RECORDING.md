# Recording the Spellblade's voice

The Spellblade is a hardened battlemage: controlled, chesty, economical. He grunts from the gut rather than yelling
from the throat, and he saves his breath for the one cry that matters. Record your own takes, then let
`knight_voice.py` put him in his helm: the room it was recorded in taken out, then a little deeper, closer, a touch of
grit and of steel around the face, with every word left clear. The game adds only a little of the courtyard, and only
for other knights near you: your own knight is heard as he is.

## Adding a line (the whole of it)

1. **Declare it** in `client/game/sound/voiceLines.mjs`: one entry is the whole line.

   ```js
   {
     id: 'lateLine',
     text: 'NOOoo! I am going to be late!',
     trigger: 'minorLethal',                 // the moment it may be said at (VOICE_TAGS, in the same file)
     boost: { interrupted: 1.4 },            // optional: other facts of the moment that make it likelier
     priority: 'high',                       // 'high' cuts a lesser line; 'normal' waits its turn; 'low' never cuts
     rarity: 0.12,                           // the chance it is said when its moment comes
     cooldown: 180,                          // seconds before the same knight may say it again
     credits: { title: 'Late', description: 'Rarely, when a very small amount of damage proves sufficient.', note: 'Apparently he had prior commitments.' },
   },
   ```

2. **Drop the recording** in `tools/audio/inbox/`, named after the line (`lateLine.mp3`, `late-line-2.m4a` for a
   second take), or add `file: 'GoingToBeLate.mp3'` to the declaration and keep your own name.

3. **Run** `npm run voice`. It converts, trims, takes the room out, puts him in the helm, levels and encodes each take
   into `client/assets/voice/`, rewrites the manifest the game loads, moves the recording to `artifacts/voice-sources/`
   (kept out of git) with a note in `tools/audio/voice-sources.json`, and checks everything.

4. **Commit** `client/assets/voice/`, `voiceLines.mjs` and `voice-sources.json`. The line is in the game: the
   director's rule, the subtitle and the Credits' voice library all come from the declaration.

That is all, unless the line belongs to a moment the game does not raise yet. Then one more thing is needed: the code
that decides the moment has happened (a new tag in `VOICE_TAGS`, raised from `voiceMoments.mjs` or `GameRuntime.mjs`).
A test fails if a line waits for a moment nobody raises.

Other things `npm run voice` does:

| Command | What it does |
| --- | --- |
| `npm run voice -- --check` | Only the check: what is declared, recorded, still silent, or wrong (a duplicate id, an unknown trigger, a recording nobody declared, a listed take that is missing). |
| `npm run voice -- ~/Desktop/Late.mp3 --line lateLine` | A recording from anywhere, for a named line. |
| `npm run voice -- master.wav:0.38-1.93 --line sorcery` | A window of a longer recording (seconds). |
| `npm run voice -- --add ...` | Keeps the line's earlier takes and adds these (otherwise a line's takes are replaced). |
| `npm run voice -- --redo` | Makes every take again from the archived recordings (after changing the chain); `--redo sorcery defeat` for some. |

It needs a Python with numpy (`/usr/local/bin/python3` here; `--python` or `VOICE_PYTHON` to name another).

### A line said in parts

Some lines are said a part at a time, each part when the game says so (the final duel's declaration and its answer, the
trick's "Wait, wait!!..." and its reveal, the Sunder sentence a word to a slam). Such a line declares `parts`: the
words of each part, in order. Its recordings are its parts, one each, in that order (never alternate takes), all cut
from the one master with windows:

```bash
npm run voice -- Master.mp3:0.80-7.00 Master.mp3:8.85-11.05 --line finalDuel
```

The check fails if the number recorded is not the number declared. The master is archived whole, as always; the
windows are remembered in `tools/audio/voice-sources.json`, so `--redo` cuts them again. What decides when each part
is said is `client/game/sound/voiceScenes.mjs`.

### Moments

A line says which moments it belongs to (`trigger`); the game raises moments by their tags. When a moment carries
several tags, the lines of the most particular one are tried first, and the first line that passes its odds, its
cooldown and its rank is the only one said. The tags, with what each means, are `VOICE_TAGS` in `voiceLines.mjs`:
`death`, `minorLethal`, `magicDeath`, `matchLost`, `kill`, `cleanSwordKill`, `knighthoodKill`, `galeKill`,
`gauntletKill`, `subparKill`, `messyKill`, `practiceWin`, `sunderKill`, `guardBreak`, `staggerBreakInflicted`,
`galeDisplacement`, `rescued`, `squireOpening`, `bladeSnag`, `spellCast`, `steelTurn`, `sunderInvoked`, `vortexSpin`,
`vortexDeath`, and the
smaller ones the wildcard and the grunts hang on. Facts that only make a line likelier (`boost`): `overkill`,
`decisive`, `interrupted`, `highSwing`.

### "It never fires"

With `?debug` in the address, `console.table(__ssRuntime.voiceReport())` lists every line with how often its moments
have come this session, how often it was tried and how often said. A line whose moments never come needs its moment
looked at; one tried often and never said is only rare; one never tried though its moments come has no recording.

Lines have ranks: exertions never cut anything; situational lines wait their turn; a death, a defeat or an ultimate's
cry cuts through a lesser line. Only one sentence is heard at a time. Every line, recorded or still to come, can be
heard from the game: Settings, then the quiet CREDITS button in its footer.

Blows on a guard and guards breaking are steel only (`blockRecipe` and `guardBreakRecipe` in
`client/game/sound/soundRecipes.mjs`); there are no voiced contact effects any more.

## How to record

- Voice Memos or QuickTime (File › New Audio Recording) is fine. Use a quiet room with soft furnishings: a closet of
  coats beats a bare room. The less room the recording has, the less the tool has to take out.
- Stay a hand's width or two from the mic, a little off to the side so plosives don't pop. For the SORCERY cry, lean
  back to arm's length so the loud part doesn't clip.
- Leave a short pause before and after each take. The tool trims silence.

## How a take becomes the knight

`npm run voice` hands each take to `tools/audio/knight_voice.py` with the line's own settings (its `voice` in the
declaration: the grit, the level, an eased expander for a line with a soft tail). It can be run by hand too:

```bash
python3 tools/audio/knight_voice.py --line lateLine ~/Desktop/GoingToBeLate.mp3 --preview
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

- Every line you process replaces that line's earlier takes (`npm run voice -- --add` keeps them).
- `--preview` also writes each take as another knight a few metres away hears it (a touch of the courtyard) to
  `artifacts/voice-preview/`, so you can listen first.
- `--semitones -1.5` goes less deep and `--semitones -3` deeper (the default is -2; the formants stay put either way).
- `--profile close` is the earlier, deeper chain (−4.5 semitones, formants and all); `--profile classic` the one before.
- `--drive 1.5` gives less grit and `--drive 3` gives more (the clear helm uses four fifths of it).
