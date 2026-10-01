# The voice inbox

Drop a recording here, named after its line, and run `npm run voice`.

- The line must be declared in `client/game/sound/voiceLines.mjs` (its words, its moment, its rarity, its Credits copy).
- Name the file after the line's id (`lateLine.mp3`, `late-line-2.m4a`), or give the line a `file:` with the name you
  like (`file: 'GoingToBeLate.mp3'`), or use one of its aliases. Several takes of one line: number them.
- Any format macOS can read works: Voice Memos `.m4a`, QuickTime `.mov`, `.wav`, `.aiff`, `.mp3`.

`npm run voice` converts, trims, cleans, helms, levels and encodes each take into `client/assets/voice/`, moves the
recording to `artifacts/voice-sources/` (kept out of git), notes it in `tools/audio/voice-sources.json`, and checks
everything. Commit `client/assets/voice/` and `voice-sources.json`, and the line is in the game.

Nothing in this folder but this note is kept in git.
