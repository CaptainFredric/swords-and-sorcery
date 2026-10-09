# Castleward release preparation

Inspected 9 October 2026. Branch `feat/itch-release`, based on GitHub main `aad49e8e46ffeb70da394ec91e3345f8c6f6d888`. The separate Claude checkout was preserved. No gameplay, animation, voice, music, server or model files changed.

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

Saved title, slug, description, controls, disclosure, free pricing, development status, Action genre, tags, production model cover and four actual game screenshots. Visibility remains Draft. Anonymous access returns 404.

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
| Reconnect and cross host matchmaking | Pending explicit browser exercise |
| Offline fallback | Included unchanged; dedicated release browser test pending |
| Mobile touch and browser/device matrix | Pending real device and iframe tests |

One final default concurrency run reported 1110 passes and one failure in unchanged `client/game/sound/audioStart.test.mjs:94`. A timer reached the audio mock's buffer before the test's cleanup, causing a conversion error at `MusicPlayer.mjs:153`. The isolated four audio startup tests passed. The entire 1111 test suite then passed with `--test-concurrency=2`, with every test retained. This is evidence of an intermittent test harness failure under load, not evidence of a release change to music. Music source and tests were deliberately left unchanged. Local logs retain both runs, alongside the export and smoke results.

The raw input automation required bringing the game tab to the foreground before pointer lock. Native Escape correctly opened the match menu. No source change was warranted by that automation focus issue. The Mac locked during the final native browser checks. Browser DOM controls still allowed saving the private project's images, but further native game input requires the owner to unlock it.

Before publication, test the actual itch launch against the standalone Render game in one private room. Confirm both players join and start, aim/cast/Guard work, reconnect retains the appropriate session, and leaving and returning works. Test blocked multiplayer with local practice. Exercise audio activation, voice playback, storage persistence, fullscreen exit and landscape touch controls. Compare fullscreen launch with an embedded window at a short desktop height. Record device/browser and observed failures. A local static test does not establish iframe compatibility.

## Media and creator support

See [media manifest](media-manifest.json), [comparison](media-comparison.html) and [project copy](PROJECT_PAGE.md). Generated portrait artwork, staged production model renders and gameplay captures are explicitly distinguished. Five captures show a Practice Yard Fireball, a training dummy encounter, the Armory, the main menu and the menu's Castleward tour. Four were saved to the Draft; the cleaner main menu capture is a candidate replacement for the tour image when browser work resumes. The tour is not described as a separate game mode.

The helmet avatar is the recommended creator image. It keeps the cyan visor and red crest recognizable at small sizes. The existing Castleward crest is the quieter alternative. New public profile images await the creator's selection; the current images were preserved.

To reproduce the composed cover renders, serve this checkout over localhost and open `docs/release/media-source.html`. The default view renders 1260 × 1000. Query `?kind=banner`, `?kind=support`, `?kind=kofi` or `?kind=crest` selects the other formats. The HTML reads the production character and authored Cast action, without altering either. Capture the exact art dimensions from the manifest rather than padding short banners to the browser's full height. The separate comparison HTML is portable alongside its `media` folder.

The compact Credits support section remains in [Draft PR145](https://github.com/CaptainFredric/swords-and-sorcery/pull/145), after creator attribution and before the voice archive. Preserve its accessible external link, keyboard focus and optional support note. The actual Ko fi account URL is unknown. Add a primary Ko fi action only after its destination is verified, keeping Buy Me a Coffee as the quieter alternative in the same section. A second card or generic platform homepage would add clutter and lose the intended destination. No duplicate Credits section was created.

## Theme and creator profile recipe

Use the saved 1260 × 1000 cover, 1600 × 500 itch banner, and actual screenshots. Set dark iron `#17171B` behind the page, parchment `#EADABD` for readable copy, crimson `#8E2932` for accents and restrained brass `#CBA66B` for links or rules where platform controls permit. Keep text on an opaque reading surface. Avoid rebuilding the hanging game menu on the listing.

Creator display: “CaptainFredric · Swords & Sorcery”. Short description: “Making Swords & Sorcery, one duel and dubious oath at a time.” Keep the existing creator biography and authored thank you message. Use the 1600 × 400 creator cover for Buy Me a Coffee, and 1200 × 300 variation for Ko fi after checking the platform's crop preview. Original payment and account configuration stays with the owner.

## Useful next steps

| Proposal | Purpose | Cost and risk | Release placement |
| :--- | :--- | :--- | :--- |
| A 25 second actual gameplay trailer | Show sword, Guard and magic within the first ten seconds | One capture/edit session; footage must represent real play | After the iframe passes |
| A short “first duel” challenge | Help a new player connect practice to a match | Small instruction change; avoid another blocking tutorial | Separate gameplay onboarding pass |
| A matching social preview | Make a shared link identify the game immediately | A separate tested metadata change; verify the public crawler image | After choosing the final cover |
| A focused feedback prompt on the project page | Collect reproducible browser and combat issues | Already included in the Draft; no extra tracking | This release |

Trailer storyboard: 0 to 3 seconds title over Castleward, 3 to 9 seconds approach and sword/Guard exchange, 9 to 15 seconds Fireball and Frostfire, 15 to 20 seconds one ultimate and recovery, 20 to 25 seconds room code and playable URL. Capture real combat. Keep any Spellblade line audible and brief. No trailer was fabricated or recorded in this pass.

## Review and publication

1. Choose the avatar and approve the finished public profile artwork.
2. Verify the itch account email and unlock the Mac for native play tests.
3. Complete the actual itch compatibility matrix above. Apply the banner/theme and inspect desktop and mobile previews.
4. Review the export/media PR and the separate Credits PR. Neither is merged automatically.
5. Explicitly approve publication once the embedded game works. Keep Pages as the fallback play link.
