# Fight-and-Flight vertical input contract — Antigravity handoff (2026-10-31)

**Authoritative owner:** `shared/sim/fightFlight.mjs`, `shared/sim/wire.mjs`.
**Client implementation owner:** Antigravity. This branch deliberately does **not** modify TouchControls, GameRuntime, GameLink, GameSocket, or startup routing.

## Explicit mobile controls (do not overload one pointer)

| Touch control | Client on press | Client on release/cancel | Server |
| --- | --- | --- | --- |
| **JUMP / HOP** | Send exactly one reliable `{type:'flightHop'}` command (not an `input.jump` latch) | Nothing to keep held; do not send `flightRise` | On ground: one real upward impulse (3.2 m/s), then gravity, apex and physical landing. Does not engage the motor. |
| **RISE** | Set held `input.flightRise=true` on each movement heartbeat | Set `input.flightRise=false` immediately | Sustained +3.7 m/s target while held, charged rotor with actual spool and flight-charge cost. Release: zero vertical velocity target, damped hover **only while** enough rotor energy/charge/integrity remains. |
| **LOWER** | Set held `input.flightLower=true` on each movement heartbeat | Set `input.flightLower=false` immediately | Immediate -3.4 m/s descent target while airborne. Release: neutral velocity target. Ground Lower is a physical rotor brake. |
| **DASH** | Existing `flightDash down:true` | `down:false`, including pointer cancellation | Offensive run, personal Prowess drain, terminal chord retained. |
| **EJECT** | Existing `flightEject down:true` | `down:false` on legitimate release, `cancel:true` on pointer cancellation | Authoritative clearance, inherited velocity and lifecycle. |

**Important:** `flightHop` is a discrete command deliberately independent of heartbeat timing; a 70 ms tap cannot disappear between movement packets. A press is not an auto-repeat. Do not send `input.jump=true` with a mobile Hop. The mobile Rise control sends `flightRise` independently of `jump`; the mobile Lower control sends `flightLower` independently of `crouch`. The explicit values are accepted only while driving Fight-and-Flight.

**Desktop compatibility:** Space maps to legacy held `input.jump`. Edge on ground produces a physical hop; remaining held for 0.23 s engages sustained ascent; a release before then turns the rotor off and preserves the ballistic hop. Crouch maps to existing Lower behavior. Existing mounted LMB/RMB, Skill, Chivalry, Dash and Eject bindings are unchanged.

**Safety:** An input heartbeat with no Rise/Lower immediately releases vertical intent. Authoritative packets older than 0.5 simulated seconds are not allowed to preserve held vertical commands. InputController/TouchControls must still release pointer-held sources on `pointercancel`, blur, visibility loss, death, UI pause, and dismount. These safety releases are complementary to the server timeout, not substitutes for it. New buttons must participate in multi-touch bookkeeping and share this policy with the existing Dash, fire and eject controls.

**Priority:** Terminal Dive > death/dismount > emergency ejection brake > Lower > Rise > neutral hover. Hop is valid only on grounded intact machine. No new resources; rotor HP/rotor kinetic energy and charge retain distinct purposes.

**Do not silently change v2.6 geometry or widen physical crossbow limits.** The separately approved v2.7 GLB, Issue #299 and its joint transforms belong in the subsequent model integration PR.

## Required mobile acceptance by Antigravity
Touch **JUMP** once, witness ballistic apex/landing while keeping Rise untouched; touch **RISE** and verify climbing continuously, release and verify neutral hover; touch **LOWER** once and verify immediate descending velocity, hold to descend, release to stabilize. Simulate `pointercancel` and loss of focus during Rise and verify no stale upward command survives. Repeat with depleted charge and compromised rotor. Use visible screen capture and assert live authoritative snapshot state, not only button cosmetics. Browser touch emulation should use CDP `Input.dispatchTouchEvent`, and desktop via real key events. Report actual recordings and authoritative traces.
