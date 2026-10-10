# Castleward private release candidate

10 October 2026. Branch `polish/public-release-candidate`, based on main `ce2f6caa72d7b1bbb383f25ba804238198cf7964`. PRs 145, 146, 147 and 148 were confirmed merged before work began. The separate Claude workspace was preserved.

The updated client is uploaded successfully to the existing [private itch Draft](https://captainfredric.itch.io/swords-and-sorcery). It is marked playable in the browser. Visibility remains Draft and pricing remains No payments. Nothing was publicly published, merged or deployed.

## Changes that serve the release

The Credits support section now occupies 90 px instead of 159.2 px at 1180 × 613. Creator attribution stays first, the original invitation stays intact, and the external button retains a 44 px minimum height and keyboard focus. The optional note becomes “Optional support. The game stays free.” Ko fi was left out because its destination is unknown.

Scrolling expanded voice entries exposed an actual gap below the fixed Credits header. Removing the scroll body's top padding closes it; the opaque search bar now reaches the top edge of the scrolling area. Search, original recordings, triggers and historian annotations were preserved.

The merged Inspection test expected ordinary Practice to use the remote host after leaving Inspection. This conflicted with PR 148's intentional local solo routing. The assertion now verifies that ordinary Practice remains local and cannot use Inspection freeze controls. Networking implementation was unchanged.

Added a localhost tab recorder for future capture sessions. It records the real DOM HUD and game audio, requests no microphone, accepts only a browser tab and stops after 60 seconds. H.264 is preferred to reduce recording overhead; VP8 is the fallback. Device identifiers are omitted from its metadata. The tool is absent from the exported game.

## Actual interaction and release checks

Chrome on this Mac was used through ordinary menus, native keyboard controls and browser mouse input. Tests sampled the integrated game rather than rewriting animation or posing actors for footage.

| Check | Observed result |
| :--- | :--- |
| Living Castleward menu | Tour, gestures, subtitles and courtyard interactions ran. Their choreography and voice content were preserved. |
| Ordinary Practice | Native movement, Guard, sword input, Fireball, Dash, damage, death, respawn and Escape were exercised. Fights Back approached and attacked. |
| Bot Duel | Squire encounter started through the Solo menu. The bot engaged, damaged and defeated the player; match completion returned to the menu. This was a controls and behavior check, not a claimed winning demonstration. |
| Actual itch loading | The uploaded ZIP rendered the menu, knight, world, HUD and spell effects. Multiplayer became online. No new launch errors were observed. |
| itch native controls | Pointer Lock succeeded. Movement, Guard, sword input, Fireball, Dash and Escape were exercised. Fireball and Dash produced their actual cooldowns. |
| itch audio | Chrome reported audio playing after interaction; original voice subtitles appeared during combat. The final sound mix still needs the creator's listening review. |
| Cross-host multiplayer | The itch client and production GitHub Pages client joined room PXHY4 on Render and entered the same active match. Both clients left afterward. |
| Reload and storage | A clean itch reload recovered the active multiplayer session and saved name. An earlier reload with two itch game instances open showed an expired-session message. That conflicting-instance case remains a limitation. |
| Fullscreen exit | Native Escape exited fullscreen without losing the game. The renderer resized with the iframe. |
| Offline Practice | With the iframe's network emulated offline, Practice started, movement worked and Fireball started its cooldown. Network emulation was restored before leaving. This covers an already loaded client, not offline installation or a fresh uncached page. |
| itch landscape touch emulation | At 844 × 390, the actual iframe exposed the movement stick and combat buttons. Touch Guard raised the visible Guard pose, Fireball showed its real cooldown, Dash displaced the player and the movement stick moved through the courtyard. Sword input and the touch menu were exercised. This is browser emulation; physical phone performance remains pending. |
| Credits responsive fit | Desktop 1280 × 720, short landscape 844 × 390 and portrait 390 × 844 were inspected. Expanded entries remained scrollable. The portrait background menu had horizontal overflow; the Credits panel itself fit. Physical device testing remains pending. |

The initial itch editor request encountered a temporary Cloudflare rate limit. A later ordinary reload succeeded. Uploading the new ZIP then succeeded, so the preceding email upload restriction is no longer the current blocker.

## Build and verification

The private upload was built at application commit `0afc44de5e9c496ec3fd61c5e45223bf7decbdf1`.

| Artifact | Value |
| :--- | :--- |
| ZIP | `dist/html5/swords-and-sorcery-html5.zip` |
| Files | 510 |
| Archive bytes | 22,871,235 |
| Extracted bytes | 29,843,000 |
| SHA256 | `e58d86de26d00f9283e9039de0c2c0559ea8ab7357d35377edef5d3e1aca5ccc` |
| Gameplay server | `wss://swords-and-sorcery.onrender.com/ws` |
| Actual itch iframe | `https://html-classic.itch.zone/html/19667346/index.html` |

Focused Inspection and offline tests passed, 22 of 22. The full `npm run verify` completed successfully: syntax checks, all 1127 game tests, four HTML5 export tests and HTTP/WebSocket smoke. `npm run export:html5` and `unzip -t` passed. The new recorder passed `node --check`; the new video fully decoded with FFmpeg. No model or authored animation changed, so a Blender rebuild was unnecessary.

## Footage and editorial judgment

The original 26.84 second trailer is preserved byte for byte. It establishes the courtyard and ability identity well, but the long Vortex segment and disconnected demonstrations undersell the flow of a duel.

The [comparison board](media-comparison.html) now includes eight consecutive seconds from a genuine Fights Back encounter, with the real HUD and game audio. The opponent attacks and defeats the player. This is review footage, not a claim of a stronger finished trailer. The broader raw recordings remain local in `output/release/final-pass/`.

Native relative mouse dragging was ineffective under Pointer Lock through the computer control interface. Browser mouse input was used for aiming. For the final take, F was temporarily added as the ordinary secondary sword binding through Settings, then cleared again through the same UI. No transforms, health, hit windows, bot tuning, action timing or authoritative state were changed. The recorder and temporary observers were removed when their page closed.

The best next trailer capture is a continuous encounter: let a rival close, defend one readable strike, counter, reposition, cast at clear range, and earn a visible finish. The current captures do not establish that complete sequence. A creator operated capture would also avoid the observed relative mouse control limitation. Keep the current trailer available while obtaining that better take.

## Tutorial path for tomorrow

Use a separate scripted local encounter backed by the existing `LocalHost` and shared `Room` rules. `LocalHost` already delivers combat events before each snapshot; `GameRuntime.onEvents` consumes those events for presentation and voice. A small stage controller can observe ordinary hit, Guard and encounter outcomes, advance narrator/dialogue cues and choose the opponent's next ordinary input.

Keep the script and recordings separate from combat rules. Stages can cover approach, one ordinary attack, raising and lowering Guard, then the conversational surprise as another ordinary sword hit. Finally hand the same opponent to the normal bot controller for a real duel. Gate teaching stages on observed actions rather than fixed narration delays. The surprise inherits normal blocking, damage and interruption; it requires no new unblockable move. Implementation waits for the creator's script and recordings.

## Readiness and remaining decisions

The desktop private candidate is ready for creator review. The previous missing playable upload is resolved. Public launch still needs approval, physical phone testing and a check on another browser. Multiple game tabs, longer reconnect outages and a fresh uncached offline load remain outside the verified scope. Desktop emulation cannot establish real device compatibility.

Prioritize those compatibility checks and tomorrow's focused tutorial over more armor detail. The existing character identity, authored animations, voice content and balance are coherent enough for this pre alpha. A convincing combat trailer would strengthen the presentation, but it should not hide or delay evaluating the actual playable build.

Changed application files: `client/menu.css`, `client/index.html`, `client/network/inspection.test.mjs`.

Changed release files: `docs/release/README.md`, `docs/release/media-comparison.html`; added `docs/release/FINAL_PASS.md`, `docs/release/capture-tab-recorder.js`, `docs/release/final-pass-manifest.json`, and five media files named in that manifest. Gameplay, server, rig, model, animation, audio, voice director, music and tour source files stayed untouched.
