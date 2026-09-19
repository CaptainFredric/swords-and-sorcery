# Swords & Sorcery

**Fast sword-and-magic arena combat in your browser.**

Swords & Sorcery is a compact first-person fantasy arena game built around four readable verbs: **swing, guard, cast, dash**. The default arena is **Castleward**, a grassy medieval hill-town built around a market green, village lanes, chapel meadow, roads, walls, and an old castle bailey. The older **Shattered Keep** remains available as a regression/debug world.

> Pre-alpha. Multiplayer, solo modes, authoritative combat, Castleward, and the browser client are live and under active visual/gamefeel tuning.

## Play

Public build: **https://swords-and-sorcery.onrender.com**

The front door offers:

- **Quick Match** — public 2–8 player free-for-all.
- **Fight Bot** — one-player duel against a server-controlled Spellblade using the same combat authority as PvP.
- **Practice Yard** — untimed one-player training with reset controls and Passive / Guarding / Fights Back dummies.
- **Private Match** — create a five-character room code or join a friend's room.

The Render free tier may cold start after inactivity. The first load can therefore take longer than later loads.

## Core rules

- Free-for-all and Bot Duel: first to 10 kills, six-minute timer, sudden death on a tie.
- 100 health; regeneration begins after roughly five seconds without damage.
- Sword combo: 34 damage per committed hit at 0.40 / 1.10 / 1.80 seconds while attack is held.
- Guard blocks frontal sword attacks; raising Guard inside the 180 ms timing window can Parry and stagger the attacker.
- Fireball ignores sword Guard, deals 28 direct damage, and has splash falloff.
- Arcane Dash moves roughly 5 m and has a five-second cooldown; it gives no invulnerability.
- Respawn takes three seconds and grants one second of spawn protection.
- Sword strikes test world geometry before enemy hits. Hitting solid geometry cancels the strike and produces recoil, sparks, and **CLANG** feedback.

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
| Esc | Release pointer lock / access Practice controls |

## World structure

### Castleward — default

Castleward is designed as a compact arena rather than an open world. Its main combat regions are:

- Town Green / market — readable central crossing space.
- Castle Gate & Bailey — elevation, stairs, walls, and tighter sword fighting.
- West Village Lane — houses, fences, short cover, and bends.
- East Meadow / Ruined Chapel — longer Fireball sightlines and mild elevation.
- South Road / Outer Gate — broader approach connecting both sides.

The gameplay geometry is shared with the authoritative server. Client-side medieval decoration is deliberately bounded for ordinary student laptops.

### Shattered Keep — regression world

The original ruined-fortress arena remains in the world registry for regression tests and development. New public, private, Bot Duel, and Practice rooms default to Castleward.

## Modes and authority

The browser sends inputs and requested actions; the server owns outcomes.

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
  ├─ FFA / Bot Duel / Practice room policies
  ├─ Castleward or explicit alternate world selection
  ├─ movement validation
  ├─ sword timing and hit resolution
  ├─ Guard / parry / stagger
  ├─ Fireball projectiles
  ├─ Dash cooldowns
  ├─ damage / death / respawn
  ├─ bots and training actors issuing normal combat intentions
  └─ score / victory / reconnect / rematch
             │
             ▼
Shared deterministic movement, combat, world and collision rules
```

Bots and Practice dummies do **not** have a private damage API. Their controller selects movement/combat intentions, and the same authoritative sword, Guard, projectile, cooldown, damage, death, and respawn systems resolve the result.

## Repository layout

```text
client/                 Browser UI, menu scene, Three.js runtime, worlds, effects and HUD
server/                 Native Node HTTP/WebSocket authoritative game server
shared/                 Deterministic movement, modes, worlds and collision rules
server/tests/           Room, networking, combat, deployment and structural regressions
docs/superpowers/       Approved design specifications and implementation plans
docs/ideas/             Experimental mechanics outside the base build
scripts/                 Dependency-light verification and smoke checks
site/                    GitHub Pages front door
```

## Requirements

- Node.js 22 or newer
- A modern desktop browser with WebGL and Pointer Lock support
- Internet access in the browser for the current Three.js CDN import

There are currently no runtime npm package dependencies. The server uses Node's built-in HTTP APIs plus the WebSocket implementation in this repository.

## Run locally

```bash
git clone https://github.com/CaptainFredric/swords-and-sorcery.git
cd swords-and-sorcery
npm run verify
npm start
```

Open:

```text
http://localhost:3001
```

For a one-browser test, choose **Solo → Fight Bot** or **Practice Yard**. A second tab/device is needed only when you explicitly want to test multiplayer.

For a private multiplayer test, create a private room in one browser and join its five-character code from another.

Environment variables:

```text
PORT=3001
HOST=0.0.0.0
```

`PORT` is normally supplied by the production host.

## Verification

```bash
npm run check   # syntax-check every .mjs module
npm test        # deterministic + integration + structural tests
npm run smoke   # launch an ephemeral server and verify the shipped shell, assets, health and WebSocket path
npm run verify  # all three
```

Coverage includes real WebSocket clients for multiplayer and one-tab solo flows, reconnect behavior, world/mode identity, bot/dummy authority, cooldown/combat rules, path isolation, oversized messages, flood protection, Castleward route contracts, and the shipped menu shell.

## Docker

```bash
docker build -t swords-and-sorcery .
docker run --rm -p 3001:3001 swords-and-sorcery
```

Then visit `http://localhost:3001`.

## Public deployment

The playable game is one Node web service because the same process serves both browser assets and the authoritative `/ws` WebSocket endpoint. GitHub Pages is only the static front door.

The repository includes a Render Blueprint configured as a **free web service** and set to auto-deploy after GitHub CI checks pass:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/CaptainFredric/swords-and-sorcery)

Current verified public target:

```text
https://swords-and-sorcery.onrender.com
```

Render's free web service can spin down while idle, so the first request may incur a **cold start**. Development/public verification is intentionally batched so normal CI does most validation without repeatedly waking the free service.

Blueprint settings:

- Docker runtime from the repository `Dockerfile`
- Free compute plan
- Health endpoint: `/health`
- `HOST=0.0.0.0`
- Auto-deploy after checks pass
- Platform-provided `PORT`
- Persistent WebSocket support from the web-service host

## Current status

Implemented:

- Quick Match and private rooms
- Fight Bot and untimed Practice Yard without a second browser
- Passive, Guarding, and Fights Back Practice dummies
- reconnect grace and solo-session resume
- authoritative 30 Hz combat simulation
- server-owned Bot Duel AI issuing normal player intentions
- Castleward authoritative geometry + deterministic medieval renderer
- Shattered Keep retained as a regression world
- sword combo / Guard / Parry / Guard Break
- Fireball / splash / Arcane Dash
- death / respawn / scoring / sudden death / rematch
- latency-aware melee transform history
- first-person Spellblade weapon/off-hand view
- remote Spellblade rig and combat states
- character-centered menu scene and distinct solo/multiplayer/private routes
- HUD, kill feed, scoreboard and debug overlay
- sword/world collision recoil and CLANG feedback
- automated deterministic, real-WebSocket, structural, deployment and smoke tests
- inbound WebSocket size/rate hardening and static-file allowlisting

Current base-game tuning priorities:

- first-person Guard, sword-combo, and Fireball animation readability
- Castleward collision/visual honesty and terrain presentation
- bot navigation/obstacle recovery before adding difficulty levels
- Practice-tool screen-space behavior
- menu layout/copy simplification
- movement/camera/combat feel under real human latency
- several-player spawn fairness and two-device internet testing

Deferred until the base is stable: classes, experimental ability variants, progression/economy, elaborate injury reactions, third-person switching, cosmetic systems, and menu/music production.

## Design docs

- [`Swords & Sorcery design specification`](docs/superpowers/specs/2026-09-18-swords-and-sorcery-design.md)
- [`Core implementation plan`](docs/superpowers/plans/2026-09-18-swords-and-sorcery-core.md)
- [`Solo / world / menu architecture`](docs/superpowers/specs/2026-09-18-solo-world-menu-design.md)
- [`Solo / world / menu implementation plan`](docs/superpowers/plans/2026-09-18-solo-world-menu-implementation.md)
- [`Experimental sorcery variants`](docs/ideas/experimental-sorcery-variants.md)

## License

No license has been selected yet. Until one is added, the repository is source-visible but should not be assumed to grant reuse rights.
