# Castleward — Oubloodlet, sword techniques, shields and Gale design notes
**Captured:** 2026-11-07  
**Status:** Creator-directed design record. **Do not assume these features are implemented or balance-approved.** This documentation-only branch does not replace ongoing draft gameplay/level PRs #401–#403 and #408–#410. Do not merge or deploy without review.

## Oubloodlet — proposed dungeon map
- **Accepted name:** **Oubloodlet** (not Oubloodlette); pun on *oubliette* (forgotten prisoner pit) and *bloodletting*. Pronunciation may be tuned later.
- **Core architecture:** an enclosed vertical prison-fortress around a vast central oubliette, not a featureless corridor maze; deliberate sightlines, meaningful height, recognizable architecture and several traversable levels.
- **Upper Ward — The Watch:** barred cells, staircases, wide observation galleries, overlook and ambush positions.
- **Middle Ward — The Crossing:** narrow steel/timber bridges, hanging cages, chains/hoists, precarious crossing paths above the shaft, notably interesting for sword knockback, shield bashes and Gale Garner.
- **Lower Ward — The Forgotten:** damp stone passages, damaged prison cells, drainage, recoverable lower platforms and alternate routes returning upward.
- **The Bloodlet — The Pit:** the truly lethal bottommost drop; not every fall should be fatal. The key mechanic is **height as a tactical resource**: a fall can displace a player to a lower combat level and force a risky return, not just kill them.
- Provide at least two viable routes between significant levels. Consider suspended cages, an operable hoist and a small number of genuinely destructible timber crossings **only if** server-authoritative geometry, bots and recovery paths support them.
- Suggested modes: Duel, Free-for-All, Bot Duel, potentially a separate carefully validated Edge of Victory layout. Not the default large-siege vehicle map.
- **Map-specific Spellblade line (approved wording):** “HAHA! GOOD LUCK FORGETTING ME!” Particularly funny when shouted while falling. Possible sequel after an audible fall from below: “I'M STILL HERE!” (sequel is a proposal, not approved recording).
- Optional dungeon inscription: “Those Forgotten Shall Be Remembered for Their Defeat.” (suggestion, not canon).
- Preserve Castleward's steel/brass/crimson language, physical collision, true vertical travel, and strong visual readability; avoid fake corridors or automatic death for every pit.

## The Spellblade's equipment philosophy
- **One equipped spell is intentional**: each deployed Spellblade believes the particular chosen spell is perfect, sufficient, or obviously the correct choice. His conviction rather than an inability to cast explains the constraint; humorous in-universe characterization, with the creator's exact canon framing still evolving.
- Spells & Chivalry briefly demonstrates he can use other prepared spells and perform unusually concurrent sword/guard/spell actions; on expiration he returns to one chosen spell. This should remain mechanically and comedically meaningful.
- Dennis (Comedy Club friend's feedback) observed the important danger that *ordinary attacks might be a “waiting room for the cool stuff.”* Preserve this as a playtesting/design warning: enhance ordinary sword contact legibility, meaningful neutral-game decisions, parry/guard positioning, physical consequences and reward for tactical timing. Merely adding more cooldown buttons can worsen the problem.
- Proposed future **second Armory slot: one selected Sword Technique**, independent of the one spell and the Ultimate. Input, animation, balance and implementation remain subject to testing.

## Sword Technique candidates — not yet implemented
### Rigid Riposte
- Committed forward sword thrust/lunge, potentially slightly farther than ordinary Dash.
- Incoming attacks that **actually intersect its valid startup interception trajectory** are parried; overhead attacks can meet specified Guard coverage. No generic invulnerability.
- Other sword users must **parry**, rather than merely hold ordinary sword Guard; physically raised shields should still block a real thrust.
- Proposed ~20–25 damage, ~10-second cooldown; provisional 5.5–6 m lunge is a discussion starting point, not settled.
- Airborne activation consumes the ordinary Dash; avoid stacking unlimited movement. Restrict post-commit steering; legitimate sidesteps, counterparries and blade-on-blade clashes must work.

### Whirl Like the Wind
- One default 360° mobile sword sweep, normal sword blade contact and actual directional Guard **only where the rotating blade physically intercepts an attack**. The rest of the knight is exposed.
- Optional **hold to sustain rotations by spending accumulated Ultimate/Prowess energy**, not a free extended Vortex. Stagger **does not drain normally while continuously spinning**; further impacts can still trigger a real stagger break.
- Release or exhausted Prowess ends the extra rotations with normal recovery. Proposed ~8–12-second cooldown, start testing ~10 seconds.
- **Gale Garner synergy:** casting Gale downward while using Whirl can lift the Spellblade consistent with Gale's real world/ground recoil; use actual cooldown, physics, geometry and overlapping-action rules, not a fake free jump.
- Separate clearly from **Blazing Vortex**: Whirl is a primarily single-turn controllable martial technique with paid extension; Vortex is an eight-second, fire-projecting Ultimate transformation.
- During Spells & Chivalry, the equipped sword technique may combine with legal concurrent spell/Guard/movement actions, but one physical sword must not deliver two independent, simultaneous strike paths.

## Gale Garner's increasingly deliberate physical identity
- Existing spell has **Balanced, Burst, Sustained** profiles, aerial use, directional terrain recoil, windbox carry/lift and projectile deflection; low nominal damage is an identity and trade-off, not automatically a deficit.
- Burst: brief powerful displacement; Balanced: general push; Sustained: lower initial impulse but longer carry/control. Preserve correct exposed duration, positional dependence and interruption.
- Full Gale infusion in **All-Natural Disaster** enables the aerial form (wave after an airborne windup); Full Lightning supplies a different teleportation option. Distinct *forms of action* matter more than equal elemental bonus damage.
- Genuine design risk: utility synergy (sword setups, knockback, aerial movement, trajectory manipulation, Whirl ascent, Ultimate variant) can overpower ordinary damage spells despite low direct damage. Retain geometry, commitment, Guard and positioning counterplay.
- The All-Natural Disaster visuals and animation remain in development; distinct grounded and Full-Gale airborne reads are important.

## Physical shields — exploratory equipment design
- **Heater shield:** medium steel/brass/crimson battle shield for physical Guard, Bash, thrown shield, ricochet and catch, possible shield-sledding when sprinting into crouch downhill.
- **Pavise:** large plantable/carryable siege shield, broad crouched frontal protection, potential terrain-grounded resistance to direct lightning and direct fireball impact; attacks wrapping around its edges can still damage the knight. Aim for real geometry and coverage, not arbitrary all-direction damage reduction.
- Lowered shield can **passively intercept only real incoming sword trajectories** that hit the actual held shield before the body. Raised Guard gives greater frontal coverage with visibility/position cost. A raised-shield Dash can become a committed shield charge; ordinary bash should have explicit configurable input, with optional context fallback.
- Ordinary enemy thrown shields can be blocked/dodged but not normally parried.
- **Spells & Chivalry shield interception:** if a thrown enemy shield would collide and satisfies the Ultimate's *legal parry conditions*, automatically parry **and catch/equip** the shield, retaining its current health and transferring ownership. Break the original owner's return; avoid duplication. If defender already carries one, drop old shield after a physically safe exchange. Do not claim this is already implemented. Correct physical contact, reach and collision order are mandatory.
- The recurring artistic point: same physical item participates in defense, locomotion and high-skill Ultimate techniques; no magical clones, unrealistic phase-through or visual collision cheats.

## Status / implementation guidance
These are design notes and candidate rules, not instructions to immediately insert features into live gameplay. Any implementation must be isolated, validated in authoritative simulation, integrated with desktop/touch inputs and existing game modes, and reviewed on a dedicated draft PR. Do not merge or deploy.
