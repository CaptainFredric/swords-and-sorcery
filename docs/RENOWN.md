# Renown and the armory

Combat Kit is the default armory section. Heraldry contains cosmetic tabard dyes. Previewing a dye changes only the menu model. Unlocking and equipping are separate confirmed server operations. Azure costs 40 Renown; Crimson is free.

## Earning

A server hosted FFA, duel or bot duel awards 20 Renown for completion and 10 more for a win. The match must last at least 30 seconds and the connected human must record a kill, death or parry. Practice, offline matches, forfeits and early departure award zero. These initial values favour a quick first unlock. They are cosmetic progression, with no effect on combat strength.

The server captures each result with a unique match identity. Every profile stores its reward receipts, so repeated settlement cannot pay twice. Repeated purchase or equip messages are safe. Browser balances and ownership are display caches and cannot authorise spending. Snapshots carry only the equipped cloth, never profile credentials.

## Identity and persistence

The browser stores a random guest credential independently of its room session. The server stores a hash of that credential and a profile document. Reloading, changing rooms and restarting a server with the same data directory preserve the wallet. Clearing browser storage loses access to that guest identity. Recovery and cross device sign in are future work.

Set RENOWN_DATA_DIR to a private persistent directory outside the publicly served client and shared directories. Local development defaults to .data/renown. That directory is excluded from Git and Docker build context. The store uses atomic file replacement and keeps the prior wallet if persistence fails. Back up the directory; run only one server process against it. Multiple replicas require a transactional database adapter.

## Production rollout prerequisite

The existing render.yaml uses a free service and declares no persistent storage. Its container filesystem is not a durable wallet database. Do not deploy this feature as permanent progression until a persistent volume or database implementation is configured. No paid infrastructure has been provisioned in this change. A directory environment variable alone does not make an ephemeral filesystem durable.

Storage failures preserve existing credentials and display an error instead of silently replacing the profile. Match settlements retry while this process remains alive. A server crash while storage is unavailable can lose a pending settlement; a durable event queue is needed for stronger guarantees.

## Validation

Automated tests cover reward eligibility, duplicate settlement and purchase, insufficient funds, equipment ownership, persistence, write failures and corrupt profiles, websocket settlement, observer appearance replication, reconnect identity, cloth material isolation, and combat first armory navigation.

Browser verification uses a disposable local wallet seeded with 60 Renown to exercise purchase and equip. Match earnings are verified separately through the authoritative simulation and real websocket clients. No production wallet was seeded.

## Next increment

Configure production persistence, then add solo trial definitions and completion records using the existing bot duel simulation. Ultimate equipment and charge rules should remain a separate combat milestone.
