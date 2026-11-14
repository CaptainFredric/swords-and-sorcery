# Recordings

Each row is one run of `scripts/swordsmanship-capture-browser.mjs`: a real game server, headless Chrome with the GPU, real mouse, key and touch events. `before-*` runs are `main`; the rest are this branch. `phone` runs are a landscape phone emulated in desktop Chrome, not a real phone. `remote` runs are two browsers in one Shared Practice room on the server: the second browser's view is what is recorded, and the events listed are the ones it received.

Videos (`<label>.webm`, `<label>-quarter-speed.webm`) and each run's `timeline.json` are on branch `evidence/swordsmanship-techniques-20261112` under `docs/verification/sword-techniques/recordings/`. Frame counts are read from the files (`scripts/webm-frames.py`). "fps rendered" is the game's own frame rate during the run; the file's figure is what the in-page encoder kept, and where it shows a long gap the encoder stalled, not the game. In the Practice yard the meter is refilled every tick, so the Prowess after each paid turn reads 75 there; the 100 → 75 → 50 → 25 → 0 ladder in a match is in `server/tests/sword-technique.test.mjs`.

| Run | Frame rate | Third-person clips played | What happened |
| --- | --- | --- | --- |
| `before-desktop-slash-tap` | 60.1 fps rendered; file: before-desktop-slash-tap.webm: 164 frames over 2.76s = 59.4 fps, worst gap 33 ms | Idle → Slash_1 → Idle | damage 24 (sword) |
| `after-desktop-slash-tap` | 60.1 fps rendered; file: after-desktop-slash-tap.webm: 164 frames over 2.77s = 59.1 fps, worst gap 38 ms | Idle → Slash_1 → Idle | damage 24 (sword) |
| `before-desktop-slash-chain` | 60.1 fps rendered; file: before-desktop-slash-chain.webm: 292 frames over 4.89s = 59.7 fps, worst gap 37 ms | Idle → Slash_1 → Slash_2 → Slash_3 → Idle → Slash_2 → Idle | damage 24 (sword), 20 (sword), 19 (sword) |
| `after-desktop-slash-chain` | 60 fps rendered; file: after-desktop-slash-chain.webm: 289 frames over 4.89s = 59.1 fps, worst gap 47 ms | Idle → Slash_1 → Slash_2 → Slash_3 → Idle → Slash_2 → Idle | damage 24 (sword), 20 (sword), 19 (sword) |
| `before-phone-slash-tap` | 60.1 fps rendered; file: before-phone-slash-tap.webm: 171 frames over 2.86s = 59.8 fps, worst gap 35 ms | (not sampled in this view) | damage 24 (sword) |
| `after-phone-slash-tap` | 60 fps rendered; file: after-phone-slash-tap.webm: 169 frames over 2.87s = 59.0 fps, worst gap 35 ms | (not sampled in this view) | damage 24 (sword) |
| `before-remote-slash-chain` | 60.2 fps rendered; file: before-remote-slash-chain.webm: 269 frames over 4.90s = 54.9 fps, worst gap 445 ms | (not sampled in this view) | second client received: attackEnded 1, attackStarted 1, swordMiss 4, swordSwing 4 |
| `after-remote-slash-chain` | 59.7 fps rendered; file: after-remote-slash-chain.webm: 272 frames over 4.89s = 55.6 fps, worst gap 331 ms | (not sampled in this view) | second client received: attackEnded 1, attackStarted 1, swordMiss 4, swordSwing 4 |
