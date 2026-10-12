# Tutorial 1 voices

The creator's recordings for Tutorial 1, from raw takes to the lines the tutorial plays. Every raw take is a row of
[the manifest](tutorial-voice-manifest.md).

```
raw take (archived untouched)  ->  lossless master (24-bit WAV, 48 kHz)  ->  game-ready (AAC .m4a, MP3 fallback)
artifacts/tutorial-voice/raw/      artifacts/tutorial-voice/masters/          client/assets/tutorial-voice/
```

Nothing processed is ever a source: every build starts again from the raw takes. The raw takes and masters stay out of
git (`artifacts/`), as the combat voice's sources do. It needs numpy, scipy, praat-parselmouth, pedalboard, pyloudnorm
and pyworld (`tools/audio/requirements-tutorial-voice.txt`).

## Changing a voice

| To | Edit | Then |
| --- | --- | --- |
| Change Rival's pitch or formants | `roles.rival.presets.declarative-2026-10-12` in `tools/audio/tutorial-voice-chains.json` (`pitch.semitones`, `formants`) | `python3 tools/audio/tutorial_voice.py --speaker rival` |
| Change how much helm the Spellblade has | `helm.amount` in his preset (1 the established knight; it scales the helm's ring, reflections and grit together) | `--speaker spellblade` |
| Revert a character's treatment | its `use`: the earlier presets are kept by name (Spellblade `established-helm`, Rival `creator-2026-10-12`, Narrator `cleanup`, and the pilots) | `--speaker <name>` |
| Change one take only | its row in `tools/audio/tutorial-voice-sources.json`: `chain` (a preset of its own, `pitchEngine`, `gainDb`) or `repairs`, each with `why` | `python3 tools/audio/tutorial_voice.py <key>` |
| Master the staged takes (lines the script has not placed yet) | | `--staged`: masters, and review files in `artifacts/tutorial-voice/staged/` (not served) |
| Check the sources | | `--check` |

## The characters

| Character | Treatment (preset in use) |
| --- | --- |
| Spellblade | **The established helm, session-matched** (`session-matched`): the chain of every combat line (gentle room removal, pauses gated, two semitones down with every vowel kept, chest, presence, the helm's ring, reflections and grit, 3:1), plus four bells that put back three quarters of the difference between the tutorial and combat recording sessions (below). Quiet lines get exactly the same helm as shouts. The pitch moves by the established phase vocoder; a take it cannot follow (over 8% of voiced frames a semitone off) moves by PSOLA or Rubber Band instead, under the same helm. |
| Rival | **Formants 6% down, pitch 1.5 semitones down, declarative** (`declarative-2026-10-12`). PSOLA moves the whole contour together, every rise and fall of it, then the formants are warped. Body and chest in the EQ, consonants defined at 2.8 kHz, a little less breath above 7 kHz, a light helm, no grit. The compressor only catches peaks (−14 dB, 2:1, 15 ms attack) and onsets are lifted up to 3.5 dB, so his statements land. |
| Narrator | **Settled** (`settled`): formants 2.5% down with the pitch untouched, warmth at 240 Hz, the upper mids eased (1.5 dB at 3.2 kHz, up to 3 dB more only where they stand out), the top softened above 7.5 kHz, a smoother 2.5:1, de-essed. Distinct from the performer and from both knights (pitched down), his own intonation and timing kept. "Jump." uses `settled-direct`: no compression, so it stays abrupt. |

Measured over all their takes, the Spellblade's long-term spectrum (third octaves, 150 Hz–6 kHz, level-matched) is
0.87 dB from the 114 combat lines; with `established-helm` it was 1.55 dB (the first tutorial pass was further still,
missing up to 6 dB of the helm's 5–10 kHz edge). Rival's pitch moved 1.36–1.45 semitones down at the median on every line checked. His intonation
range is unchanged ("If you lose, you lie on the ground…": 12.8 → 12.7 semitones).

Levels: the knights around −16.8 LUFS (the combat lines' level), the Narrator around −19.5. Each take keeps half of
its own difference from its character's usual delivery (at most 2.5 dB either way), so a shout stays louder than a
mutter. True peaks stay under −1.5 dBFS.

## Per-take exceptions and repairs

| Take | Exception | Why |
| --- | --- | --- |
| "Ah..." | `splice` 0.675–0.83 s | The voice breaks mid-"Ah...": a creak, then an aperiodic break with a 40 ms flip up an octave (about 330 Hz). Every pitch change made the flip a stray note. The break is refilled with the take's own glottal cycles from just after it (no resynthesis), so the voice's own jitter and shimmer run through; the creak is kept. The earlier WORLD `mend` made it a machine-steady vowel (below). |
| "There was an extra." | `release` +80 ms | The recorder stopped while the last syllable was still releasing. Its breath continues 80 ms, falling 30 dB, from the release's own spectrum: no stretched vowel, no loop. |
| "Jump." | preset `settled-direct`, +1 dB | Terse on purpose. |

The pitch engine is chosen automatically, per take, by the contour check. 11 Spellblade takes use PSOLA and 1 uses
Rubber Band ("I do not get hints." in the jump scene), all under the same helm; "Ah..." passes the established vocoder
since its repair. One Rival take uses Rubber Band ("That was not part of the terms").

## What the recordings needed

- **Every MP3 ends on a broken frame.** The recorder stopped mid-frame. These frames decode as a garbled drop in level,
  then silence, in the last 52–131 ms. Each take ends before them. In nine played takes the last word was still
  decaying there, and ends on a 30 ms fade: "That is your stamina", "I despise this.", "Interception!",
  "Impressive.", "That was cold of you, ow!", "Fine then, we duel!", "The sword remains mightier than the pen...",
  "No I am not!" and "Aha! Try getting over this!".
- **The recording app's noise suppression and gain.** The room steps up as each line starts. The room is quiet
  (−50 to −55 dBFS), so it is evened between the words rather than denoised.
- **Recorder padding.** Trimmed to 40 ms before the first sound, the word's own decay after the last. Pauses inside a
  line are never touched.

## In the game

`client/tutorial/tutorialVoice.mjs` decodes the director's current line (the touch take where it has one) and hands it
to `playTutorialCue` with the director. The take's real end completes the line, and the director keeps the pause after
it: 0.35 s by default, 0.15 s after "No I am not!", 0.08 s after Rival's "No.". Muted, or before the sound is unlocked,
nothing plays and the director paces the line as before. Continue, restart, skip and leaving stop the take. A take
whose end is never heard is let go 1.5 s late. The first take waits for the arena gate.

Recorded from the game (Chrome, default levels), each line's caption and take started together, with the director's
pauses exactly as authored. The clips are on the review page (`artifacts/tutorial-voice/review/`, the `vo-review`
preview).

Every voice plays dry (`reverb: 0`). The Credits library plays combat lines with `VOICE_HEARING.own`, 0.02 into the
courtyard convolver, but the convolver normalises its impulse: rendered through the game's own SoundEngine in Chrome,
that send is 45–48 dB under the voice and its tail never rises above about −65 dBFS. It is inaudible, so the tutorial
does not copy it.

## Round 4 (2026-10-12): "Ah...", a glitch scan, three treatments, new takes

- **"Ah..."**: the digital glitch the creator heard was the WORLD `mend` itself. It replaced the voice break with a vowel
  resynthesized from one 5 ms frame either side: 0.06% jitter and 28 dB HNR inside a voice of about 1.5% and 5 dB. It
  reached the shipped file unchanged (0.18% and 25.6 dB at 0.17–0.34 s, which is the raw's 0.665–0.825 s less the
  0.49 s the trim removes); the pitch engine, helm, grit and both codecs added nothing. The `splice` refill measures
  3.2% jitter, 15.6% shimmer and 7.5 dB HNR, the voice either side's range, with the pitch straight through at 141 Hz.
- **Glitch scan**: every master against its own cleaned raw take (the same timeline) for pitch jumps, notes only in
  the master, machine-steady stretches, clicks, dropouts, spectral jumps, bitten onsets and tails, sibilance, clipping,
  room steps and codec error, then every flag looked at again. One real defect ("Ah..."). The rest: the performer's
  vocal fry read as octave jumps, plosive bursts the raw has too, the established helm's silenced pauses, stop
  closures, the MP3 fallback's ordinary 20–22 dB SNR. The Spellblade's sibilance is within the combat lines' own range.
  No re-records. A 5 ms end fade now makes every take end on silence (the worst before ended 60 dB down).
- **Narrator**: `cleanup` was too close to the untreated performer; `settled` (above). Intelligibility against the raw
  (STOI) 0.94–0.98, against 0.97–0.99 before.
- **Rival**: the old compressor squashed the emphatic word his lines end on (statements fell 6.9 dB under the line,
  3.1 dB as recorded) and PSOLA softened his onsets (a 12.2 dB rise in the first 15 ms as recorded, 9.9 shipped).
  `declarative-2026-10-12`: 4.0 dB and 11.5 dB.
- **Spellblade against Credits**: the chains are the same (the tutorial and combat chains run on the same raw takes
  differ by under 0.5 dB); the recording sessions are not (through the same chain, the combat session has up to 3 dB
  more at 500–800 Hz and 4–6 kHz and less at 1.26 kHz). The decay after the last word, and the early reflections
  (cepstra 0.3–20 ms), match within 3%: the difference is tone, not room. `session-matched` puts three quarters of it
  back: 0.87 dB from the combat lines, against 1.55 dB. No reverb added.
- **Timing**: every take's length and onset are exactly as before; the processing never changes a take's length.
- **In the game** (Chrome, real input, Codex's #159 playtest driver, the processed AAC through the real AudioContext):
  the whole route in 7 min 49 s, 152 takes, none repeated, each to its real end except "Convince him to unblock you."
  (dropped as designed when Rival falls mid-line). Gaps between lines: median 0.35 s; "No I am not!" to the
  clarification 0.16 s; sustained Sprint 2.5 s after it began; "That was cold of you, ow!" 2.5 s after the Fireball hit;
  all eight duel terms in order; the ending to its last line. The permission exchange needs three later Fireballs and
  did not come up, so it was played on its own: "No." to "Then no." 0.081 s.
- **Staged takes**: "Argh!... Perhaps I had the wrong address!!" and "Yes! Alas we have reached the end of your story.
  Your dead-end!" (Rival), "You have more pages, Spellblade." (Narrator), "The dead-end is a LIE—ve!" (Spellblade).
  Archived and hashed; mastered with the presets above (`--staged`), not served until the script places them. In
  "LIE—ve" the pause before "—ve" keeps its time (2.13–2.28 s) and nearly its depth (20.1 dB under "LIE", 21.5 dB as
  recorded); the /v/ lands at 2.30 s.

## Full route, in the game (2026-10-12, PR #157 at 9975864)

The whole of Tutorial 1, from the arena gate to "Let us hope there are not many like him.", played in Chrome with real
input (Codex's playtest driver, changed only to let recorded lines finish and to fail the bridge once): 9 min 26 s,
148 takes, recorded from the game's own output (`artifacts/tutorial-voice/review/in-game/full-route.m4a`).

- **Every take played to its real end but one:** Rival's "This should stop you!" is cut halfway when he dies in the
  final fight and the ending begins (the narrator's "Convince him to unblock you." is dropped with it).
- **Between lines:** 0.3–0.4 s (the director's 0.35 s) everywhere, except the two authored beats: "Your rival appears
  not to have fallen yet." 0.14 s after "No I am not!", and "Then no." 0.08 s after Rival's "No." (checked again during
  a live counterfire chase, Rival moving throughout).
- **Pursuit banter** ("Hello!" to "That is a lot of things."): 13.7 s, Rival fleeing at about 7.5 m/s the whole time,
  the player 10 m behind; Fireball is introduced 2.9 s after it ends.
- **Bridge failure:** after a real fall, "The bridge grows longer when it senses failure" plays 1.6 s into the restored
  checkpoint, then "Hence why I crossed it!"; the second crossing is followed 0.56 s later by "Small gaps have never
  stopped anybody important."
- **Final approach and duel terms:** "This is not where your legend ends…", "A real knight never asks for help!", then
  all eight terms (18.5 s) while Rival stands ready 2 m away; the title ending follows the defeat as written.

Spacing problems the recorded durations cause (reported, not changed: they are the script's and the encounter's):

1. **Stamina (real, blocking).** From the SPRINT prompt to "Clearly." the voiced exchange takes 14.2 s (the takes alone
   are 12.0 s); a full bar is 10 s of sprint. The player runs out during "Sprinting typically consumes more energy",
   before the `sprint-sustained` gate and "Ah, hahaha! I can do this all day!". After that, holding Sprint as told
   never passes the gate: Sprint restarts at 25 stamina, 2.5 s of it ends at 0, and the gate wants 2.5 s ending with at
   least 10 left. The player has to stop until the bar is past about 35, and nothing tells them so. No cadence change
   fits 12 s of speech into 10 s of stamina; the choices are the gate (for example, remembering a sustained sprint made
   during the exchange) or where the exchange begins.
2. **The hit reaction waits behind a branch.** When Fireball hits bring Rival to 1 HP before the Fireball prompt, the
   constitution exchange (eight lines, 21 s) plays first, and "That was cold of you, ow!" follows 35 s after the
   first hit. This is the order of the dialogue, not its length; the branch could follow the hit's three-line reaction.
3. **The escape head start** is 20.3 s of recorded dialogue in which the player may only look (about 8 s of caption
   timing before). Rival is leashed and stays catchable (up to 74 m ahead).

## Discrepancy report (2026-10-12, against PR #157's recording plan at 9975864)

Sources: six Google Drive ZIPs and two loose takes (183 recordings since round 4; the four newest are staged, see
above). Every supplied file is a row of the manifest.

1. **Keys with a final take: 159 of 159.** The last two arrived on 2026-10-12: "Woah, it appears negotiations have gone
   hostile!" and "Aha! Try getting over this!".
2. **Still missing:** none.
3. **Takes not used:** the five alternates, dropped by the creator (2026-10-12): "Oh look, there's another…", "Aha!
   Took us long enough", the legend line without "your", the shorter "A sound argument", the second "My reputation…".
   The raw takes stay archived. The latest ZIP's "Try placating him" and "Haha! Took US long enough!" are the same files
   as the takes already used (byte-identical), listed as duplicates.
4. **Intended wording that differs from older script history:** "With your eyes.", "Perhaps his armor is better
   tailored than yours. What is his condition?", "My reputation will become dead if he remains ahead!", "Small gaps
   have never stopped anybody important." PR #157 captions all four this way.
5. **Ambiguous:** "No! Your sword has worked on me this time!" (Rival) and a Rival hurt grunt have no place in the
   script. The two "I do not get hints." takes were told apart by recording time. "Hence why I crossed it!" and
   "I give you permission to stop" are Rival's because PR #157 says so. Eleven general Spellblade lines are mastered
   but declared nowhere.
