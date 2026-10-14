# October 14 release evidence

## Scope

Branch `release/public-presentation` was created from current main `3e4c3687d4acdc79ba8bdcab9eb3072c3c4ba516`. The parallel character reconstruction and Claude workspace were preserved. This pass changes documentation and promotional media. Runtime code, combat balance, models, animations and recordings remain the identified main build.

## Saved itch.io state

The existing project at https://captainfredric.itch.io/swords-and-sorcery remains private Draft.

The playable browser upload is the current main archive, displayed as 32 MB in the editor. The prior upload was missing Tutorial in Solo. The uploaded archive has 878 files, 31.55 MiB compressed, 39.22 MiB extracted and SHA256 `b346dd2a34b569ed82fc08ec916a5cf10ec7fd5e1298cc49c9038035a0133eea`.

The saved tagline and description were checked after navigation to a fresh editor and page. The description leads with first person multiplayer, room codes, optional voiced Tutorial and local Solo. The five curated images are embedded in the body. Fireball, sword/Guard and Tutorial are visible immediately; live Castleward menu and Armory are expandable. The native screenshot sidebar is Hidden, confirmed after reload. Previous uploaded images are retained for recovery.

The saved theme uses charcoal, warm cream and brass. The initial action illustration was saved as the banner. A further creator requested edit now shows the Fireball leaving the open palm, with a detached core and a short trailing flame; its upload is pending browser access. The launcher background and cover use actual current Fireball imagery. The helmet portrait remains the avatar. Optional support remains a compact Buy Me a Coffee link. No Ko fi destination was supplied.

## Actual uploaded client checks

| Check | Observed result |
| :--- | :--- |
| Initial browser launch | Loaded the current client and first run tutorial invitation. |
| WebGL | Greener Pastures rendered with scenery, HUD and the current opening equipment state. |
| Voiced tutorial | Opening advanced naturally through recorded dialogue to the LOOK prompt; Chrome reported audio playing. Audio quality was not independently judged. |
| Pointer Lock | Native click in the arena produced Chrome's pointer capture notice. Escape released capture. |
| Tutorial exit | Return to Solo opened the current Solo menu with Tutorial, Bot Duel, Practice and Inspection. |
| Multiplayer availability | Main menu reported Multiplayer online. |
| Server connectivity | Private Match created room UUNB7 through the deployed server. The test client then returned to menu. |
| Page gallery | Actual current captures rendered in the body; the expandable Castleward and Armory section opened correctly. |
| Saved layout | Screenshots Hidden persisted after reload. |

Browser automation repeatedly lost its debugger connection. Native Chrome interaction completed the checks above. Sustained mouse look, a full tutorial run, combat input, two client private match/start/reconnection, fullscreen exit and physical mobile/touch remain unverified in this refreshed itch build. The attempted responsive override failed before applying; narrow page layout remains an explicit follow up.

Screenshots of the actual saved page and uploaded tutorial are retained locally in the chat's `output/release-proof-2026-10-14` directory. They are proof of the private page rather than public availability.

## Repository and archive verification

`npm run verify` completed successfully: 1366 repository tests, 4 HTML5 export tests, syntax checks and HTTP/assets/private path/health/WebSocket smoke. The first run exposed a README deployment documentation omission; the Render blueprint instructions were restored and the deployment tests passed before the successful full run.

`unzip -t dist/html5/swords-and-sorcery-html5.zip` passed. `git diff --check` passed. All 26 media byte counts and SHA256 values, six new image dimensions and the 479 character submission copy were checked. The full suite was repeated successfully on the final documentation tree. The archive identifies the runtime baseline rather than the later documentation commit, since this pass changes no exported runtime files.

The four new uploaded gameplay/UI originals were checked against local SHA256 values. `uploaded-media-map.json` records their destinations. `media-manifest.json` records dimensions, provenance and classifications.

## Media integrity

The action banner is AI assisted promotional illustration of CaptainFredric's original design. It is not a gameplay screenshot. The new cover combines native HTML typography with a real game frame.

The melee and Fireball captures use normal input and authoritative contacts in local Inspection Yard. Actor and camera positions were staged for framing. Existing freeze/step tools paused the real actions; inspection controls and the freeze notice were temporarily hidden. These images are labeled Practice captures rather than human multiplayer footage. Tutorial was captured through existing chapter replay. The existing live Castleward scene is explicitly identified as menu presentation.

## Remaining final actions

Public itch publication, merge/deployment and social posting remain separate creator decisions. LinkedIn and Handshake drafts and the 479 character submission description are in `PUBLIC_POSTS.md`.

The local trailer remains a review candidate. No hosted trailer destination is available, so an embed was not fabricated. Finish a two player itch match and physical touch check, then approve the saved page for publication. Character reconstruction can continue separately without delaying this documentation branch.
