# Independent BiBye weapons

Objective: extend the merged PR 218 foundation in a focused followup draft with independent upper firing, deterministic mechanical coupling, independent authoritative clocks and concurrent presentation. Preserve damage, movement and projectile combat values.

## Asset boundary

Supplied v3.3 SHA256 f993ccfe6279a8cac0335508b4aca233b6a3257b825cce1be28dd15c4f09d0e0 retains the standing station and tests the upper only through 70 degrees each side. Final seated, full circle authored asset is pending. Do not describe that acceptance test as complete. Keep v3.2 rollback. Do not expand the main traverse beyond its current 45 degrees until final geometry validation.

## Implementation sequence

1. Test independent release and clocks, alignment, interruption and damage scenarios. Implement a small weapon mechanism module with explicit transitions and shared pose helpers.
2. Integrate mechanism with authoritative vehicle movement, damage and wire commands. Focus is server owned; input carries aim without changing body heading. No standalone heavy command.
3. Add rebindable focus control and contextual touch control. Show both readiness clocks and coupling progress. Cancel pending alignment by switching to upper or packing.
4. Split upper animation tracks from main and supports. Reconstruct from authoritative time. Match camera and muzzle to selected weapon and composed model pivots.
5. Inspect damaged meshes and supplied audio, select suitable cues, preserve sound lifecycle and deduplication.
6. Verify focused and full suites, browser controls, exported HTML5 and network behavior. Record actual timing and remaining geometry limitations.
7. Push the existing draft branch with a truthful handoff. No merge, deployment, publication or unsolicited code review.

## State design

Carriage heading, main world yaw/pitch and upper world yaw/pitch are independent. Compatibility yaw/pitch describe the selected weapon for camera/input consumers. Upper aim uses wrapped shortest rotation with a bounded rate; the pending coupled aim is frozen at request. Alignment targets that main aim, then a short latch engagement precedes commitment. Upper release trips heavy release after 0.2 seconds. Cancellation before upper discharge returns loaded ammunition. After discharge, operator interruption preserves the mechanical heavy release; structural support failure cancels it. Heavy readiness is commitment plus 6.7 seconds; upper readiness is actual discharge plus 2.5 seconds. No mode or focus path changes these clocks.

Per creator clarification, the server supports full circle independently of asset loading. The current model remains a temporary visual candidate with unverified clearance. Retain its standing station until the authored seat arrives. Actual seating and final coupling animation acceptance remain pending.

## Delivered controller stage

Implemented and browser verified. Full verification passes with 1,665 tests plus 19 HTML5/release tests and smoke. Evidence and repeatable input scripts are saved under docs/evidence/bibye-independent and scripts/bibye-independent*.js. Main and upper clocks, real host interruption and ordinary target convergence are covered. Event deadlines were corrected after browser observation revealed that tick arrival could otherwise widen the heavy delay. Final model work remains explicitly deferred per the creator clarification.
