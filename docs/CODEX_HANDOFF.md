# Codex / Astra Handoff

## Mission

Turn the existing Swords & Sorcery pre-alpha into a browser-verified, remotely playable Handshake submission **without replacing working architecture merely because another framework is familiar**.

Read these first:

1. `docs/superpowers/specs/2026-09-18-swords-and-sorcery-design.md`
2. `docs/superpowers/plans/2026-09-18-swords-and-sorcery-core.md`
3. `README.md`

## Preserve these invariants

- The server is authoritative for health, damage, cooldowns, deaths, scores, match state and combat legality.
- Players send inputs, not trusted outcome/position claims.
- The base Spellblade remains Sword + Guard/Parry + Fireball + Dash until the base combat loop has been human-playtested.
- Held sword attacks land at approximately 0.40 / 1.10 / 1.80 seconds and deal 34 damage per strike.
- Sword hitting solid world geometry stops the attack, applies recoil and emits the CLANG/sparks event.
- The Shattered Keep is intentionally compact and supports different combat ranges.
- Do not add progression, accounts, shops, loot or additional classes before the core loop is proven fun.

## First commands

```bash
npm run verify
npm start
```

Open two browser contexts against `http://localhost:3001` and create/join the same room.

## Phase 1 — browser correctness

Verify these in an actual browser before redesigning anything:

1. Main menu renders correctly and Three.js loads.
2. Two browser clients can create and join the same room.
3. Countdown transitions both into the same match.
4. Pointer lock, mouse aim, WASD and jump work.
5. Each client sees the other player's movement smoothly.
6. Sword damage resolves at the intended timing.
7. Sword-wall contact visibly stops the swing and produces recoil, sparks and a loud clang.
8. Guard blocks frontal sword hits.
9. Timed Guard produces an obvious parry and attacker stagger.
10. Fireball launches, moves, impacts and damages authoritatively.
11. Dash predicts immediately and reconciles cleanly.
12. Death, kill attribution, respawn, first-to-10 and rematch work.
13. F3 exposes useful FPS/ping/tick/prediction diagnostics.
14. Reconnecting within the grace window restores the same player.

Fix runtime correctness before adding features.

## Phase 2 — feel pass

Tune using actual two-player play, not static inspection:

- movement acceleration and stopping
- mouse sensitivity
- sword swing readability / apparent contact frame
- hit pause / recoil / camera kick
- Guard/parry audiovisual distinction
- Fireball projectile speed and visibility
- Dash distance / FOV pulse
- remote animation readability
- spawn sightlines
- bridge/battlement knockback danger
- time between respawn and re-engagement

The decisive metric is whether players voluntarily choose **Play Again**.

## Phase 3 — presentation pass

Improve only after the combat loop works:

- low-poly Spellblade silhouette
- material/lighting consistency
- Arcane Spire landmark composition
- projectile/impact particles
- death presentation
- menu/lobby polish
- audio mix
- responsive menu layout

Do not replace the game UI with a generic dashboard/card aesthetic.

## Phase 4 — deployment

Deploy the repository to a host that supports persistent Node WebSockets. The server already serves both frontend and `/ws`, so prefer one deployment.

Validate from two physically separate devices/networks:

- create room
- share invite URL
- join
- complete match
- rematch
- reconnect once

Only then treat the Handshake URL as submission-ready.

## Package decisions Astra may reconsider

The current environment could not reach the npm registry. In a normal Codex environment, it is reasonable to evaluate:

- vendoring/installing Three.js instead of CDN-only delivery
- Playwright browser smoke tests
- a bundler such as Vite if it materially improves deployment/debugging
- Docker/host-specific deployment automation

Do **not** rewrite the custom WebSocket/server model solely to introduce Socket.IO or React. Change infrastructure only when it fixes a measured problem or materially improves maintainability.
