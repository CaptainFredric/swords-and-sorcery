# Combat feedback and everyday flow

Base: current main at `53326c8`. Branch: `polish/combat-flow`.

## Findings and changes

1. Bot Duel required another Start press after choosing the mode. The original click now requests arena focus. The existing readiness check still controls the countdown. Fight Again shares this path. Browsers that reject Pointer Lock retain the existing Start button fallback. Countdown copy now acknowledges that the duel is starting.
2. Duel progress was available mainly through the scoreboard. A compact YOU / RIVAL score now sits below the clock in Bot Duel and matchmade Duel. It uses authoritative kills and remains visible through deaths and respawns. Tutorial, Practice, FFA and Breakthrough keep their existing HUDs.
3. Contact confirmation relied on small colour changes, and independent removal timers could clear a newer marker. Hits now use a brief cross, blocked contacts a shield outline, parries a cyan diamond, and kills a longer white marker. Only one marker is active. Important outcomes take priority over later incidental contacts.
4. Generic sword damage produced a redundant hit marker before the quality specific sword contact. Burn ticks and self damage could also flash the reticle. Sword contacts now own their quality cue, and burn ticks, zero damage and self damage are excluded from fresh impact confirmation. Damage numbers remain unchanged.
5. Unavailable Dash presses were silent. They now use the existing denied sound and ability feedback. Touch spell, Dash and ultimate buttons also receive the denied border cue.
6. At 960 by 540, the large menu header pushed Solo below the initial view. The title and crest compact in short windows, keeping Solo visible while preserving button sizes. A More options button scrolls the banner and disappears at the bottom. It follows resize and content changes and respects reduced motion.

## Scope preserved

Shared simulation, server code, damage, cooldowns, speed, hit windows, animation assets, character geometry, tutorial dialogue, voice systems, music and ultimate tuning are unchanged.

## Verification

Baseline: 1,495 tests passed before edits. New tests reproduce premature marker removal, overlapping contact colours, kill marker priority, duplicate damage confirmation and duel score mode isolation. The lobby regression covers stale Start instructions during the countdown.

Browser checks used the actual game at 1280 by 800 and 960 by 540. A temporary local driver used ordinary InputController actions against the responding Knight bot. A complete duel reached the result screen at 7 to 10, with repeated melee contacts, blocks, deaths and respawns. Spell and Dash inputs were exercised. A rejected Dash was observed through its actual denied class. Score, cooldowns and contact markers were inspected in game. The short menu and its scroll endpoint were checked directly.

The temporary driver was removed from the project and retained with screenshots in the task output folder. The desktop layout check retained emulated touch focus because this embedded browser rejected physical Pointer Lock. A later Chrome desktop check acquired real canvas Pointer Lock through Start Bot Duel and entered normal play. Native input delivery then interrupted focus. Further attempts reported `WrongDocumentError` for Pointer Lock before the browser control connection timed out. Automatic desktop entry and sustained physical mouse/keyboard play therefore remain unverified. This could reflect a target lifecycle or browser control problem; the cause has not been established. Touch emulation establishes browser behaviour, rather than physical phone certification. Multiplayer regression coverage uses the repository tests and WebSocket smoke test; this pass does not claim a new human multiplayer session.

Final verification: `npm run verify` passed with 1,502 repository tests, four HTML5 export tests, syntax checks and HTTP/WebSocket smoke. `git diff --check` passed. The task output contains the full verification log and screenshots. Fight Again was also checked through actual return to another playing duel from one press.

## Next priorities

The next combat pass should use physical mouse input to assess distance judgment and recovery pose readability against a human opponent. Those observations should precede additional animation or balance work. Physical phone testing should remain a priority after the recent mobile input changes.

Two further opportunities were observed while browsing: How to Play still presents desktop keys in touch mode, and the solo arena menu explicitly keeps the fight running while controls are released. Device aware help and a true local solo pause deserve a dedicated follow up. Armory selection and help navigation continued to work; their established designs were preserved.
