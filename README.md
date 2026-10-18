# Swords & Sorcery

**Free first person multiplayer sword combat and sorcery in your browser.**

[Play now](https://captainfredric.github.io/swords-and-sorcery/) · [Report a problem](https://github.com/CaptainFredric/swords-and-sorcery/issues) · [Release preparation](docs/release/README.md)

Duel a friend with a room code, find an open match, or train alone. No game account or installation is required. Castleward combines physical sword contacts, Guard and parries, spells, Dash and ultimates with a voiced Spellblade whose understanding of honor remains flexible.

This is a playable pre alpha under active development.

## Choose a mode

| Mode | What you play |
| :--- | :--- |
| Seek a Duel | Match with another player, one on one |
| Open Rooms | Browse or raise a public match |
| Private Match | Create or join with a five character room code |
| Tutorial | Greener Pastures: an optional voiced introduction that becomes a feud, duel and pursuit |
| Bot Duel | Fight a Squire, Knight, Champion or the Spellblade |
| Practice Yard | Untimed training with configurable dummies |
| Inspection Yard | Local Practice with freeze, single step and consecutive frame playback |

Solo modes use the browser's local authoritative simulation, even while multiplayer is online. A remote server connection cannot take over an active local session. Multiplayer uses the authoritative Render server. Both hosts use the same shared combat, movement and collision rules at 30 Hz.

Initial browser assets still require connectivity. Multiplayer may need time to wake after inactivity; solo play does not wait for remote match hosting. Locally generated accomplishments remain distinct from server verified multiplayer Renown.

## Combat and character

Sword swings resolve physical contacts against players and the world. Guard can block frontal sword attacks; a timely raise can parry. Guard and Sprint share stamina. Spells and ultimates obey their own cooldown and activation rules.

The Armory offers Fireball, Frostfire, Gale Garner and Sheathe in Steel, plus Sunder All That Rusts, Blazing Vortex and Spells & Chivalry. Renown, challenges and heraldry support continuing play and visual customization.

Ordinary arena choices are Castleward and The Ruined Keep. Greener Pastures is a dedicated tutorial world. The tutorial uses ordinary game mechanics, recorded dialogue, captions, device aware prompts, checkpoints and restart controls. It is recommended, never mandatory.

## Default desktop controls

| Input | Action |
| :--- | :--- |
| WASD / arrows | Move |
| Mouse | Look and aim |
| Shift | Sprint |
| Space | Jump |
| C | Crouch |
| Left mouse | Sword attack / combo |
| Right mouse / G | Guard and timed parry |
| Q | Equipped spell or ward; ordinary cooldown gauntlet behavior is explained in How to Play |
| E | Dash |
| R | Charged ultimate |
| Tab | Scoreboard |
| Escape | Match options / release Pointer Lock |

Controls can be rebound in Settings. Touch controls are available; landscape is recommended. During active Chivalry, prepared spell selection chooses and attempts the cast immediately. Startup selection only preselects. See in game How to Play for current advanced controls and numeric tuning.

## Run locally

Requires Node.js 22 or newer and a modern WebGL browser. Desktop play uses Pointer Lock. The browser currently imports Three.js from its CDN. There are no runtime npm package dependencies.

```sh
git clone https://github.com/CaptainFredric/swords-and-sorcery.git
cd swords-and-sorcery
npm run verify
npm start
```

Open `http://localhost:3001`. Choose Solo for a one browser test. To exercise multiplayer, create a private room and join its code from a second browser.

`PORT` defaults to 3001. `HOST` can be set explicitly. Production uses the host supplied port.

## Castleward: next 3D models

The [Castleward 3D asset roadmap](docs/art/castleward-3d-asset-roadmap.md) tracks upcoming **authored models** and the difference between source candidates, review exports and assets actually integrated into the game.

| Priority | Model | Production status / next work |
| :--- | :--- | :--- |
| Existing candidate | **Spellblade armored-fist battering ram** | Already modeled, with an external Argon animation-ready revision reported; **review and integrate**, not redesign from scratch. Independent forward-fired fist. |
| Finish first | **Standby / Travel Tent** | Existing source concept; verify actual doorway, interior and signage (`STANDBY, SPELLBLADE` / `ENTER` at entry; `EXIT` on destination doorway). |
| Next | **Wardstone / Renown Dispenser** | Build an in-world ceremonial reward apparatus. |
| Next | **Outer Gate / gatehouse objective set** | Construct a believable gate with readable stage-transition/breach states and matching collision. |
| Next | **Bi-Bye-llista** (*Two-Bolt Ballista*) | A tiny enchanted conditioning bolt fires immediately **while the enormous finisher makes its final draw**, then the heavy bolt fires almost at once. Marketed with complete sincerity as a weapon that “fires TWO shots instead of one.” |
| Supporting | **Siege ladders, barricade/cover modules, supply wagon, training-yard target props, heraldic notice board, objective standards, camp dressing kit and reinforcement tent** | Additional authored siege/camp props; distinguish these from already working Practice and heraldic game systems. |

These are **production intentions, not a claim that the assets are already in this repository or shipped**. Model briefs, technical constraints, and acceptance checklist: [full asset roadmap](docs/art/castleward-3d-asset-roadmap.md).

**Worldbuilding and future animated gags:** [Renown hoarding, the Rightful Renowner, and its two judgment scenes](docs/ideas/renown-renowner-worldbuilding.md). These are creative concepts, not new gameplay requirements.

## Project structure

```text
client/     Browser UI, Three.js rendering, audio, tutorial and local host
shared/     Shared simulation, movement, combat, worlds and collision
server/     Node HTTP/WebSocket multiplayer host and tests
scripts/    Syntax, smoke and HTML5 export verification
kit/        Authored character sources and asset production tools
docs/       Design, evidence, release preparation and media provenance
```

Bots and dummies issue ordinary movement and combat intentions. The simulation resolves damage, Guard, projectiles, cooldowns, death and respawn. Their controllers have no separate damage model.

## Verification and HTML5 export

```sh
npm run check         # JavaScript syntax
npm test              # Simulation, network, client and presentation tests
npm run test:html5    # Archive configuration, dependency coverage and limits
npm run smoke         # HTTP, assets, health and WebSocket smoke
npm run verify        # All of the above
npm run export:html5  # Build dist/html5/swords-and-sorcery-html5.zip
```

The static HTML5 export contains the same client and shared rules, with a secure WebSocket destination. `release.json` and the export report identify the source commit and archive checksum. See [release preparation](docs/release/README.md) for the actual itch.io status and browser checks.

## Deployment

GitHub Pages serves the **playable client**, not merely a landing page. Render serves the multiplayer WebSocket endpoint and an alternate playable client:

1. [GitHub Pages](https://captainfredric.github.io/swords-and-sorcery/)
2. [Render](https://swords-and-sorcery.onrender.com/)

The repository includes a Render Blueprint for a free web service with Docker, `/health`, and deployment after CI passes. [Deploy a copy to Render](https://render.com/deploy?repo=https://github.com/CaptainFredric/swords-and-sorcery). An idle free service can incur a cold start.

The itch.io project is being prepared separately. Its saved build, page and publication status are recorded in the release documentation. Local validation does not establish compatibility with every embedded browser or physical phone.

## Authorship and voice

CaptainFredric created the character concepts, game design, combat rules and dialogue, and performs the Spellblade's voice. AI tools assist implementation, debugging, networking, testing, visual development and Blender tooling under creator direction.

Ordinary voice definitions live in `client/game/sound/voiceLines.mjs`; tutorial recordings have separate stable authored keys and role processing. [Recording instructions](tools/audio/RECORDING.md) describe ingestion. Promotional illustrations, staged model renders and actual gameplay captures are distinguished in the [media manifest](docs/release/media-manifest.json).

## License

No license has been selected. The repository is source visible; it does not currently grant general reuse rights.
