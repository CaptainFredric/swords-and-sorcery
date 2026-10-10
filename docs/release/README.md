# Castleward release preparation

Current update, 10 October 2026: PRs 145 through 148 are merged. The integrated candidate at `0afc44d` was uploaded successfully and saved as browser playable in the private itch.io Draft. Desktop itch loading, native controls, offline Practice, cross-host multiplayer and a clean reload were exercised. Read [the final pass results](FINAL_PASS.md) for evidence and remaining checks. The account upload restriction is cleared. The older preparation record below describes the preceding session.

Inspected 9 October 2026. Branch `feat/itch-release`, based on GitHub main `aad49e8e46ffeb70da394ec91e3345f8c6f6d888`. The separate Claude checkout was preserved. The follow up corrects compact menu command clipping in `client/menu.css`; gameplay, animation, voice, music, server and model files remain unchanged.

The [quality audit](QUALITY_AUDIT.md) ranks observed issues and remaining checks. The [media comparison](media-comparison.html) now includes a 27 second real gameplay trailer, five landscape captures and menu before/after evidence. All 1111 game tests, four export tests, syntax and smoke passed at normal concurrency on the follow up.

## Distribution

Use [GitHub Pages](https://captainfredric.github.io/swords-and-sorcery/) as the immediate playable link. It already connects to the authoritative Render server. The Buy Me a Coffee profile's “Play in your browser” link was changed to this URL and saved.

itch.io can host the same static browser client while Render continues to run multiplayer. The export uses the existing `ss-game-server` meta. It introduces neither another network layer nor another simulation. Existing `GameLink` and `LocalHost` behavior is included unchanged.

Build from a clean, identified commit:

```sh
npm run export:html5
unzip -t dist/html5/swords-and-sorcery-html5.zip
```

Requires Node 22 or newer and the `zip` command. The archive contains root `index.html`, browser files, shared modules and `release.json`. Tests, private files, symlinks and development metadata are excluded. Voice and character manifests are preserved. `export-report.json` records revision, sizes, entries and SHA256. File order and timestamps are stable, so identical inputs produce identical archives.

The initial build contains 509 files, 21.81 MiB compressed and 28.45 MiB extracted. It uses `wss://swords-and-sorcery.onrender.com/ws`. Changing `GAME_SERVER` requires a secure, credential free URL ending in `/ws`. The production build has dependency coverage tests and size/path limits matching the [itch HTML5 documentation](https://itch.io/docs/creators/html5).

The server currently checks the WebSocket endpoint path without a host origin allowlist. An extra origin exception was unnecessary. Server code and protections were left intact.

## Actual itch Draft

[Private project preview](https://captainfredric.itch.io/swords-and-sorcery) · [Editor](https://itch.io/game/edit/5125729)

Saved title, slug, description, controls, disclosure, free pricing, development status, Action genre, tags, production model cover and five actual game screenshots. The new landscape Fireball capture leads the gallery; the original four are retained. Visibility remains Draft. Anonymous access returns 404.

The game ZIP upload was refused with: “Please verify your email address before uploading a file.” The private preview therefore says “No file provided to embed.” It is a preparation page, not a functioning itch game yet. The account owner must verify their email, then upload the ZIP, mark it playable in browser and save. Payment settings and public publication were left alone.

“Click to launch in fullscreen” is the candidate launch mode. It has not been selected on the strength of iframe testing. Mobile friendly, scrollbars and SharedArrayBuffer support remain unchecked. Theme controls were unavailable in the observed preview, so the banner and theme recipe are prepared rather than claimed applied.

## Verified and pending

| Check | Result |
| :--- | :--- |
| Repository verification | Initial `npm run verify` passed. Final syntax, all 1111 existing tests, four export tests and HTTP/WebSocket smoke passed; see concurrency note below |
| Repeatable ZIP, root index, secure meta, limits | Focused tests passed; archive integrity passed |
| Packaged client at `/html/game/` | Loaded the scene, model and UI; connected to Render; entered Practice Yard and cast Fireball |
| GitHub Pages desktop | Scene loaded; pointer lock, movement, casting and Escape menu exercised |
| itch project metadata and images | Saved and inspected in the private preview |
| Actual itch loading, input, audio, fullscreen, storage and WS | Blocked by account email verification |
| Exported client native controls | Pointer capture, movement, Guard, sword attack, Fireball and Escape passed in Chrome after raising the actual game window |
| Exported client audio and resize | AudioContext running; browser fullscreen exit resized the live renderer correctly |
| Exported private room and reconnect | Two separate origins joined and started a Render match; brief transport reconnect and reload retained the same player and room |
| itch versus standalone cross host matchmaking | Pending actual itch upload and launch |
| Offline fallback | Included unchanged; dedicated release browser test pending |
| Mobile touch and browser/device matrix | Pending real device and iframe tests |

One final default concurrency run reported 1110 passes and one failure in unchanged `client/game/sound/audioStart.test.mjs:94`. A timer reached the audio mock's buffer before the test's cleanup, causing a conversion error at `MusicPlayer.mjs:153`. The isolated four audio startup tests passed. The entire 1111 test suite then passed with `--test-concurrency=2`, with every test retained. This is evidence of an intermittent test harness failure under load, not evidence of a release change to music. Music source and tests were deliberately left unchanged. Local logs retain both runs, alongside the export and smoke results.

The owner unlocked the Mac and the exported client checks resumed. Native input required raising the actual Chrome game window, rather than only selecting the tab through automation. Pointer capture, movement, Guard, attack, Fireball and Escape then worked. Brief WebSocket disconnects and browser reloads recovered the same sessions in Practice and the two player private match, with both private players connected. The audio context ran after input, and browser fullscreen exit resized the renderer without a world error. See [structured browser results](browser-verification.json). Input, networking and audio code stayed unchanged. Longer outages, physical mobile controls and actual itch iframe behavior remain pending.

Before publication, test the actual itch launch against the standalone Render game in one private room. Confirm both players join and start, aim/cast/Guard work, reconnect retains the appropriate session, and leaving and returning works. Test blocked multiplayer with local practice. Exercise audio activation, voice playback, storage persistence, fullscreen exit and landscape touch controls. Compare fullscreen launch with an embedded window at a short desktop height. Record device/browser and observed failures. A local static test does not establish iframe compatibility.

## Media and creator support

See [media manifest](media-manifest.json), [comparison](media-comparison.html) and [project copy](PROJECT_PAGE.md). Generated portrait artwork, staged production model renders and gameplay captures are explicitly distinguished. The newer landscape candidates show melee, Fireball, Vortex, Armory and the live Castleward courtyard. The Fireball image leads the private Draft gallery alongside its four retained original screenshots. The tour is labeled as a live menu scene.

The helmet avatar is the recommended creator image. It keeps the cyan visor and red crest recognizable at small sizes. The existing Castleward crest is the quieter alternative. New public profile images await the creator's selection; the current images were preserved.

To reproduce the composed cover renders, serve this checkout over localhost and open `docs/release/media-source.html`. The default view renders 1260 × 1000. Query `?kind=banner`, `?kind=support`, `?kind=kofi` or `?kind=crest` selects the other formats. The HTML reads the production character and authored Cast action, without altering either. Capture the exact art dimensions from the manifest rather than padding short banners to the browser's full height. The separate comparison HTML is portable alongside its `media` folder.

The compact Credits support section remains in [Draft PR145](https://github.com/CaptainFredric/swords-and-sorcery/pull/145), after creator attribution and before the voice archive. Preserve its accessible external link, keyboard focus and optional support note. The actual Ko fi account URL is unknown. Add a primary Ko fi action only after its destination is verified, keeping Buy Me a Coffee as the quieter alternative in the same section. A second card or generic platform homepage would add clutter and lose the intended destination. No duplicate Credits section was created.

## Theme and creator profile recipe

Use the saved 1260 × 1000 cover, 1600 × 500 itch banner, and actual screenshots. Set dark iron `#17171B` behind the page, parchment `#EADABD` for readable copy, crimson `#8E2932` for accents and restrained brass `#CBA66B` for links or rules where platform controls permit. Keep text on an opaque reading surface. Avoid rebuilding the hanging game menu on the listing.

Creator display: “CaptainFredric · Swords & Sorcery”. Short description: “Making Swords & Sorcery, one duel and dubious oath at a time.” Keep the existing creator biography and authored thank you message. Use the 1600 × 400 creator cover for Buy Me a Coffee, and 1200 × 300 variation for Ko fi after checking the platform's crop preview. Original payment and account configuration stays with the owner.

## Useful next steps

| Proposal | Purpose | Cost and risk | Release placement |
| :--- | :--- | :--- | :--- |
| A 27 second actual gameplay trailer | Show sword, Guard and magic quickly | Completed from real Practice Yard footage; creator listening and publication approval pending | Ready as a local candidate |
| A short “first duel” challenge | Help a new player connect practice to a match | Small instruction change; avoid another blocking tutorial | Separate gameplay onboarding pass |
| A matching social preview | Make a shared link identify the game immediately | A separate tested metadata change; verify the public crawler image | After choosing the final cover |
| A focused feedback prompt on the project page | Collect reproducible browser and combat issues | Already included in the Draft; no extra tracking | This release |

The completed 26.84 second trailer opens on Castleward, shows melee contact and Fireball, follows Blazing Vortex, and closes on the title and playable link. It retains the actual game audio, including incidental creator voice. The recording contains the WebGL canvas; DOM HUD panels and captions are outside the capture. [Edit manifest](trailer-manifest.json), `capture-recorder.js` and `edit-trailer.py` document its reproduction. A hosted video destination is still needed for the itch trailer embed.

## Review and publication

1. Choose the avatar and approve the finished public profile artwork.
2. Resolve the itch account email verification upload blocker. Native exported client checks are complete within the scope recorded above.
3. Complete the actual itch compatibility matrix above. Apply the banner/theme and inspect desktop and mobile previews.
4. Review the export/media PR and the separate Credits PR. Neither is merged automatically.
5. Explicitly approve publication once the embedded game works. Keep Pages as the fallback play link.
