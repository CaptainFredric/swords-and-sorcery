# Tutorial 1 validation evidence

These captures document development testing. They are not promotional screenshots promising recorded tutorial voices.

| File | Evidence |
| --- | --- |
| browser-run.json | Complete ordinary rendered route, real contacts, one checkpoint retry and frame distribution. |
| browser-input-driver.js | Reproducible developer input driver; uses real InputController commands and ordinary simulation. |
| bridge-progression.png | Actual continuous route at the bridge; captured before the isolated corpse timestamp correction. |
| final-confrontation.png | Actual final exchange during responsive combat. |
| settled-corpse.png | Actual retained corpse after completion on the corrected animation clock. |
| corpse-regression.json | Actual authored Death clip sampled at its 1.2 second settled end, still visible over 170 seconds after death. |
| touch-look.png | Actual compact touch entry and device specific LOOK instruction at 667 × 375. |
| touch-early-feedback.png | Early touch Fireball rejection while Rival remains healthy. |
| html5-iframe.png | Exported HTML5 assets and local tutorial rendering inside a sandboxed local iframe. Physical Pointer Lock remains pending. |
| destination-preview.png | Static production world renderer preview of the complaint destination, not a live combat screenshot. |

## Reproduce the real input run

1. Run `PORT=3167 npm start` and open `http://127.0.0.1:3167/?debug`.
2. Enter Solo, then Tutorial. The debug destination deliberately bypasses the first visit offer.
3. Evaluate the expression in `browser-input-driver.js` in the page's developer console. The driver performs movement, aim, Guard, sword, Fireball and Dash without manufacturing facts, hits, health, cooldowns or completion.
4. Inspect `window.__tutorialPlaytest` for progression, combat events and animation frame samples. Call its `stop()` method to restore ordinary movement input before manually playing.

The driver is practiced scripted play rather than an unfamiliar human test. It sometimes dies to ordinary combat and uses the session's real checkpoint recovery. Caption acknowledgements use readable rehearsal intervals. Runtime video capture can influence frame timing.

A separate final checkpoint replay uses the normal session `retry()` path followed by the same driver; no lethal event is injected in the browser evidence. The combat test suite separately exercises direct damage fixtures.
