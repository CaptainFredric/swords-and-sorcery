# Initial Skill verification

Actual Castleward Inspection Yard, authored production machines, local authoritative hosting at 30 Hz. No model, projectile damage, ordinary cooldown, pressure capacity or global movement tuning changes.

## What was exercised

Touch activation of Bolt to the Occasion in Mobile produced exactly one heavy siege projectile: 85 direct damage, 55 m/s, original penetration and muzzle. Bolt I remained loaded and ready. Request at 210.2445, actual release 210.4839; release runs on authority ticks after preparation, rather than the coupled delay catch. `browser-facts.json` records release events and the later ram state.

Ram touch activation plus simultaneous reverse joystick and held CHARGE spent real pressure and moved backward. Priming ended after six seconds; eight seconds of added cooldown debt persisted. [Reverse charge recording](ram.mp4).

Native keyboard U primed the final control binding without toggling Inspection flight or the personal Ultimate. The default was changed from Y during development because Inspection already owns that shortcut. [Keyboard activation](ram-keyboard-u.png).

A passive dummy was positioned on supported ground in actual fist reach through the existing local Inspection staging API. U then primed the machine; reach triggered a physical retract/outward stroke and normal 120 damage. No damage, trigger or cooldown was injected into the fixture. [Actual operator-view piston contact](punch-sight.mp4), [authority events](punch-sight-facts.json). The recording shows the piston and target, with the ordinary mechanism recovery continuing after contact.

[844 by 390 landscape layout](mobile-layout.png) was inspected. The Skill button was moved beside Leave after an earlier position overlapped the HUD. Captures precede the final mechanical button glyph and special-stroke HUD/audio timing correction; physical collision and input behavior are the same.

## Focused authority coverage

Skill tests cover authorization, live match/ownership/stagger validation, ammunition and reload preservation, interrupted heavy release, independent cooldown persistence, different ram operator, expiry, reverse pressure/debt, hull versus fist bait, component destruction, continuous recovery interruption at four extension points, actual Guard damage and wall arrest, and two genuine strokes hitting the same victim without repeated overlap hits. The real WebSocket host rejects a guest activation and replicates priming and unchanged cooldown after operator departure. Existing ram, ballista, input, touch, HUD, presentation and audio regressions remain in the focused run.

## Remaining limits

Physical phone and a complete human balance session remain outstanding. Browser combat used a deliberately positioned Inspection target; recovery interruption, Guard, destruction, structure budgets and wall variants were exercised by authoritative regressions rather than exhaustive manual repetition. A first heavy video capture contained too few frames and was discarded as visual evidence; its actual projectile events remain recorded. No performance gain or full repository suite result is claimed. Fight and Flight has no playable base machine in this candidate, and its flight/rotor/ammunition debt tests remain future work.

Provisional values: both Skill cooldowns 24 seconds; ram prime six seconds, hull bait 35 damage, backward charge eight m/s and 1.5 seconds added cooldown per charging second. The independent heavy release uses 0.2 seconds of physical preparation after real main traverse, then normal heavy recovery/reload. These values are centralized in `SIEGE_SKILLS` for later play balance.
