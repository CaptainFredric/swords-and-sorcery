# Chivalry desktop selection

Base: cdbb2f92f00990423c3b641f8141dec409e4748b from current main. Work uses the isolated feat/chivalry-keyboard-selection branch. Claude's primary checkout is preserved.

## Controls

Tap Q casts the authoritative current spell. Holding Q for 200 ms opens the selection, and it stays open once Q is released (revised 2026-10-05: Q no longer has to be held through the number). Then 1, 2 or 3 selects a prepared slot without casting, a cooling spell included, and the number press closes selection immediately. Q again or Escape closes it without casting. A quick Q plus number chord still works before the 200 ms reveal. Number keys and their numpad equivalents retain ordinary bindings outside selection. Consumed numeric repeats and key releases cannot trigger unrelated actions.

(Before the revision, selection required holding Q while pressing the number, releasing Q without choosing cancelled quietly, and the reveal came at 140 ms.)

Desktop mouse movement continues aiming throughout. Slots retain authoritative Armory order, with numbered badges. Changing the current spell never moves those slots. The panel remains informational and cannot receive pointer input.

Mobile's existing drag fan, centered current card and release behavior are preserved. Mobile still uses its existing atomic prepared cast command; this correction changes the desktop control scheme. Physical phone testing was not performed.

## Authority and persistence

selectPreparedSlot carries a one based slot number. The host requires an integer in 1 through 3 and validates living Chivalry startup or active repertoire membership using the existing selection rules. Selecting changes identity only, preserving cooldowns and any existing gather.

castCurrentSpell carries aim rather than a client spell identity. Ordered selection followed immediately by Q therefore casts the host's new identity before a snapshot acknowledgement can return. Local presentation predicts the selected intent without rewriting authoritative current state; ordinary availability gates still apply.

The preparedSpellSelected snapshot flag keeps Q as a spell input after selection, expiry and same match respawn. A cooling selected spell fails its spell availability check instead of becoming a gauntlet. The HUD keeps that spell's icon and real cooldown. Fresh match state clears the flag and restores the Armory starter. Explicit gauntlet controls retain their behavior. Players who never select a prepared spell retain the ordinary cooldown gauntlet fallback.

## Wording

Armory before: “Three equal spells. The starting spell is marked ★. Hold Q during Chivalry to choose another.”

Armory after: “The starting spell is marked ★. During Chivalry, hold Q and press 1, 2 or 3 to select. Release Q, then tap it to cast.” Each prepared Armory row displays its number.

How to Play before: “Hold Q to choose a prepared spell. On touch, drag from the spell button.”

How to Play after: “Hold Q and press 1, 2 or 3 to select a prepared spell. Release Q, then tap it to cast. On touch, drag from the spell button.”

Desktop open HUD: “CHOOSE A PREPARED SPELL” (was “Q HELD · PREPARED SPELLS”) and “PRESS 1, 2 OR 3 TO SELECT · Q OR ESC TO CLOSE”. Ordinary desktop hint: “TAP Q TO CAST · HOLD Q, THEN 1 / 2 / 3 TO SELECT” (until 2026-10-05: “PRESS 1, 2 OR 3 TO SELECT · ESC TO CANCEL” and “TAP Q TO CAST · HOLD Q + 1 / 2 / 3 TO SELECT”).

## Verification

npm run verify passed syntax checks, all 880 tests and the HTTP/WebSocket smoke check. New coverage verifies discrete slot input, no cast on selection or cancellation, autorepeat, consumed releases, ordinary numeric bindings, mouse aim, prediction before acknowledgement, malformed slots, death and expiry rejection, cooldown and gather preservation, respawn persistence and match reset.

Network coverage connects two actual WebSocket clients. Both observe selection without casting and the immediate selected Frostfire cast before selection acknowledgement. A later Gale selection leaves that Frostfire gather and projectile intact. The offline LocalHost exercises the same commands and simulation.

Browser testing uses the actual InputController, runtime and practice host. Selection produced zero spellCast events; cancellation produced zero events; mouse movement changed aim; valid selection closed immediately. Rapid selection, Q tap and another selection predicted and released Frostfire while Gale became current. Guard remained active. The numbered panel was inspected at 1440 by 900, 1366 by 720 and the default narrow viewport. At the smaller desktop size its bounds remained inside the viewport.

Local evidence: artifacts/chivalry/keyboard-selector-desktop.png, keyboard-selector-narrow.png and keyboard-selector-qa.json. These are local ignored artifacts rather than production assets. Browser viewport overrides and temporary input state were reset afterward.

## Changed files

1. client/game/InputController.mjs: discrete keyboard selection, quiet release and current identity casting.
2. client/game/InputController.test.mjs: input, cancellation, binding, autorepeat, aim and prediction regressions.
3. client/game/GameRuntime.mjs: spell only local denial and touch HUD mode.
4. client/game/TouchControls.mjs: preserve the cooling selected spell face after expiry.
5. client/network/GameSocket.mjs: slot selection and authoritative current cast intents.
6. client/network/LocalHost.mjs: matching offline commands.
7. client/network/GameLink.mjs: forwarding both new commands.
8. client/network/preparedCommands.test.mjs: wire payloads, host forwarding and offline simulation.
9. client/ui/HUD.mjs: fixed desktop slot order, badges, hints and persistent spell face.
10. client/ui/preparedHud.test.mjs: desktop order, informational mode, mobile fan and expiry regressions.
11. client/ui/preparedSpells.css: compact numbered badges and mobile visibility.
12. client/main.mjs: numbered Armory slots and selection instructions.
13. client/index.html: How to Play and prepared cooldown copy.
14. shared/sim/Room.mjs: fresh match selection flag.
15. shared/sim/combat.mjs: mark accepted selection and protect the selected spell from fallback.
16. shared/sim/wire.mjs: validated slot intent, current cast and snapshot flag.
17. server/tests/chivalry.test.mjs: slot validation, clocks, gather, expiry, respawn and match reset.
18. server/tests/chivalry-network.test.mjs: both clients observe selection and current casting.
19. docs/CHIVALRY_KEYBOARD_SELECTION.md: this report.

## Scope and integration

No damage, movement speed, stamina, hit window, gather duration, spell cooldown or ultimate duration changed. No authored animation, Blender source, model, rig, mesh or export changed; asset tests passed in the full suite. Voice systems, Credits VO, menu music, autoplay, Sunder, Vortex, ruptures, ultimate startup and cameras remain untouched. Shared runtime and combat changes are limited to prepared selection behavior.

Delivery is a pushed isolated branch and pull request. The public Render main deployment updates after integration into main.
