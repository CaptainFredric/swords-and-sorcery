# October 14 release evidence

## Scope

Branch `release/public-presentation` was created from current main `3e4c3687d4acdc79ba8bdcab9eb3072c3c4ba516`. The parallel character reconstruction and Claude workspace were preserved. This pass changes documentation and promotional media. Runtime code, combat balance, models, animations and recordings remain the identified main build.

## Saved itch.io state

The existing project at https://captainfredric.itch.io/swords-and-sorcery remains private Draft.

The playable browser upload is the current main archive, displayed as 32 MB in the editor. The prior upload was missing Tutorial in Solo. The uploaded archive has 878 files, 31.55 MiB compressed, 39.22 MiB extracted and SHA256 `b346dd2a34b569ed82fc08ec916a5cf10ec7fd5e1298cc49c9038035a0133eea`.

The saved tagline and description were checked after navigation to a fresh editor and page. The description leads with first person multiplayer, room codes, optional voiced Tutorial and local Solo. The five curated images are embedded in the body. Fireball, sword/Guard and Tutorial are visible immediately; live Castleward menu and Armory are expandable. The native screenshot sidebar is Hidden, confirmed after reload. Previous uploaded images are retained for recovery.

The saved theme uses charcoal, warm cream and brass. The revised action banner shows the Fireball leaving the open palm, with a detached core and a short trailing flame. Its new uploaded URL and 2172 by 724 dimensions were confirmed after save and reload. The launcher background and cover use actual current Fireball imagery. The helmet portrait remains the avatar. Optional support remains a compact Buy Me a Coffee link. No Ko fi destination was supplied.

The existing Mobile friendly option was disabled. It is now enabled and saved. This is an itch.io frame configuration change, not a new game input system. Click to launch in fullscreen remains the launch setting.

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
| Two client match | Two copies of the uploaded itch build joined room TRVG7 as Release Host and Release Guest, then entered the same active Castleward match. Incoming server snapshots confirmed two distinct player IDs. |
| Reconnection | Reloading the guest iframe resumed the same active room. Subsequent authoritative snapshots preserved both player IDs. |
| Landscape touch | Chrome touch emulation at 844 by 390 loaded Practice. Actual emulated finger events exercised movement and look together, Fireball, held Guard, Dash, arena options and leaving Practice. Fireball and Dash showed their normal cooldowns. |
| Mobile page | With mobile browser emulation at 390 pixels, document width equaled viewport width. Desktop narrow windows still use itch.io's 600 pixel game column; landscape is the supported play orientation. |
| Page gallery | Actual current captures rendered in the body; the expandable Castleward and Armory section opened correctly. |
| Saved layout | Screenshots Hidden persisted after reload. |

The earlier browser attachment failures were resolved by opening a fresh owned tab. Native interaction completed the first checks; the later checks used ordinary UI controls, actual emulated touch events and read only incoming server snapshot inspection. No gameplay outcomes were injected. The two client match test established join/start/resume rather than a full human duel or prolonged load test. A complete tutorial run, sustained desktop mouse/keyboard combat, physical mobile testing and platform fullscreen exit remain unverified in this refreshed itch build. All temporary device, touch and user agent overrides were cleared. Test clients left the room or closed.

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

The introductory [Welcome to Castleward devlog](https://captainfredric.itch.io/swords-and-sorcery/devlog/1707848/welcome-to-castleward) was saved as a private Draft with current gameplay cover art. Its visible Draft badge and saved authored line were verified. Older images and the ZIP were removed from the post's attachment selection, preserving the original project uploads. The editable source is `DEVLOG_DRAFT.md` and `devlog-draft.html`.

The local trailer remains a review candidate. No hosted trailer destination is available, so an embed was not fabricated. A physical phone check and creator approval remain before broad public release. Character reconstruction can continue separately without delaying this documentation branch. GitHub main was rechecked after the browser tests and remains `3e4c368`, matching the uploaded runtime baseline.
