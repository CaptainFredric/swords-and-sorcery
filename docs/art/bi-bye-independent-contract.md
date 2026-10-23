# BiBye independent weapon contract

This pass implements authoritative mechanics independently of asynchronous model loading. It preserves the production v3.2 GLB and all rollback files. PR 218 merged externally at 5b6e2d6; this work continues on feat/ballista-independent.

## Authoritative state

`heading` controls the carriage and operator body. `mainYaw/mainPitch` and `upperYaw/upperPitch` are world aim angles. `weaponFocus` is MAIN or UPPER. `yaw/pitch` remain the selected weapon's actual aim for existing camera consumers. `focusRevision` synchronizes input on a weapon change.

The upper controller supports a full circle with shortest arc rotation at 120 degrees per second. Main traverse remains 45 degrees either side of the carriage. Current upper elevation remains the existing game envelope. Server behavior never waits for GLB loading.

Coupling proceeds through INDEPENDENT, ALIGNING, ENGAGING, COUPLED, FIRING and RELEASING. A fire request freezes its intended main aim, aligns the upper to the converged line, engages the latch for 0.18 seconds and commits automatically. Switching to UPPER or packing cancels before upper release without spending either bolt.

The upper string release trips the heavy delay catch. A miss has no effect on the heavy release. Dismount, death and disconnect before the first release cancel the volley. After that release they preserve the heavy delay. Failed supports can still prevent the heavy shot. Released bolts retain their original owner.

## Clocks

Shot I fires after 0.2 seconds independently, or 0.45 seconds from coupled commitment. Its recock ends 2.5 seconds after actual authoritative discharge. The heavy catch releases 0.2 seconds after actual upper release. Release timestamps retain the exact deadlines between host ticks, and newly released projectiles advance only the fraction of the tick during which they existed. Snapshot and frame delivery still occur at host and display cadence. No mode, focus, mount or view action resets readiness.

Heavy recovery ends at commitment plus 2.2 seconds. Mechanical reload lasts 4.5 seconds and ends at commitment plus 6.7 seconds. Main reload completion does not alter upper readiness. A support failure before heavy release retains the unspent heavy bolt.

## Aim and collision

The current two muzzle locators and composed hierarchy remain the source for projectile origins. The upper world direction is inverted into the main cradle's basis rather than subtracting Euler angles. Sideways and backward aim remain stable while the main cradle is elevated or the carriage turns.

Coupled aiming converges on the main sightline at 35 metres, using each actual muzzle. Speeds remain 48 and 55 metres per second. Practical 10 to 50 metre impact ordering favors the upper bolt first; sufficiently long shots allow the heavy bolt to overtake. This is not a damage multiplier.

Own projectile collision exempts only the launching assembly while the bolt clears its rail. Other parts of the carriage still intercept it. This is simulation coverage, not proof of triangle mesh clearance for the commissioned mechanism.

## Presentation and current asset boundary

Main and upper animation tracks are independent. Heavy reload seeks the six second authored source clip over 4.5 game seconds. Upper aim, recoil and recock remain active during main reload. Support and wheel layers retain their existing ownership. Sounds for latch, delay catch, release and turning use the current SoundEngine synthesis, spatialization and deduplication.

The operator's current standing station remains unchanged. Local and remote body heading follows the carriage and its presentation uses the same interpolated carriage frame. No seated pose or elevated attachment is invented.

Argon's supplied v3.3 candidate has SHA256 `f993ccfe6279a8cac0335508b4aca233b6a3257b825cce1be28dd15c4f09d0e0`. Its standing station and limited upper clearance study do not satisfy the new visual design. The active GLB remains v3.2, SHA256 `c595a2bc41db7d8c5783c0795cb24276529f72932c8ecb70f72599c099937b6a`. Supplied v3.3 damaged meshes and nine audio masters remain available in the local source package for the final integration pass; they are not silently substituted here.

## Final delivery needed from Argon

Provide the revised Blender source, checksum verified GLB and contract together. Confirm named main and upper yaw/pitch pivots, full circle clearance across elevation and recoil, both muzzle release transforms, seat/pelvis anchor, foot rests and hand control sockets. Specify operator body facing relative to carriage and camera safe envelopes. Supply separate coupling latch, delay catch and release tracks or controllable nodes. Clips must leave unrelated weapon, wheels, supports and operator anchors untouched. Provide damage mesh visibility ownership and any revised hit volumes.

Only after that delivery can actual mesh clearance, seated rig fitting, coupling motion, final muzzle placement and sound audition be accepted. Physical phone, live itch iframe and real simultaneous shared room vehicle play remain separate outstanding checks.
