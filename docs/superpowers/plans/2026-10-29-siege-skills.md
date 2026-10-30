# Siege Machine Skills Implementation Plan

Goal: playable authoritative Bolt to the Occasion and Beat to the Punch, plus a truthful Fight and Flight integration contract.
Architecture: small machine owned Skill clock/phase object; existing machine modules own physics and ammunition. Dedicated siegeSkill command and rebindable U input, separate touch button. No changes to personal Ultimate or normal attacks.
Spec: docs/siege-machine-skills/README.md plus October 29 creator handoff.

1. Add machine clocks and ownership validation with failing authority tests. Preserve clocks across handoffs; cancel active states on operator loss without refunds.
2. Ballista: schedule an independent heavy release after a short actual release animation, use current main muzzle and aim constraints even mobile, consume loaded ammunition and retain ordinary reload clocks. Reject conflicting coupling and upper releases.
3. Ram: finite priming, real reach trigger/chassis bait; smoothly retract from current offset before a new authoritative outward stroke; reuse normal contact/obstacle/structure logic. Add reverse charge with pressure use and cooldown expense.
4. Wire/snapshot, dedicated input and compact HUD/touch feedback, renderer shudder and independent heavy presentation.
5. Targeted regressions, actual local desktop/touch controls and network replication check, HTML5 checks. Update canonical decisions and clearly separate unimplemented flight contract. Draft PR only.

Provisional values centralized: heavy cooldown 24s, release .2s; ram cooldown 24s, prime 6s, chassis damage threshold 35, reverse charge 8m/s with 1.5s cooldown debt per second. Heavy motion remains constrained to existing main traverse. Flight is contract only until real apparatus integration.
