# Castleward — Combat Affliction Inspection HUD

The player can be subject to many overlapping effects during All-Natural Disaster. The game must show **which conditions are actually affecting the local player** without adding countdown numbers, percentages or a second health meter.

## Design

- A narrow **AFFLICTIONS** dock at the upper left of the arena, independent of the lower health / Guard / sword and spell HUD. It appears only when there are active effects.
- Each active effect has its own **20-unit drawn SVG glyph** in a compact square with a thin potency trace below it. Glyph artwork is part of client/ui/icons.mjs — no emoji or assets to fetch. Colors differentiate danger families but each glyph has a different silhouette.
- **Tap/click an icon**: show one small explanatory panel. Select another icon: the first closes and the new explanation replaces it. Tap the selected icon again or × to close. The panel follows the selected condition's live strength and goes away if that condition clears.
- **Pointer-locked desktop**: default **I** interface control cycles the selected affliction without releasing mouse lock, disrupting the sword combo, or firing a spell. It can be rebound in Settings. After the last status, pressing it closes the panel. Touch directly taps the icons.
- **No visible timers or percentages**, even when inspected. Both tiny and large strength bars reflect real impairment/charge, not inferred elapsed time. Frozen, Staggered and Burning can remain fully potent and disappear abruptly, **because their mechanical effect does not taper**. Inventing a fade would be misleading.
- The dock lives above the touch-control plane only while statuses exist. Other HUD areas retain their normal hit-testing. UI elements stop pointer bubbling to the arena.

## Authoritative status mapping

| Status | Snapshot field | Strength source | Detail |
| --- | --- | --- | --- |
| Frozen | oneHitFrozenUntil | Full until released | Stops movement/new actions; held actions resume |
| Staggered | staggerUntil | Full until action lockout ends | Balance broken; cannot start actions |
| Shocking Conduct | electricalBacklash | oneHitBacklashRemaining / ONE_HIT_CONDUCT.potential | Next actually landing melee blow shocks the victim instead; charge drains |
| Blustered | blustered | blusterSeverity | Weapon and Guard facing lag, camera unaffected |
| Shaken | shaken | 1 − shakenSprintFactor | Sprint impeded; a rupture can hold back recovery |
| Burning | burningUntil | Full until fire ends | Repeated burn damage; no fictitious damage reduction |
| Chilled | chill | Current chill reduction divided by initial strength | Ordinary Frostfire chill thaws gradually |
| Frostbound | oneHitFrostSlow | Current depth / base field depth | Disaster frost slows movement while present; depth can be held/renewed |
| On Ruptured Ground | oneHitField | Authoritative strength of hostile ground field | Delays Shaken recovery and drains Guard on incoming HP damage |

No added damage sources or new status fields. No timer math on the client beyond existing pure rule functions. Effects vanish when the player dies or their authoritative effect ends. Cosmetic-only dizziness and ordinary balance accumulation remain in their existing HUD/readout rather than masquerading as an affliction.

## Verification

- client/ui/afflictionView.test.mjs: overlapping effects, real degradation vs constant effects, ownership and death.
- client/ui/AfflictionPanel.test.mjs: click selection, replacement, toggle-close, keyboard cycling, DOM retention, expiry cleanup, no click propagation.
- Existing HUD, touch, practice, network and rendering suites should run through GitHub CI.
- Manual desktop/touch acceptance: induce multiple All-Natural Disaster infusions and inspect every active icon; verify tapping does not swing/cast; test **I** with pointer lock; confirm shortened descriptions and safe positioning in landscape / narrow heights and on mounted machines. The touch overlay and text wrapping should be checked in an actual browser before review-ready.

**Branch only. Do not merge or deploy without browser/mobile acceptance.**
