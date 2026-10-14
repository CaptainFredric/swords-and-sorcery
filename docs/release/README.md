# Castleward release

Current release pass: October 14, 2026. Runtime baseline: `3e4c3687d4acdc79ba8bdcab9eb3072c3c4ba516`.

[Play the current game](https://captainfredric.github.io/swords-and-sorcery/) · [itch.io project](https://captainfredric.itch.io/swords-and-sorcery) · [Page copy](PROJECT_PAGE.md) · [Media provenance](media-manifest.json)

GitHub Pages serves the playable client. Render hosts authoritative multiplayer. Tutorial, Bot Duel, Practice and Inspection use the browser's local authoritative simulation. Initial assets still require connectivity.

## Current itch.io preparation

The previous saved upload omitted Tutorial from Solo. It was refreshed during this pass with the identified main build. The project remains private Draft while launch, page and compatibility checks are completed. The older email verification blocker is resolved.

The page description now leads with first person multiplayer, room codes and the optional voiced Greener Pastures tutorial. Detailed controls remain in How to Play. The obsolete instruction to select a Chivalry spell and press Q a second time has been removed.

The new gallery consists of current melee, Fireball, Tutorial and Armory captures, plus the existing wide live Castleward menu scene. The combat images use the actual renderer and ordinary authoritative contacts in Inspection Yard. Local actor/camera framing was staged, and inspection tools and the freeze notice were temporarily hidden for capture. These are Practice captures, not a claimed human multiplayer match. Tutorial uses the existing chapter replay. The banner is separately labeled AI assisted promotional illustration of the creator's original Spellblade design.

## Build

```sh
npm run verify
npm run export:html5
unzip -t dist/html5/swords-and-sorcery-html5.zip
```

The October 14 archive contains 878 files, 31.55 MiB compressed and 39.22 MiB extracted. It preserves the production character manifests, tutorial recordings and shared simulation. Root `release.json` identifies the runtime baseline. The server is `wss://swords-and-sorcery.onrender.com/ws`.

Archive SHA256: `b346dd2a34b569ed82fc08ec916a5cf10ec7fd5e1298cc49c9038035a0133eea`.

The archive uses stable timestamps and order; no tests or private files are included. No gameplay, balance, model, animation or audio source is changed by this presentation pass.

## Verification record

[October 14 evidence](OCTOBER_14_RESULTS.md) records current checks and their limits. The historical [October 10 record](ARCHIVE_2026_10_10.md) is retained as history. Its upload and email verification statements are superseded by this document.

## Publication

Publication and social posts remain separate final actions. The saved page, refreshed archive, source branch and copy can be reviewed before those actions. The contest field and two distinct social drafts are in [public posts](PUBLIC_POSTS.md).

The optional Buy Me a Coffee destination remains `https://buymeacoffee.com/captainarm1`. A Ko fi destination has not been supplied; no generic platform link is substituted.
