# SO-FIST-ICATION elevating ram: runtime integration handoff (draft)

This document describes the **review-only** gameplay implementation in PR #362. It is **not** evidence that Argon's actual authored Blender/GLB assets have shipped.

## Missing authoritative art deliverables

Argon's screenshot sheets and text summary were provided, but the following files were **not** uploaded to the conversation or committed into this repository:

- `SoFist-elevating-ram-source.blend` (editable source).
- `so-fist-ication-elevating-ram.glb` (new runtime GLB).
- `so-fist-ication-detached-fist.glb` (unique projectile/ground-rest asset).
- `SO_FIST_ICATION_ELEVATING_RAM_MANIFEST.json` and companion Markdown manifest (exact exported nodes, attachment transforms, coaxial piston equations).
- Runtime-asset provenance/rollback/export script package.

**Do not replace** `client/assets/props/so-fist-ication/so-fist-ication-v2_7.glb` with an unverified candidate. Only a screenshot-driven fallback is currently available. The interim renderer uses the old `Ram_Assembly` as a lifted/pitched proxy, and clones the old attached fist for a detached visual.

## Authored dimensions from Argon's summary (scale 2.85)

- Upper lift `Upper_Ram_Lift` and `Hydraulic_Lift_Stage1_Mid` move +0.440m nominal / +0.480m max in authored coordinates (1.254m / 1.368m world).
- Upper elevation `Upper_Elevation_Pivot` rotates +0–50° about [0,+0.385,-0.560] local after lift; unraised max angle provisionally +20°.
- `Ram_Assembly` retains its original separate recoil/stroke; upward elevation must not translate wheel pivots, steering, rear operator and grip locators.
- `Armored_Fist` is separate and may detach. Fist-absent fallback is `piston_exposed_striker_tip`, NOT a disabled attack.
- Fist health is a real machine-owned 500 HP destructible component, modified by the existing siege Steel mechanics.

Source geometry mapping: `shared/sim/soFistElevation.mjs`, `soFistGeometry.mjs`. Before release, use the actual manifest to calibrate collision OBBs and full 0–50° occlusion/collision envelopes, verifying actual world impact at every lift/pitch/strike state.

## Controls and ordinary behavior

- Grounded chassis independent of upper ram.
- Desktop: hold mounted Dash/E to raise, hold Crouch/C to lower; camera upward pitch drives the ram's elevation angle, not instantaneous chassis tilt.
- Touch: hold Jump to raise and hold Crouch to lower; joystick charge remains independent.
- Neutral machine remains the old normal ram; forward piston still fires at its existing timing/velocity.
- When the fist is absent/destroyed, piston-only attacks remain available at their existing reduced values.
- Charging at full height is suppressed; ordinary movement is less effective at height.
- Extra high-angle world/other-siege collision validation, rollover/recoil and rider camera checks remain release blockers.

## Optional Skill: Long Arm to the Jaw (working name)

The machine's alternate Skill is an actual launched, non-homing fist, not a graphical particle. It originates at the mounted striker, travels under authoritative gravity, checks colliders and reduces impact damage at distance (initial provisional values in `soFistDetachedFist.mjs`). The Skill remains mutually exclusive with the existing `Beat to the Punch` on each rider's loadout. It does **not** change the baseline 500 HP.

Lifecycle:
- `mounted` => `flying` => `falling`/ `resting` or `abyss`.
- If resting on reachable ground, pilot drives within 2.6m and presses Skill; attachment immediately returns, and a 24s machine cooldown starts.
- If truly lost in the abyss, the machine must return within 3.5m horizontally and 1.5m vertically of its **original deployment point** and its operator must dismount. Then and only then the **unboardable 24s recovery timer** begins.
- When that recovery finishes, the original fist returns attached with **the previous damaged HP**, not a repaired/new fist. Mounting is unavailable while recovering.
- Damage that already destroyed the Fist means the weaker piston-only state remains; detached fist does not grant free repair.
- Machine health/cooldown state persists through operator handoffs.

## Validation

New `server/tests/so-fist-elevation-detached.test.mjs` cases include lift/aim geometry vs grounded wheels/operator, elevated attacks, damaged fist and exposed piston, ordinary pickup, abyss dismount/lockout/same-HP recovery and contact against Fight-and-Flight components. `client/game/TouchControls.test.mjs` covers held, independent touch lift/lower.

Do not infer full art integration or production playability from these tests: genuine GLB node mapping, launch/landing/reattachment presentation, collision against actual moving rider geometry, real mobile gestures and two-browser adversarial interactions still require review and follow-up.

## Known upstream CI issue

The recently merged Spellblade binary changed independently; `client/game/biByeOperatorState.test.mjs` still asserts an obsolete `biByeOperatorPoses.characterSha256`. Repair that character/seat pose integration separately against real pose/bone geometry; do **not** simply change the expected hash to make CI green.
