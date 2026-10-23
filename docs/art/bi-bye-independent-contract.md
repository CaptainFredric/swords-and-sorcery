# BiBye independent weapon contract

This pass implements authoritative mechanics independently of asynchronous model loading. It uses the checksum verified v4.1 GLB and preserves the v3.2 and original rollback files. PR 218 merged externally at 5b6e2d6; this work continues on feat/ballista-independent.

## Authoritative state

`heading` controls the carriage and operator body. `mainYaw/mainPitch` and `upperYaw/upperPitch` are world aim angles. `weaponFocus` is MAIN or UPPER. `yaw/pitch` remain the selected weapon's actual aim for existing camera consumers. `focusRevision` synchronizes input on a weapon change.

The upper controller supports a full circle with shortest arc rotation at 120 degrees per second. Main traverse remains 45 degrees either side of the carriage. Current upper elevation remains the existing game envelope. Server behavior never waits for GLB loading.

Coupling proceeds through INDEPENDENT, ALIGNING, ENGAGING, COUPLED, FIRING and RELEASING. A fire request freezes its intended main aim, aligns the upper to the converged line, engages the latch for 0.60 seconds and commits automatically. Switching to UPPER or packing cancels before upper release without spending either bolt. The collar releases for 0.60 seconds after a full engagement; independent rotation and firing wait until it is clear. A partially engaged collar reverses from its current position.

The upper string release trips the heavy delay catch. A miss has no effect on the heavy release. Dismount, death and disconnect before the first release cancel the volley. After that release they preserve the heavy delay. Failed supports can still prevent the heavy shot. Released bolts retain their original owner.

## Clocks

Shot I fires after 0.2 seconds independently, or 0.45 seconds from coupled commitment. Its recock ends 2.5 seconds after actual authoritative discharge. The heavy catch releases 0.2 seconds after actual upper release. Release timestamps retain the exact deadlines between host ticks, and newly released projectiles advance only the fraction of the tick during which they existed. Snapshot and frame delivery still occur at host and display cadence. No mode, focus, mount or view action resets readiness.

Heavy recovery ends at commitment plus 2.2 seconds. Mechanical reload lasts 4.5 seconds and ends at commitment plus 6.7 seconds. Main reload completion does not alter upper readiness. A support failure before heavy release retains the unspent heavy bolt.

## Aim and collision

The current two muzzle locators and composed hierarchy remain the source for projectile origins. The upper world direction is inverted into the Traverse_Mount basis rather than subtracting Euler angles. Sideways and backward aim remain stable while the main cradle is elevated or the carriage turns.

Coupled aiming converges on the main sightline at 35 metres, using each actual muzzle. Speeds remain 48 and 55 metres per second. Practical 10 to 50 metre impact ordering favors the upper bolt first; sufficiently long shots allow the heavy bolt to overtake. This is not a damage multiplier.

Own projectile collision exempts only the launching assembly while the bolt clears its rail. Other parts of the carriage still intercept it. This is simulation coverage, not proof of triangle mesh clearance for the commissioned mechanism.

## Presentation and production asset

The exact delivered v4.1 binary has SHA256 `4641af412cf83d497f6f6059aa3d7c319b71bdcd44770f92bf90c65e2eccb31a`, 65 nodes, 46 meshes and 21 clips. The upper pivot is a child of Traverse_Mount at `[0,1.54,.08]`; its muzzle is `[0,.165,.84]`. Shared transforms and rendering use that hierarchy. Main cradle and muzzle placement remain unchanged.

Main, upper, clutch and delay tracks have exclusive ownership. Runtime owns aim rotations, wheels and stabilizers. Main reload samples clip19 over its native 4.5 seconds. Clips17/18 move only the lever and collar; clips20/21 retain the two release stages. Upper recoil and recock continue during main reload. Damaged components use the authored mesh alternatives. The upper sight uses node64. SoundEngine supplies distinct clutch, delay, upper recock, main winch and discharge cues, with deduplication.

The actual production Spellblade is fitted to the seat in Blender and retargeted into its original glTF bone bases. The supplied candidate quaternions are incompatible with this production rig. Limb lengths, normal character meshes and ordinary animation clips remain unchanged. Runtime arm IK follows the moving grips; the right hand travels between wheel and lever. A mounted rigid copy of the production sword is stowed while the normal hand weighted sword is hidden. Both local and remote bodies use the same interpolated carriage frame. Dismount restores the normal rig and sword, including when the local third person body becomes hidden.

The carriage has localized occupied volumes for the compact winch, seat, backrest, footrests and controls. Movement uses conservative AABBs around those pieces; projectile hits use their oriented boxes. Empty cockpit space is left open. No broader game mode availability is introduced.

The v3.2 GLB and original compressed/uncompressed files remain rollback resources. The earlier v3.3 delivery remains in the external source archive. Full source provenance and the production pose generator are recorded in the asset directory README.

## Validation boundary

See [v4.1 evidence](../evidence/bibye-v41/README.md) for actual gameplay captures, sampled Blender clearance, remote fixture scope, touch emulation and the matched frame comparison. Physical phone testing and a live itch.io iframe run of this private candidate remain separate. This PR stays in draft; integration does not authorize publication.
