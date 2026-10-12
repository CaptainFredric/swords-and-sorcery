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
| Change Rival's pitch or formants | `roles.rival.presets.creator-2026-10-12` in `tools/audio/tutorial-voice-chains.json` (`pitch.semitones`, `formants`) | `python3 tools/audio/tutorial_voice.py --speaker rival` |
| Change how much helm the Spellblade has | `helm.amount` in his preset (1 the established knight; it scales the helm's ring, reflections and grit together) | `--speaker spellblade` |
| Revert a character's treatment | its `use`: the earlier presets are kept by name (`pilot-2026-10-12`) | `--speaker <name>` |
| Change one take only | its row in `tools/audio/tutorial-voice-sources.json`: `chain` (a preset of its own, `pitchEngine`, `gainDb`) or `repairs`, each with `why` | `python3 tools/audio/tutorial_voice.py <key>` |
| Check the sources | | `--check` |

## The characters

| Character | Treatment (preset in use) |
| --- | --- |
| Spellblade | **The established helm** (`established-helm`), the chain of every combat line: gentle room removal, pauses gated, two semitones down with every vowel kept, chest, presence, the helm's ring, reflections and grit, 3:1. Quiet lines get exactly the same helm as shouts. The pitch moves by the established phase vocoder; a take it cannot follow (over 8% of voiced frames a semitone off) moves by PSOLA or Rubber Band instead, under the same helm. |
| Rival | **Formants 6% down, pitch 1.5 semitones down** (`creator-2026-10-12`). PSOLA moves the whole contour together, every rise and fall of it, then the formants are warped. Body and chest in the EQ, the rasp eased, a light helm, no grit. |
| Narrator | **Cleanup only** (`cleanup`): rumble and the room's boom eased, a gentle 2:1, sibilance tamed only where it stands out. No pitch, no formants, no helm. "Jump." uses `direct`: no compression, so it stays abrupt. |

Measured over all their takes, the Spellblade's long-term spectrum is within 1.3 dB RMS of the 142 combat lines (the
first tutorial pass was 2.5 dB off, missing up to 6 dB of the helm's 5–10 kHz edge). Rival and the Narrator are 5.9 and
6.4 dB from it. Rival's pitch moved 1.36–1.45 semitones down at the median on every line checked. His intonation
range is unchanged ("If you lose, you lie on the ground…": 12.8 → 12.7 semitones).

Levels: the knights around −16.8 LUFS (the combat lines' level), the Narrator around −19.5. Each take keeps half of
its own difference from its character's usual delivery (at most 2.5 dB either way), so a shout stays louder than a
mutter. True peaks stay under −1.5 dBFS.

## Per-take exceptions and repairs

| Take | Exception | Why |
| --- | --- | --- |
| "Ah..." | `mend` 0.665–0.825 s | The voice breaks mid-"Ah..." (a creak with an octave-up flicker). Every pitch change made it a stray note. That stretch is resynthesized (WORLD) from the steady "Ah" on either side; the onset and decay are untouched. |
| "There was an extra." | `release` +80 ms | The recorder stopped while the last syllable was still releasing. Its breath continues 80 ms, falling 30 dB, from the release's own spectrum: no stretched vowel, no loop. |
| "Jump." | preset `direct`, +1 dB | Terse on purpose. |

The pitch engine is chosen automatically, per take, by the contour check. 12 Spellblade takes use PSOLA and 1 uses
Rubber Band ("I do not get hints." in the jump scene), all under the same helm. One Rival take uses Rubber Band
("That was not part of the terms").

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

Sources: five Google Drive ZIPs and two loose takes (181 files). Every supplied file is a row of the manifest.

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
