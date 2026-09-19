# Swords & Sorcery

**Fast multiplayer sword-and-magic combat in your browser.**

Swords & Sorcery is a compact first-person arena game built around four immediately readable verbs: **swing, guard, cast, dash**. Matches take place in **The Shattered Keep**, a low-poly ruined fortress where corridors favor sword fighting, battlements reward spell pressure, and the abyss turns knockback into a weapon.

> Pre-alpha. The authoritative game/server layer is implemented and tested; the 3D browser client still needs a full visual two-player playtest before public submission.

## Core rules

- 2–8 players per room
- Free-for-all
- First to 10 kills wins
- Six-minute timer; ties enter sudden death
- 100 health
- Sword combo: 34 damage per hit at 0.40 / 1.10 / 1.80 seconds while attack is held
- Guard blocks frontal sword attacks; a well-timed Guard creates a 180 ms parry window
- Fireball ignores sword Guard and deals 28 direct damage with splash falloff
- Arcane Dash moves roughly 5 m and has a 5-second cooldown
- Three-second respawn with one second of spawn protection
- Knockback can turn falls into attributed abyss kills
- Swinging a sword into solid geometry cancels the attack, recoils the attacker, throws sparks, and produces a loud **CLANG**

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim |
| Left Mouse | Hold sword combo |
| Right Mouse | Guard / timed parry |
| Q | Fireball |
| E | Arcane Dash |
| Space | Jump |
| Tab | Hold scoreboard |
| F3 | Network/debug overlay |

## Architecture

The client feels immediate, but the server owns consequences.

```text
Browser client
  ├─ Three.js rendering
  ├─ first-person input
  ├─ local movement prediction
  ├─ remote-player interpolation
  └─ local effects / HUD / audio
             │
             │ WebSocket
             ▼
Authoritative Node server @ 30 Hz
  ├─ rooms and match lifecycle
  ├─ movement validation
  ├─ sword timing and hit resolution
  ├─ Guard / parry / stagger
  ├─ Fireball projectiles
  ├─ Dash cooldowns
  ├─ damage / death / respawn
  ├─ kill attribution
  └─ score / victory / rematch
             │
             ▼
Shared deterministic rules + Shattered Keep collision data
```

The server and client intentionally share map and movement rules. Players send **inputs**, not arbitrary damage or score outcomes.

## Repository layout

```text
client/                 Browser UI, Three.js runtime, effects and HUD
server/                 Native Node HTTP/WebSocket game server
shared/                 Deterministic combat, movement, map and collision rules
server/tests/           Room, networking, combat and history tests
docs/superpowers/       Approved design specification and implementation plan
docs/ideas/             Experimental mechanics that are not part of the base build
scripts/                 Dependency-free development checks
```

## Requirements

- Node.js 22 or newer
- A modern desktop browser with WebGL and Pointer Lock support
- Internet access in the browser for the current Three.js CDN import

There are currently **no runtime npm dependencies**. The server uses Node's built-in HTTP APIs plus a small WebSocket implementation in the repository.

## Run locally

```bash
git clone <your-repository-url>
cd swords-and-sorcery
npm run verify
npm start
```

Open:

```text
http://localhost:3001
```

For a quick multiplayer test, open two browser windows, use different player names, create a private room in one, and join its five-character room code in the other.

Environment variables:

```text
PORT=3001
HOST=0.0.0.0
```

`PORT` is normally supplied automatically by a production host.

## Verification

```bash
npm run check   # syntax-check every .mjs module
npm test        # deterministic + integration tests
npm run smoke   # launch on an ephemeral port and verify HTTP + WebSocket paths
npm run verify  # all three
```

The integration suite connects two real WebSocket clients and verifies that they can create/join a room and exchange authoritative combat state. Public-server hardening tests also cover oversized WebSocket payloads, message floods, and static-file path isolation.

## Docker

```bash
docker build -t swords-and-sorcery .
docker run --rm -p 3001:3001 swords-and-sorcery
```

Then visit `http://localhost:3001`.

## Public deployment

This project should be deployed as **one persistent Node service**, not GitHub Pages alone. GitHub Pages cannot run the authoritative WebSocket game server.

The repository includes a Render Blueprint configured as a **free web service** and set to deploy only after GitHub CI checks pass:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/CaptainFredric/swords-and-sorcery)

That deployment serves both the game client and `/ws` from the same HTTPS origin, so no cross-origin WebSocket setup is required. After the first successful deploy, use the resulting `https://...onrender.com` URL for browser and two-device testing, then put that verified URL into `site/config.js` so the GitHub Pages front door can enable its live Play button.

Render's free web service can spin down after idle time, so the first request after inactivity may incur a cold start. That is acceptable for pre-alpha testing; it is not the final performance target.

Blueprint settings are intentionally explicit:

- Docker runtime from the repository `Dockerfile`
- Free compute plan
- Health endpoint: `/health`
- `HOST=0.0.0.0`
- Auto-deploy only after CI checks pass
- Platform-provided `PORT`
- Persistent WebSocket support supplied by the web-service host

## Current status

Implemented:

- private rooms + Quick Play
- reconnect grace period
- authoritative 30 Hz simulation
- sword / Guard / parry / Guard Break
- Fireball + splash
- Arcane Dash
- death / respawn / score / rematch
- latency-aware melee transform history
- spawn selection
- shared collision geometry for The Shattered Keep
- first-person weapon view
- remote Spellblade rigs
- HUD, kill feed, scoreboard and debug overlay
- wall-sword collision with recoil / CLANG presentation
- automated deterministic and WebSocket integration tests
- 64 KiB inbound WebSocket message cap and high-rate message flood protection
- static-file allowlisting so server/config files are not web-accessible
- deploy smoke test for health, assets and WebSocket handshake

Still requiring hands-on verification/tuning:

- full browser render/playtest on a normal unrestricted development machine
- two-device internet playtest
- movement/camera feel tuning
- spawn fairness under several human players
- Fireball readability and speed tuning
- sword animation / hit-feedback tuning
- Guard/parry timing feel under real latency

See [`docs/CODEX_HANDOFF.md`](docs/CODEX_HANDOFF.md) for the next engineering pass and [`docs/PLAYTEST.md`](docs/PLAYTEST.md) for the human playtest sequence.

Highest-priority remaining work is browser/human verification rather than feature expansion: verify the Three.js client in a normal browser, tune movement/combat feel with two real players, validate several-player spawn fairness, then deploy and run a two-device internet match. Experimental classes and sorcery variants should stay behind that baseline.

## Design docs

- [`Swords & Sorcery design specification`](docs/superpowers/specs/2026-09-18-swords-and-sorcery-design.md)
- [`Core implementation plan`](docs/superpowers/plans/2026-09-18-swords-and-sorcery-core.md)
- [`Experimental sorcery variants`](docs/ideas/experimental-sorcery-variants.md)

## License

No license has been selected yet. Until one is added, the repository is source-visible but should not be assumed to grant reuse rights.
