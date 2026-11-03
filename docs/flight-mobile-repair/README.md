# Flight mobile controls, cockpit and Dash

The mobile actions now form four paired rows on iron button faces with a fine brass edge. Pressing compresses only the face to 95%; the captured target stays fixed. The flight rail shares the joystick housing. Dash keeps its name and shows a small availability reason. Shared Sword, Guard, Steel, Sunder, Vortex, Chivalry, repeater, Fire Away and Eject glyphs use readable mechanical silhouettes.

The layout model supplies flight positions. Old unedited defaults and the complete old mirrored preset migrate; deliberate edits survive. Switching modes clears stale inline placements. The narrow flight status strip uses two metric rows clear of View and Eject.

## Cockpit

The v3.0 GLB and production character assets are unchanged. The duplicate camera sword was covering the real seated rider. First person now uses that rider's hands and sword. Its idle wrist aligns the actual blade with the authored corridor, opened outward for the longer production weapon. First and third person share this fit. Actual sword attacks and Guard retain priority over it. The repeater, protection, muzzle transforms and physical collision remain intact.

## Authoritative Dash

The baseline failed nine existing steering tests: the simulated commitment clock never advanced, launch travel was never initialized, and early release made the minimum travel branch unreachable. These state transitions now work. Launch captures camera yaw and pitch; a bounded alignment turns the chassis toward the chosen direction. After 0.36 simulated seconds, held steering follows live yaw and elevation. Upward input stays upward. Neutral launch makes a shallow descent. The genuine attack trim reaches 57 degrees, capped at 69 degrees with downward travel; upward flight removes the attack trim. Existing resources, ground braking, interruption, Practice recycling and terminal input priority remain.

Rotor segments now use the same root transform as the authored machine, including the actual hub offset, horizontal compression and heading. Contacts intersect the standing body rather than an enlarged disc. A second playtest finding mattered: the first grazing sample consumed an entire blade crossing. Resolution now uses the best point the blade actually visited within that tick, once per physical contact episode. Damage, energy, Guard and parry formulas are unchanged.

## Evidence and limits

Open [the comparison gallery](index.html). Before images run unchanged main 9e36c084 in a separate baseline checkout. Paired images use Chrome, actual touch emulation, 1338 × 608 or 568 × 320, the same world/camera position and Fireball/Sunder loadout. Movement, lighting and mesh animation remain live, so the captures are comparable rather than pixel identical.

The short video uses normal touch Dash and a separate look finger, with the ordinary local authoritative simulation. Initial machine and passive dummy positions were staged for repeatability. No hit, damage or trajectory was injected. It records a grazing hit followed by a clean contact at quality 0.924 and 13 damage, then turning and ascent. Canvas capture contains the world, without the DOM HUD or audio. The recording preceded the final 25 mm correction from the legacy hub estimate to the exact GLB hub. The final helper was checked against the real loaded GLB at 12 pitch/heading combinations, with maximum transform error 1.84e-15 m.

Native keyboard E also began and ended an authoritative run. Actual touch checks covered Bolt, View, Tools, mirrored layouts, custom mode switching and rotated ascent/cancellation. Tools kept the flight machine, ballista and ram mounted with ownership and resources intact. Holding Eject while releasing Tools emitted a canceled Eject command; the late lift did nothing. Explicit Reset Self and machine replacement keep their intentional reset rules.

Physical phone hardware, extended multiplayer latency play and exhaustive human balance testing remain outside this browser pass. No frame rate improvement is claimed. The automated suite covers shared authority, spell/combat and machine regressions; HTML5 verification is recorded in the PR.

## Verification

Final `npm run verify`: 627 syntax checks, 2,327 repository tests, 21 HTML5/release tests, and the HTTP/WebSocket smoke check all passed. Focused tests include initial camera yaw, upward launch, sustained turning, simulated clock stalls, minimum travel, Practice recycling, rotor destruction, physical walls, torso contact, clean crossing quality, Guard, timed parry and input cancellation. The exact commit export is reported in the PR.
