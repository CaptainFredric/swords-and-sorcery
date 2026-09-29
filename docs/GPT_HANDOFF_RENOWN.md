# Swords & Sorcery: Renown and armory handoff

The Renown feature branch now includes the latest Claude work from main at a243b99, including Claude's a44246e voice processing commit, the restored knight model, death camera and revised menu tour. This work lives on feat/renown-armory in PR #82. The public deployment has not been updated. The user's original checkout was preserved.

## Player experience

Combat Kit is always the first armory section. Weapons and spells stay ahead of cosmetic choices. Heraldry uses the existing Castleward crimson cloth, brass borders, iron plaques and inscription typography. It now has a compact swatch grid, collection count, wallet balance, selected standard description, unlock progress, purchase confirmation and a collapsible explanation of rewards. Keyboard arrows navigate the swatches. Reduced motion is respected. Heraldry hides the spell preview orb so its light interferes less with viewing the cloth.

Six tabard standards are available:

| Standard | Renown |
| --- | ---: |
| Castleward Crimson | Free |
| Azure Standard | 40 |
| Verdant Oath | 40 |
| Ivory Watch | 60 |
| Royal Amethyst | 60 |
| Ashen Guard | 80 |

These recolor the front and back tabard. The original armor, helmet, scarf, crest, rig and animations are preserved. Dye materials are isolated per knight, and the shader preserves gold embroidery and cloth shading. Previewing neither spends currency nor changes equipped appearance. Unlocking and equipping are separate server confirmed actions. Equipped colors appear in remote player snapshots and survive reloads.

## Reward rules

A qualifying completed server hosted match awards 20 Renown, plus 10 for victory. It must last at least 30 seconds, and the connected human must record a kill, death or parry. Server hosted bot duels count. Practice, offline play, forfeits and early departures award zero. The server now records the specific eligibility reason, so the end screen explains the actual outcome. Unique match receipts prevent duplicate rewards; repeated purchases are also safe.

Guest identity is independent of the room session. The browser holds a random credential and a display cache; the server authorises balances and ownership. Existing profiles and earlier reward receipts remain compatible.

## Validation and deployment

npm run verify passed: 411 tests, syntax checks and the HTTP/WebSocket smoke test. Tests cover all six purchases, persistence, independent dye materials, reward reasons and network replication. Browser checks covered the updated model, cloth previews, gameplay first navigation, desktop and phone layouts, and zero console errors. Earlier browser testing separately verified purchase, equip and reload using a disposable local wallet.

Production blocker: the current Render service has no durable wallet storage. RENOWN_DATA_DIR must point to a genuinely persistent directory for this single process file store. An environment variable pointing inside an ephemeral container is insufficient. No paid service was provisioned. A database adapter is needed before multiple server replicas. Storage outages retry settlement while the process survives; pending rewards are not a durable event queue. Clearing browser storage loses guest identity; recovery and account linking remain future work.

Primary files: shared/src/cosmetics.mjs, server/src/ProfileStore.mjs, client/menu/RenownController.mjs, client/menu/renownView.mjs, client/game/clothDye.mjs and client/renown.css. docs/RENOWN.md explains persistence and rollout.

Next priority: configure durable production storage and validate a server restart, then release the progression loop. Solo trials and ultimates remain separate future milestones. Preserve Claude's current combat and presentation changes when integrating.
