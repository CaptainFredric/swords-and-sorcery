# Spellblade voice recording packet — November 11, 2026

**Status:** The declarations and Credits metadata are committed in this draft. **The four recordings are not yet committed as playable takes.** Do not merge or describe this as live voice until the normal ingest pipeline has run and the resulting `.m4a` and `.wav` files and updated manifest are committed.

The creator's recording bundle contains:

| Source MP3 | Seconds | Declared line | Usage |
| --- | ---: | --- | --- |
| `laughexertion_1.mp3` | 1.33 | `hummedExertion` | One nonverbal triple rising hummed laugh, occasionally with heavy sword effort |
| `Exertioncoughorhurt.mp3` | 1.23 | `coughGrowlExertion` | One nonverbal cough followed by sustained `hrrr`, occasionally after injury |
| `HahaGoodLuckForgrtting.mp3` | 3.06 | `goodLuckForgettingMe` | Shorter alternate performance |
| `HahaGoodLuckForgettingMeLongerMeee.mp3` | 3.68 | `goodLuckForgettingMe` | Longer alternate performance |

Descript transcribed the shorter spoken take as “Ha ha. Good luck forgetting me” on November 11, 2026; the declared subtitle preserves those words with expressive punctuation. The longer variant has not been independently transcribed and must be auditioned before acceptance. Two takes of the same sentence must remain one voice declaration. Do not generate new dialogue with TTS or invent extra words.

## Ingest with Castleward's existing audio system

The user-supplied companion installation bundle contains the original four MP3s and an idempotent installer script.

Run it against this **draft** checkout:

```sh
node /path/to/extracted-voice-packet/install_castleward_voice.mjs /path/to/swords-and-sorcery
```

The installer invokes the repository's established `npm run voice -- --line ...` three times, preserves source takes, produces AAC+WAV processed assets, updates `client/assets/voice/manifest.json` and `tools/audio/voice-sources.json`, then checks voice declarations and Credits integration.

Before committing, audition each new processed take, compare its dynamics with existing Spellblade voice, and check no soft syllable/word ending was over-gated by the helm processing.

Verify in real browser:
- `hummedExertion` and `coughGrowlExertion` produce no subtitle; do not interrupt spoken lines.
- `goodLuckForgettingMe` uses both alternate takes and the correct subtitle.
- All three appear under their intended Credits library shelves, with playable take previews.
- No existing recordings, manifest entries, voice cooldowns, or triggers were removed.

Keep this PR as DRAFT. Do not merge or deploy.
